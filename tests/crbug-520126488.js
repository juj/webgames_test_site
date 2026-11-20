// crbug.com/520126488: GPU out-of-memory errors and grayscale rendering on Imagination GPUs
// (IMG BXM-8-256 in Moto G56, PowerVR DXT-48 in Pixel 10 / 10 Pro / 10 Pro XL).
// The check renders a known color to rgba8unorm and bgra8unorm targets and verifies it is not grayscale,
// and allocates a moderate amount of GPU memory to check for spurious out-of-memory errors.
WGR.register({
  id: 'crbug-520126488',
  section: 'bugs',
  group: 'Chrome / Chromium',
  engine: 'blink',
  bug: 'https://crbug.com/520126488',
  title: WGR.tr('GPU out-of-memory and grayscale rendering on Imagination (PowerVR / IMG) GPUs',
    'Näytönohjaimen muisti loppuu ja kuva renderöityy harmaasävyisenä Imagination (PowerVR / IMG) -näytönohjaimilla'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const id = ctx.gpuIdentity();
    const isImg = /powervr|img-tec|imagination|\bimg\b|bxm-|dxt-/.test(id);
    const device = await ctx.getDevice();
    if (!device) {
      if (isImg) {
        r.warn(tr('This device has an Imagination GPU, which is affected by a known Chromium issue, but WebGPU is not available to test it.',
          'Tässä laitteessa on Imagination-näytönohjain, jota koskee tunnettu Chromium-ongelma, mutta WebGPU ei ole käytettävissä sen testaamiseen.'));
      } else {
        r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.'));
      }
      return;
    }

    // --- Color rendering test ---
    const W = 4, H = 4;
    const expected = [230, 128, 26]; // vec4(0.9, 0.5, 0.1)
    const module = device.createShaderModule({
      code: `
        @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
          var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
          return vec4f(p[i], 0.0, 1.0);
        }
        @fragment fn fs() -> @location(0) vec4f { return vec4f(0.9, 0.5, 0.1, 1.0); }`,
    });
    let colorOk = true;
    for (const format of ['rgba8unorm', 'bgra8unorm']) {
      let px = null;
      const scope = await WGR.errorScope(device, async () => {
        const tex = device.createTexture({ size: [W, H], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
        const pipeline = device.createRenderPipeline({
          layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] },
        });
        const enc = device.createCommandEncoder();
        const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' }] });
        pass.setPipeline(pipeline);
        pass.draw(3);
        pass.end();
        device.queue.submit([enc.finish()]);
        px = await WGR.readTexture(device, tex, W, H);
        tex.destroy();
      });
      if (scope.exception || scope.errors.length || !px) {
        colorOk = false;
        r.error(tr(`Rendering to a ${format} texture failed: ${WGR.describeErrors(scope)}`,
          `Renderöinti ${format}-tekstuuriin epäonnistui: ${WGR.describeErrors(scope)}`));
        continue;
      }
      const rgb = format === 'bgra8unorm' ? [px[2], px[1], px[0]] : [px[0], px[1], px[2]];
      r.field(tr(`${format} result (RGB)`, `${format}-tulos (RGB)`), tr(`${rgb.join(', ')} (expected ${expected.join(', ')})`, `${rgb.join(', ')} (odotettu ${expected.join(', ')})`));
      const close = rgb.every((v, i) => Math.abs(v - expected[i]) <= 2);
      const gray = Math.abs(rgb[0] - rgb[1]) < 8 && Math.abs(rgb[1] - rgb[2]) < 8;
      if (gray && rgb.some(v => v > 0)) {
        colorOk = false;
        r.error(tr(`Rendering to ${format} produced a grayscale result instead of color. Games will render in black and white.`,
          `Renderöinti ${format}-formaattiin tuotti harmaasävyisen tuloksen värillisen sijaan. Pelit näkyvät mustavalkoisina.`));
      } else if (!close) {
        colorOk = false;
        if (rgb.every(v => v === 0)) {
          r.warn(tr(`Reading back the ${format} render target returned only zeros, so the color output could not be verified (see the mapAsync checks).`,
            `${format}-renderöintikohteen lukeminen takaisin palautti pelkkiä nollia, joten väritulosta ei voitu varmistaa (katso mapAsync-tarkistukset).`));
        } else {
          r.error(tr(`Rendering to ${format} produced incorrect colors.`, `Renderöinti ${format}-formaattiin tuotti vääriä värejä.`));
        }
      }
    }
    if (colorOk) r.pass(tr('Rendered colors are correct (no grayscale output).', 'Renderöidyt värit ovat oikein (ei harmaasävytulosta).'));

    // --- Memory allocation test: 4 x 32 MB buffers ---
    const buffers = [];
    const mem = await WGR.errorScope(device, async () => {
      for (let i = 0; i < 4; ++i) {
        const b = device.createBuffer({ size: 32 * 1024 * 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(b, 0, new Uint32Array(1024).fill(i));
        buffers.push(b);
      }
      await device.queue.onSubmittedWorkDone();
    });
    buffers.forEach(b => b.destroy());
    if (mem.errors.some(e => e.type === 'out-of-memory')) {
      r.error(tr('Allocating 128 MB of GPU buffers failed with an out-of-memory error. Most WebGPU games need considerably more GPU memory than this.',
        '128 Mt:n näytönohjainpuskurien varaaminen epäonnistui muistin loppumiseen (out-of-memory). Useimmat WebGPU-pelit tarvitsevat huomattavasti enemmän näytönohjaimen muistia.'));
    } else if (mem.exception || mem.errors.length) {
      r.error(tr(`Allocating 128 MB of GPU buffers failed: ${WGR.describeErrors(mem)}`,
        `128 Mt:n näytönohjainpuskurien varaaminen epäonnistui: ${WGR.describeErrors(mem)}`));
    } else {
      r.pass(tr('Allocating 128 MB of GPU memory succeeded without out-of-memory errors.',
        '128 Mt:n näytönohjainmuistin varaaminen onnistui ilman muistin loppumisvirheitä.'));
    }

    if (isImg) {
      r.warn(tr('This device has an Imagination (PowerVR / IMG) GPU. Chrome has a known issue on these GPUs where games run out of GPU memory '
        + 'and render in grayscale. The simple tests above may pass even when larger games are affected.',
        'Tässä laitteessa on Imagination (PowerVR / IMG) -näytönohjain. Chromessa on näillä näytönohjaimilla tunnettu ongelma, jossa pelien näytönohjainmuisti loppuu '
        + 'ja kuva renderöityy harmaasävyisenä. Yllä olevat yksinkertaiset testit voivat mennä läpi, vaikka ongelma koskisi suurempia pelejä.'));
    } else {
      r.info(tr('This device does not use an Imagination GPU; the tests above were run as a general sanity check.',
        'Tässä laitteessa ei ole Imagination-näytönohjainta; yllä olevat testit suoritettiin yleisenä toimivuustarkistuksena.'));
    }
  },
});
