// bugzil.la/1994733: GPUBuffer.mapAsync() broken in Firefox 151 and older.
// Tests mapAsync(READ), mapAsync(WRITE) and mappedAtCreation round trips, with a timeout in case mapAsync never resolves.
WGR.register({
  id: 'firefox-1994733',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/1994733',
  title: WGR.tr('GPUBuffer.mapAsync() broken in Firefox 151 and older', 'GPUBuffer.mapAsync() rikki Firefox 151:ssä ja vanhemmissa'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const ffOld = ctx.isEngine('gecko') && ctx.browser.version <= 151;
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }
    const N = 1024;
    const pattern = new Uint32Array(N).map((_, i) => (i * 2654435761) >>> 0);
    const failures = [];

    const check = (name, data) => {
      const bad = data.findIndex((v, i) => v !== pattern[i]);
      if (bad >= 0) {
        failures.push(tr(`${name}: wrong data at index ${bad} (got ${data[bad]}, expected ${pattern[bad]})`,
          `${name}: väärää dataa indeksissä ${bad} (saatiin ${data[bad]}, odotettiin ${pattern[bad]})`));
      }
    };

    // 1) writeBuffer -> copy -> mapAsync(READ)
    const s1 = await WGR.errorScope(device, async () => {
      const src = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(src, 0, pattern);
      check('mapAsync(READ)', new Uint32Array(await WGR.readBuffer(device, src, N * 4)));
      src.destroy();
    });
    if (s1.exception || s1.errors.length) failures.push(`mapAsync(READ): ${WGR.describeErrors(s1)}`);

    // 2) mapAsync(WRITE) -> unmap -> copy -> read back
    const s2 = await WGR.errorScope(device, async () => {
      const up = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC });
      await WGR.withTimeout(up.mapAsync(GPUMapMode.WRITE), 5000, 'mapAsync(WRITE)');
      new Uint32Array(up.getMappedRange()).set(pattern);
      up.unmap();
      check('mapAsync(WRITE)', new Uint32Array(await WGR.readBuffer(device, up, N * 4)));
      up.destroy();
    });
    if (s2.exception || s2.errors.length) failures.push(`mapAsync(WRITE): ${WGR.describeErrors(s2)}`);

    // 3) mappedAtCreation
    const s3 = await WGR.errorScope(device, async () => {
      const b = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.COPY_SRC, mappedAtCreation: true });
      new Uint32Array(b.getMappedRange()).set(pattern);
      b.unmap();
      check('mappedAtCreation', new Uint32Array(await WGR.readBuffer(device, b, N * 4)));
      b.destroy();
    });
    if (s3.exception || s3.errors.length) failures.push(`mappedAtCreation: ${WGR.describeErrors(s3)}`);

    const v = ctx.browser.version;
    if (!failures.length) {
      r.pass(tr('Buffer mapping (mapAsync for reading and writing, mappedAtCreation) works correctly.',
        'Puskurien mappaus (mapAsync lukemiseen ja kirjoittamiseen, mappedAtCreation) toimii oikein.'));
      if (ffOld) {
        r.warn(tr(`Firefox ${v} has known mapAsync() bugs (fixed after Firefox 151). Please update Firefox.`,
          `Firefox ${v}:ssä on tunnettuja mapAsync()-bugeja (korjattu Firefox 151:n jälkeen). Päivitä Firefox.`));
      }
    } else {
      for (const f of failures) r.error(f);
      r.error(tr('GPU buffer mapping does not work correctly. Games that read data back from the GPU may hang or malfunction.',
        'Näytönohjaimen puskurien mappaus ei toimi oikein. Pelit, jotka lukevat dataa takaisin näytönohjaimelta, voivat jumittua tai toimia virheellisesti.')
        + (ffOld ? tr(` This matches a known bug in Firefox ${v}; please update Firefox.`, ` Tämä vastaa Firefox ${v}:n tunnettua bugia; päivitä Firefox.`) : ''));
    }
  },
});
