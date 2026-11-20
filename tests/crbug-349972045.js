// crbug.com/349972045: "WebGPU Windows fails to fence some renderpass resources" (Windows / D3D12 + NVIDIA).
// Unity graphics tests 486-RenderReflectionProbeFromScript, 537-ReflectionProbes_DecodeHDR and
// 743-CullmodeAndWinding are disabled on WebGPU because of it. Reported failing on GeForce GTX 970, RTX 2080 and
// RTX 3080; passing on AMD, Apple (Metal), ChromeOS and with --enable-dawn-backend-validation (timing dependent).
//
// Reconstruction of the original reproducer from the bug description (the attachment is not available):
//   For each cube face: clear a shared 2D texture to the face's color (a clear-only render pass), then blit that
//   2D texture onto the face view of a cube texture in a second render pass. After the work is done, copy the cube
//   texture into a buffer, map it and check that every face has its own color.
// Without correct synchronization, the clear for face N+1 can overwrite the shared 2D texture while the blit for
// face N is still reading it, so faces end up with the wrong (usually the next face's) color.
// The race is timing dependent, so the check runs several variants (texture sizes, one submit vs. one per face).
WGR.register({
  id: 'crbug-349972045',
  section: 'bugs',
  group: 'Chrome / Chromium',
  engine: 'blink',
  bug: 'https://crbug.com/349972045',
  title: WGR.tr('Render passes not synchronized on Windows + NVIDIA (cube map faces rendered via a shared texture)',
    'Render passit eivät synkronoidu Windowsissa NVIDIA-näytönohjaimilla (kuutiokartan sivut renderöity jaetun tekstuurin kautta)'),
  timeout: 30000,
  async run(ctx, r) {
    const tr = WGR.tr;
    const affectedPlatform = ctx.isEngine('blink') && ctx.browser.os === 'Windows' && /nvidia/.test(ctx.gpuIdentity());
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }

    const FACE_COLORS = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255]];
    const FACE_NAMES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var src: texture_2d<f32>;
        @group(0) @binding(1) var samp: sampler;
        struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
        @vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
          var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
          var o: VOut;
          o.pos = vec4f(p[i], 0.0, 1.0);
          o.uv = vec2f(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5);
          return o;
        }
        @fragment fn fs(v: VOut) -> @location(0) vec4f { return textureSample(src, samp, v.uv); }`,
    });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
    });
    const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

    // Runs one variant of the reproducer. Returns a list of {face, wrongPixels, sample} for faces with wrong colors.
    const runVariant = async (size, submitPerFace) => {
      const src = device.createTexture({
        size: [size, size], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      const cube = device.createTexture({
        size: [size, size, 6], format: 'rgba8unorm', textureBindingViewDimension: 'cube',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
      });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: src.createView() }, { binding: 1, resource: sampler }],
      });

      let enc = device.createCommandEncoder();
      for (let face = 0; face < 6; ++face) {
        // 1) Clear the shared 2D texture to this face's color.
        const c = FACE_COLORS[face].map(v => v / 255);
        enc.beginRenderPass({
          colorAttachments: [{ view: src.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [c[0], c[1], c[2], 1] }],
        }).end();
        // 2) Blit the 2D texture onto the cube face.
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: cube.createView({ dimension: '2d', baseArrayLayer: face, arrayLayerCount: 1 }),
            loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0],
          }],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        if (submitPerFace) { device.queue.submit([enc.finish()]); enc = device.createCommandEncoder(); }
      }
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();

      // Copy the whole cube texture into a buffer and check every pixel of every face.
      const bytesPerRow = Math.ceil(size * 4 / 256) * 256;
      const faceBytes = bytesPerRow * size;
      const buf = device.createBuffer({ size: faceBytes * 6, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      const copyEnc = device.createCommandEncoder();
      copyEnc.copyTextureToBuffer({ texture: cube }, { buffer: buf, bytesPerRow, rowsPerImage: size }, [size, size, 6]);
      device.queue.submit([copyEnc.finish()]);
      const data = new Uint8Array(await WGR.readBuffer(device, buf, faceBytes * 6, 0, 10000));
      buf.destroy(); src.destroy(); cube.destroy();

      const bad = [];
      for (let face = 0; face < 6; ++face) {
        const [er, eg, eb] = FACE_COLORS[face];
        let wrong = 0, sample = null;
        for (let y = 0; y < size; ++y) {
          let o = face * faceBytes + y * bytesPerRow;
          for (let x = 0; x < size; ++x, o += 4) {
            if (data[o] !== er || data[o + 1] !== eg || data[o + 2] !== eb || data[o + 3] !== 255) {
              if (!sample) sample = [data[o], data[o + 1], data[o + 2], data[o + 3]];
              ++wrong;
            }
          }
        }
        if (wrong) bad.push({ face, wrong, sample });
      }
      return bad;
    };

    const variants = [];
    for (const size of [64, 512, 1024]) {
      for (const submitPerFace of [false, true]) variants.push({ size, submitPerFace });
    }
    const REPEATS = 2;
    let failures = 0;
    for (const v of variants) {
      const label = tr(`${v.size}×${v.size}, ${v.submitPerFace ? 'one submit per face' : 'single submit'}`,
        `${v.size}×${v.size}, ${v.submitPerFace ? 'yksi submit per sivu' : 'yksi submit'}`);
      let bad = [], scope = null;
      for (let rep = 0; rep < REPEATS && !bad.length; ++rep) {
        scope = await WGR.errorScope(device, async () => { bad = await runVariant(v.size, v.submitPerFace); });
        if (scope.exception || scope.errors.length) break;
      }
      if (scope.exception || scope.errors.length) {
        ++failures;
        r.field(label, tr('error', 'virhe'));
        r.error(tr(`${label}: the test could not run: ${WGR.describeErrors(scope)}`,
          `${label}: testiä ei voitu suorittaa: ${WGR.describeErrors(scope)}`));
      } else if (bad.length) {
        ++failures;
        const total = v.size * v.size;
        r.field(label, tr(`${bad.length} of 6 faces wrong`, `${bad.length}/6 sivua väärin`));
        for (const b of bad) {
          const s = b.sample, exp = FACE_COLORS[b.face];
          const matchFace = FACE_COLORS.findIndex(c => c[0] === s[0] && c[1] === s[1] && c[2] === s[2]);
          const fromFace = matchFace >= 0 ? tr(` (the color of face ${FACE_NAMES[matchFace]})`, ` (sivun ${FACE_NAMES[matchFace]} väri)`) : '';
          r.error(tr(`${label}: face ${FACE_NAMES[b.face]} has ${b.wrong} of ${total} pixels wrong, e.g. (${s.join(',')}) instead of (${exp.join(',')},255)${fromFace}.`,
            `${label}: sivulla ${FACE_NAMES[b.face]} on ${b.wrong}/${total} pikseliä väärin, esim. (${s.join(',')}) eikä (${exp.join(',')},255)${fromFace}.`));
        }
      } else {
        r.field(label, 'OK');
      }
    }

    if (!failures) {
      r.pass(tr('Each cube map face received its own color: render passes that reuse the same texture are synchronized correctly.',
        'Jokainen kuutiokartan sivu sai oman värinsä: samaa tekstuuria uudelleenkäyttävät render passit synkronoituvat oikein.'));
      if (affectedPlatform) {
        r.info(tr('Chrome on Windows with NVIDIA GPUs has a known, timing-dependent synchronization issue that breaks reflection probes in games. '
          + 'It did not reproduce in this run, but it may still occur in more complex scenes.',
          'Chromessa on Windowsissa NVIDIA-näytönohjaimilla tunnettu, ajoituksesta riippuva synkronointiongelma, joka rikkoo pelien heijastusluotaimet (reflection probes). '
          + 'Ongelma ei toistunut tällä ajokerralla, mutta se voi silti ilmetä monimutkaisemmissa näkymissä.'));
      }
    } else {
      r.error(tr('Render passes that write and then read the same texture are not synchronized correctly. '
        + 'Reflections, reflection probes and other render-to-texture effects in games may show wrong colors.',
        'Render passit, jotka kirjoittavat ja sitten lukevat samaa tekstuuria, eivät synkronoidu oikein. '
        + 'Pelien heijastukset, heijastusluotaimet ja muut tekstuuriin renderöivät efektit voivat näyttää vääriä värejä.')
        + (affectedPlatform ? tr(' This matches a known Chrome issue on Windows with NVIDIA GPUs.',
          ' Tämä vastaa tunnettua Chromen ongelmaa Windowsissa NVIDIA-näytönohjaimilla.') : ''));
    }
  },
});
