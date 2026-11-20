// crbug.com/519862908: QuerySets have issues on Chrome + macOS.
// Functionally tests occlusion queries, and timestamp queries when the feature is available.
WGR.register({
  id: 'crbug-519862908',
  section: 'bugs',
  group: 'Chrome / Chromium',
  engine: 'blink',
  bug: 'https://crbug.com/519862908',
  title: WGR.tr('Query sets (occlusion / timestamp queries) misbehave on Chrome + macOS',
    'Kyselyjoukot (peittokyselyt / aikaleimakyselyt) toimivat virheellisesti Chromessa macOS:llä'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const affectedPlatform = ctx.isEngine('blink') && ctx.browser.os === 'macOS';
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }
    let failed = false;

    // --- Occlusion queries: query 0 draws a full-screen triangle, query 1 draws nothing. ---
    let occ = null;
    const scope = await WGR.errorScope(device, async () => {
      const module = device.createShaderModule({
        code: `
          @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
            var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
            return vec4f(p[i], 0.0, 1.0);
          }
          @fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }`,
      });
      const pipeline = device.createRenderPipeline({
        layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
      });
      const tex = device.createTexture({ size: [16, 16], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      const qs = device.createQuerySet({ type: 'occlusion', count: 2 });
      const resolve = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        occlusionQuerySet: qs,
      });
      pass.setPipeline(pipeline);
      pass.beginOcclusionQuery(0); pass.draw(3); pass.endOcclusionQuery();
      pass.beginOcclusionQuery(1); pass.endOcclusionQuery();
      pass.end();
      enc.resolveQuerySet(qs, 0, 2, resolve, 0);
      device.queue.submit([enc.finish()]);
      occ = new BigUint64Array(await WGR.readBuffer(device, resolve, 16));
      qs.destroy(); resolve.destroy(); tex.destroy();
    });
    if (scope.exception || scope.errors.length || !occ) {
      failed = true;
      r.error(tr(`Occlusion queries failed: ${WGR.describeErrors(scope)}`, `Peittokyselyt epäonnistuivat: ${WGR.describeErrors(scope)}`));
    } else {
      r.field(tr('Occlusion query results', 'Peittokyselyjen tulokset'),
        tr(`${occ[0]} (visible draw), ${occ[1]} (no draw)`, `${occ[0]} (näkyvä piirto), ${occ[1]} (ei piirtoa)`));
      if (occ[0] > 0n && occ[1] === 0n) {
        r.pass(tr('Occlusion queries return correct results.', 'Peittokyselyt palauttavat oikeat tulokset.'));
      } else {
        failed = true;
        r.error(tr('Occlusion queries returned incorrect results. Games using occlusion culling may show missing or flickering objects.',
          'Peittokyselyt palauttivat vääriä tuloksia. Peittokarsintaa käyttävissä peleissä objekteja voi puuttua tai ne voivat välkkyä.'));
      }
    }

    // --- Timestamp queries ---
    if (!device.features.has('timestamp-query')) {
      r.na(tr('The "timestamp-query" feature is not available, so timestamp queries were not tested.',
        '"timestamp-query"-ominaisuus ei ole käytettävissä, joten aikaleimakyselyjä ei testattu.'));
    } else {
      let ts = null;
      const tsScope = await WGR.errorScope(device, async () => {
        const qs = device.createQuerySet({ type: 'timestamp', count: 2 });
        const resolve = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
        const module = device.createShaderModule({
          code: `@group(0) @binding(0) var<storage, read_write> o: array<u32>;
                 @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) { o[id.x] = id.x * 3u; }`,
        });
        const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
        const buf = device.createBuffer({ size: 64 * 64 * 4, usage: GPUBufferUsage.STORAGE });
        const bg = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });
        const enc = device.createCommandEncoder();
        const pass = enc.beginComputePass({ timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } });
        pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(64); pass.end();
        enc.resolveQuerySet(qs, 0, 2, resolve, 0);
        device.queue.submit([enc.finish()]);
        ts = new BigUint64Array(await WGR.readBuffer(device, resolve, 16));
        qs.destroy(); resolve.destroy(); buf.destroy();
      });
      if (tsScope.exception || tsScope.errors.length || !ts) {
        failed = true;
        r.error(tr(`Timestamp queries failed: ${WGR.describeErrors(tsScope)}`, `Aikaleimakyselyt epäonnistuivat: ${WGR.describeErrors(tsScope)}`));
      } else if (ts[1] < ts[0]) {
        failed = true;
        r.field(tr('Timestamp query results', 'Aikaleimakyselyjen tulokset'), `${ts[0]} → ${ts[1]}`);
        r.error(tr('Timestamp queries returned an end time earlier than the start time.',
          'Aikaleimakyselyt palauttivat lopetusajan, joka on aikaisempi kuin aloitusaika.'));
      } else {
        r.field(tr('Timestamp query results', 'Aikaleimakyselyjen tulokset'), `${ts[0]} → ${ts[1]} (${ts[1] - ts[0]} ns)`);
        r.pass(tr('Timestamp queries return plausible results.', 'Aikaleimakyselyt palauttavat uskottavia tuloksia.'));
      }
    }

    if (affectedPlatform) {
      if (failed) {
        r.error(tr('Query sets do not work correctly here. This matches a known Chrome on macOS issue.',
          'Kyselyjoukot eivät toimi oikein tässä ympäristössä. Tämä vastaa tunnettua Chromen macOS-ongelmaa.'));
      } else {
        r.info(tr('Query sets are known to have issues in Chrome on macOS; the basic tests above passed, but more complex usage may still be affected.',
          'Kyselyjoukoissa tiedetään olevan ongelmia Chromessa macOS:llä; yllä olevat perustestit menivät läpi, mutta monimutkaisempi käyttö voi silti kärsiä ongelmista.'));
      }
    }
  },
});
