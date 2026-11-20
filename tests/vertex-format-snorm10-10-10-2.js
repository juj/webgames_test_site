// "snorm10-10-10-2" vertex format (gpuweb/gpuweb#6491, fixes gpuweb#6292; merged to the spec in August 2026).
// A signed counterpart of "unorm10-10-10-2": 4 bytes per vertex holding x/y/z as 10-bit and w as 2-bit signed
// normalized integers. Games use it to compactly store normals and tangents (w = bitangent sign).
// It is part of core WebGPU (no optional feature to enable), so an outdated browser rejects the enum value; that is
// reported as an error.
//
// The check creates a render pipeline using the format and, if that succeeds, draws one point per test vertex into
// an rgba32float target and verifies that the attribute is decoded correctly.
WGR.register({
  id: 'vertex-format-snorm10-10-10-2',
  section: 'features',
  bug: 'https://bugzil.la/2067853',
  title: WGR.tr('Vertex format "snorm10-10-10-2"', 'Verteksiformaatti "snorm10-10-10-2"'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }

    // Packing: x = bits 0..9, y = bits 10..19, z = bits 20..29, w = bits 30..31 (two's complement).
    // Decoding: max(v / (2^(n-1) - 1), -1), so the most negative value also maps to -1.
    const pack = (x, y, z, w) => ((x & 0x3ff) | ((y & 0x3ff) << 10) | ((z & 0x3ff) << 20) | ((w & 0x3) << 30)) >>> 0;
    const snorm = (v, bits) => Math.max(v / ((1 << (bits - 1)) - 1), -1);
    const INPUTS = [
      [511, -511, 0, 1],      // 1, -1, 0, 1
      [-512, 256, -256, -1],  // -1 (clamped), ~0.5, ~-0.5, -1
      [1, -1, 100, -2],       // tiny values, w = -2 clamps to -1
      [0, 0, 0, 0],
    ];
    const N = INPUTS.length;
    const expected = INPUTS.map(([x, y, z, w]) => [snorm(x, 10), snorm(y, 10), snorm(z, 10), snorm(w, 2)]);

    const module = device.createShaderModule({
      code: `
        struct VOut { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) v: vec4f };
        @vertex fn vs(@builtin(vertex_index) i: u32, @location(0) a: vec4f) -> VOut {
          var o: VOut;
          o.pos = vec4f((f32(i) + 0.5) / ${N}.0 * 2.0 - 1.0, 0.0, 0.0, 1.0);
          o.v = a;
          return o;
        }
        @fragment fn fs(v: VOut) -> @location(0) vec4f { return v.v; }`,
    });

    let pipeline = null;
    const scope = await WGR.errorScope(device, () => {
      pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module, entryPoint: 'vs',
          buffers: [{ arrayStride: 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'snorm10-10-10-2' }] }],
        },
        fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba32float' }] },
        primitive: { topology: 'point-list' },
      });
    });
    if (scope.exception || scope.errors.length) {
      r.field(tr('Pipeline creation', 'Pipelinen luonti'), WGR.describeErrors(scope));
      r.error(tr('The "snorm10-10-10-2" vertex format is not supported, so this browser is not up to date with the WebGPU specification. '
        + 'Games that store normals or tangents in this format will fail to load. Update your browser to the latest version.',
        '"snorm10-10-10-2"-verteksiformaattia ei tueta, joten tämä selain ei ole ajan tasalla WebGPU-määrittelyn kanssa. '
        + 'Pelit, jotka tallentavat normaalit tai tangentit tässä formaatissa, eivät lataudu. Päivitä selaimesi uusimpaan versioon.'));
      return;
    }

    // Draw the test vertices and read the decoded values back.
    let values = null;
    const drawScope = await WGR.errorScope(device, async () => {
      const vb = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
      new Uint32Array(vb.getMappedRange()).set(INPUTS.map(v => pack(...v)));
      vb.unmap();
      const target = device.createTexture({
        size: [N, 1], format: 'rgba32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      const out = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [9, 9, 9, 9] }],
      });
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, vb);
      pass.draw(N);
      pass.end();
      enc.copyTextureToBuffer({ texture: target }, { buffer: out, bytesPerRow: 256 }, [N, 1]);
      device.queue.submit([enc.finish()]);
      values = new Float32Array(await WGR.readBuffer(device, out, N * 16));
      vb.destroy(); target.destroy(); out.destroy();
    });
    if (drawScope.exception || drawScope.errors.length || !values) {
      r.error(tr(`A pipeline with "snorm10-10-10-2" was created, but drawing with it failed: ${WGR.describeErrors(drawScope)}`,
        `"snorm10-10-10-2"-pipeline luotiin, mutta sillä piirtäminen epäonnistui: ${WGR.describeErrors(drawScope)}`));
      return;
    }

    const fmt = a => '(' + Array.from(a, v => +v.toFixed(3)).join(', ') + ')';
    let wrong = 0;
    for (let i = 0; i < N; ++i) {
      const got = values.subarray(i * 4, i * 4 + 4);
      const ok = expected[i].every((e, c) => Math.abs(got[c] - e) < 1e-3);
      if (!ok) {
        ++wrong;
        r.field(tr(`Vertex ${i}`, `Verteksi ${i}`), tr(`${fmt(got)}, expected ${fmt(expected[i])}`, `${fmt(got)}, odotettiin ${fmt(expected[i])}`));
      }
    }
    if (wrong) {
      r.error(tr(`The "snorm10-10-10-2" vertex format is accepted, but ${wrong} of ${N} test vertices were decoded incorrectly. `
        + 'Games using it for normals or tangents may render with wrong lighting.',
        `"snorm10-10-10-2"-verteksiformaatti hyväksytään, mutta ${wrong}/${N} testiverteksiä purettiin väärin. `
        + 'Sitä normaaleihin tai tangentteihin käyttävät pelit voivat renderöidä väärällä valaistuksella.'));
    } else {
      r.info(tr('The "snorm10-10-10-2" vertex format is supported and decodes correctly. Games can store normals and tangents compactly in 4 bytes.',
        '"snorm10-10-10-2"-verteksiformaatti on tuettu ja purkautuu oikein. Pelit voivat tallentaa normaalit ja tangentit tiiviisti 4 tavuun.'));
    }
  },
});
