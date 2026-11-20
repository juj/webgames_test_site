// bugzil.la/2023425: Unbinding a vertex buffer with setVertexBuffer(slot, null) does not work.
WGR.register({
  id: 'firefox-2023425',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/2023425',
  title: WGR.tr('Unbinding a vertex buffer with setVertexBuffer(slot, null)', 'Verteksipuskurin sidonnan poistaminen kutsulla setVertexBuffer(slot, null)'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }
    const scope = await WGR.errorScope(device, async () => {
      const vb = device.createBuffer({ size: 64, usage: GPUBufferUsage.VERTEX });
      const tex = device.createTexture({ size: [4, 4], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      pass.setVertexBuffer(0, vb);
      pass.setVertexBuffer(0, null);
      pass.end();
      // Also test in a render bundle.
      const be = device.createRenderBundleEncoder({ colorFormats: ['rgba8unorm'] });
      be.setVertexBuffer(0, vb);
      be.setVertexBuffer(0, null);
      be.finish();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      vb.destroy(); tex.destroy();
    });
    if (!scope.exception && !scope.errors.length) {
      r.pass(tr('Vertex buffers can be unbound with setVertexBuffer(slot, null).',
        'Verteksipuskurien sidonnan voi poistaa kutsulla setVertexBuffer(slot, null).'));
    } else {
      r.warn(tr(`setVertexBuffer(slot, null) failed: ${WGR.describeErrors(scope)}. Games that unbind vertex buffers may hit errors or render incorrectly.`,
        `setVertexBuffer(slot, null) epäonnistui: ${WGR.describeErrors(scope)}. Pelit, jotka poistavat verteksipuskurien sidontoja, voivat kohdata virheitä tai renderöidä väärin.`)
        + (ctx.isEngine('gecko') ? tr(' This matches a known Firefox bug.', ' Tämä vastaa tunnettua Firefox-bugia.') : ''));
    }
  },
});
