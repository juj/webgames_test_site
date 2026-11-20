// bugzil.la/2023418: GPUBuffer.mapAsync() reads back zeros.
// A compute shader writes known values into a storage buffer, which is then copied into a MAP_READ buffer and mapped.
WGR.register({
  id: 'firefox-2023418',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/2023418',
  title: WGR.tr('GPUBuffer.mapAsync() reads back zeros after GPU writes', 'GPUBuffer.mapAsync() lukee nollia näytönohjaimen kirjoitusten jälkeen'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }
    const N = 4096;
    let data = null;
    const scope = await WGR.errorScope(device, async () => {
      const module = device.createShaderModule({
        code: `@group(0) @binding(0) var<storage, read_write> o: array<u32>;
               @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
                 if (id.x < arrayLength(&o)) { o[id.x] = id.x * 7u + 3u; }
               }`,
      });
      const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
      const buf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
      const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(N / 64); pass.end();
      device.queue.submit([enc.finish()]);
      data = new Uint32Array(await WGR.readBuffer(device, buf, N * 4));
      buf.destroy();
    });
    const ff = ctx.isEngine('gecko') ? tr(' This matches a known Firefox bug.', ' Tämä vastaa tunnettua Firefox-bugia.') : '';
    if (scope.exception || scope.errors.length || !data) {
      r.error(tr(`Reading back compute shader results failed: ${WGR.describeErrors(scope)}`,
        `Laskentavarjostimen tulosten lukeminen takaisin epäonnistui: ${WGR.describeErrors(scope)}`));
      return;
    }
    const bad = data.findIndex((v, i) => v !== i * 7 + 3);
    if (bad < 0) {
      r.pass(tr('Data written by a compute shader is read back correctly with mapAsync().',
        'Laskentavarjostimen kirjoittama data luetaan takaisin oikein mapAsync()-funktiolla.'));
    } else if (data.every(v => v === 0)) {
      r.error(tr('mapAsync() returned only zeros instead of the data written by the GPU. Games that read GPU results back will malfunction.',
        'mapAsync() palautti pelkkiä nollia näytönohjaimen kirjoittaman datan sijaan. Pelit, jotka lukevat tuloksia takaisin näytönohjaimelta, toimivat virheellisesti.') + ff);
    } else {
      r.error(tr(`mapAsync() returned wrong data (index ${bad}: got ${data[bad]}, expected ${bad * 7 + 3}).`,
        `mapAsync() palautti väärää dataa (indeksi ${bad}: saatiin ${data[bad]}, odotettiin ${bad * 7 + 3}).`) + ff);
    }
  },
});
