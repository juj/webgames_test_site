// bugzil.la/2023421: Saving object labels does not work. Labels only matter for developer debugging and error
// messages, so failures are reported as informational.
WGR.register({
  id: 'firefox-2023421',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/2023421',
  title: WGR.tr('WebGPU object labels are not saved', 'WebGPU-olioiden nimiöitä (label) ei tallenneta'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }
    const failures = [];
    const expect = (what, actual, expected) => {
      if (actual !== expected) {
        failures.push(tr(`${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
          `${what}: saatiin ${JSON.stringify(actual)}, odotettiin ${JSON.stringify(expected)}`));
      }
    };
    const fromDesc = tr('from descriptor', 'kuvaimesta');
    const afterAssign = tr('after assignment', 'asettamisen jälkeen');

    expect(`GPUDevice.label (${fromDesc})`, device.label, 'wgr-device');
    const buf = device.createBuffer({ label: 'wgr-buffer', size: 16, usage: GPUBufferUsage.COPY_DST });
    expect(`GPUBuffer.label (${fromDesc})`, buf.label, 'wgr-buffer');
    buf.label = 'wgr-buffer-renamed';
    expect(`GPUBuffer.label (${afterAssign})`, buf.label, 'wgr-buffer-renamed');
    buf.destroy();
    const tex = device.createTexture({ label: 'wgr-texture', size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING });
    expect(`GPUTexture.label (${fromDesc})`, tex.label, 'wgr-texture');
    tex.destroy();
    const enc = device.createCommandEncoder({ label: 'wgr-encoder' });
    expect(`GPUCommandEncoder.label (${fromDesc})`, enc.label, 'wgr-encoder');
    const queue = device.queue;
    queue.label = 'wgr-queue';
    expect(`GPUQueue.label (${afterAssign})`, queue.label, 'wgr-queue');

    if (!failures.length) {
      r.pass(tr('Object labels are stored and returned correctly.', 'Olioiden nimiöt tallennetaan ja palautetaan oikein.'));
    } else {
      for (const f of failures) r.info(f);
      r.info(tr('Object labels are not stored correctly. This only affects developer debugging and error messages, not gameplay.',
        'Olioiden nimiöitä ei tallenneta oikein. Tämä vaikuttaa vain kehittäjien virheenjäljitykseen ja virheilmoituksiin, ei pelaamiseen.')
        + (ctx.isEngine('gecko') ? tr(' This matches a known Firefox bug.', ' Tämä vastaa tunnettua Firefox-bugia.') : ''));
    }
  },
});
