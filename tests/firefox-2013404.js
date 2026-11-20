// bugzil.la/2013404: shader-f16 is broken in Firefox versions older than 157.
// Runs a compute shader that does f16 arithmetic and writes both f32 and f16 storage outputs.
WGR.register({
  id: 'firefox-2013404',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/2013404',
  title: WGR.tr('Broken shader-f16 in Firefox versions older than 157', 'Rikkinäinen shader-f16 Firefoxin versioissa, jotka ovat vanhempia kuin 157'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const ffOld = ctx.isEngine('gecko') && ctx.browser.version < 157;
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }
    if (!device.features.has('shader-f16')) {
      r.na(tr('The "shader-f16" feature is not exposed, so it cannot be tested (see the baseline features check).',
        '"shader-f16"-ominaisuutta ei tarjota, joten sitä ei voida testata (katso perusominaisuuksien tarkistus).'));
      return;
    }

    const N = 64;
    const input = new Float32Array(N).map((_, i) => i * 0.25);
    const expected = input.map(x => 3 * x + 1);
    const halfToFloat = (h) => {
      const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
      if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
      if (e === 31) return f ? NaN : s * Infinity;
      return s * Math.pow(2, e - 15) * (1 + f / 1024);
    };

    let out32 = null, out16 = null;
    const scope = await WGR.errorScope(device, async () => {
      const module = device.createShaderModule({
        code: `
          enable f16;
          @group(0) @binding(0) var<storage, read> inp: array<f32>;
          @group(0) @binding(1) var<storage, read_write> out32: array<f32>;
          @group(0) @binding(2) var<storage, read_write> out16: array<f16>;
          @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
            let i = id.x;
            if (i >= arrayLength(&inp)) { return; }
            let h = f16(inp[i]);
            let v = vec4<f16>(h, h * 2.0h, h + 0.5h, -h);
            let r = dot(v, vec4<f16>(1.0h, 0.5h, 2.0h, 1.0h)); // = 3h + 1
            out32[i] = f32(r);
            out16[i] = r;
          }`,
      });
      const info = await module.getCompilationInfo();
      const errs = info.messages.filter(m => m.type === 'error');
      if (errs.length) throw new Error(tr(`shader compilation failed: ${errs.map(m => m.message).join('; ')}`,
        `varjostimen kääntäminen epäonnistui: ${errs.map(m => m.message).join('; ')}`));
      const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
      const inBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      const o32 = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const o16 = device.createBuffer({ size: N * 2, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      device.queue.writeBuffer(inBuf, 0, input);
      const bg = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: o32 } }, { binding: 2, resource: { buffer: o16 } }],
      });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(1); pass.end();
      device.queue.submit([enc.finish()]);
      out32 = new Float32Array(await WGR.readBuffer(device, o32, N * 4));
      out16 = new Uint16Array(await WGR.readBuffer(device, o16, N * 2));
      inBuf.destroy(); o32.destroy(); o16.destroy();
    });

    let ok = false;
    if (scope.exception || scope.errors.length || !out32) {
      r.error(tr(`Running an f16 compute shader failed: ${WGR.describeErrors(scope)}`,
        `f16-laskentavarjostimen suorittaminen epäonnistui: ${WGR.describeErrors(scope)}`));
    } else {
      const bad32 = [...expected].findIndex((e, i) => Math.abs(out32[i] - e) > 1e-3);
      const bad16 = [...expected].findIndex((e, i) => Math.abs(halfToFloat(out16[i]) - e) > 1e-3);
      if (bad32 >= 0) {
        r.error(tr(`f16 arithmetic produced wrong results (index ${bad32}: got ${out32[bad32]}, expected ${expected[bad32]}).`,
          `f16-laskenta tuotti vääriä tuloksia (indeksi ${bad32}: saatiin ${out32[bad32]}, odotettiin ${expected[bad32]}).`));
      }
      if (bad16 >= 0) {
        r.error(tr(`f16 storage buffer writes produced wrong results (index ${bad16}: got ${halfToFloat(out16[bad16])}, expected ${expected[bad16]}).`,
          `f16-storage-puskuriin kirjoittaminen tuotti vääriä tuloksia (indeksi ${bad16}: saatiin ${halfToFloat(out16[bad16])}, odotettiin ${expected[bad16]}).`));
      }
      ok = bad32 < 0 && bad16 < 0;
      if (ok) r.pass(tr('f16 shader arithmetic and f16 storage buffers produce correct results.',
        'f16-varjostinlaskenta ja f16-storage-puskurit tuottavat oikeat tulokset.'));
    }

    if (ffOld) {
      const v = ctx.browser.version;
      if (ok) {
        r.warn(tr(`Firefox ${v} has known shader-f16 bugs (fixed in Firefox 157). The basic test passed, but games may disable f16 or render incorrectly. Please update Firefox.`,
          `Firefox ${v}:ssä on tunnettuja shader-f16-bugeja (korjattu Firefox 157:ssä). Perustesti meni läpi, mutta pelit voivat poistaa f16:n käytöstä tai renderöidä väärin. Päivitä Firefox.`));
      } else {
        r.error(tr(`This matches a known shader-f16 bug in Firefox ${v}. Please update to Firefox 157 or newer.`,
          `Tämä vastaa Firefox ${v}:n tunnettua shader-f16-bugia. Päivitä Firefox versioon 157 tai uudempaan.`));
      }
    }
  },
});
