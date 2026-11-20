// webkit.org/b/314444: A WebAssembly active data segment placed at an address of 2 GB or above fails to initialize
// in Safari/WebKit, because the 32-bit segment offset is sign-extended to 64 bits. This regressed when
// webkit.org/b/317794 widened the offset to 64 bits, to fix data segments in 64-bit (Wasm64) memories failing to parse.
// The check verifies that neither bug is present: a data segment at address 0x80000000 of a 32-bit memory, and a
// data segment with a 64-bit offset in a 64-bit memory, must both be initialized.
WGR.register({
  id: 'webkit-314444',
  section: 'bugs',
  group: 'Safari / WebKit',
  engine: 'webkit',
  bug: ['https://webkit.org/b/314444', 'https://webkit.org/b/317794'],
  title: WGR.tr('WebAssembly data segments above 2 GB and in 64-bit memories', 'WebAssemblyn datasegmentit yli 2 Gt:n osoitteissa ja 64-bittisissä muisteissa'),
  async run(ctx, r) {
    const tr = WGR.tr;
    if (typeof WebAssembly !== 'object') {
      r.na(tr('WebAssembly is not supported.', 'WebAssemblya ei tueta.'));
      return;
    }
    const wk = ctx.isEngine('webkit') ? tr(' This matches a known Safari/WebKit issue.', ' Tämä vastaa tunnettua Safari/WebKit-ongelmaa.') : '';
    const ok = tr('initialized correctly', 'alustettu oikein');
    const failed = (e) => tr('failed', 'epäonnistui') + `: ${e && e.message ? e.message : e}`;
    const notTested = tr('not tested', 'ei testattu');
    const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

    // webkit.org/b/314444: 32-bit memory, data segment at address 2 GB.
    // (module (import "e" "m" (memory 32769)) (data (i32.const 0x80000000) "*"))
    const name32 = tr('Data segment at 2 GB (32-bit memory)', 'Datasegmentti 2 Gt:n kohdalla (32-bittinen muisti)');
    const segmentAt2gbModule = new Uint8Array([...header,
      0x02, 0x0a, 0x01, 0x01, 0x65, 0x01, 0x6d, 0x02, 0x00, 0x81, 0x80, 0x02,
      0x0b, 0x0b, 0x01, 0x00, 0x41, 0x80, 0x80, 0x80, 0x80, 0x78, 0x0b, 0x01, 0x2a]);
    let memory = null;
    // 32769 pages = 2 GB + 64 KB. This only reserves address space, the pages are not touched.
    try { memory = new WebAssembly.Memory({ initial: 32769 }); } catch (e) { /* cannot allocate, handled below */ }
    if (!memory) {
      r.field(name32, notTested);
      r.na(tr('A 2 GB WebAssembly memory could not be allocated on this device, so data segments above 2 GB could not be tested.',
        'Tällä laitteella ei voitu varata 2 Gt:n WebAssembly-muistia, joten yli 2 Gt:n osoitteissa olevia datasegmenttejä ei voitu testata.'));
    } else {
      let error = null;
      try {
        await WebAssembly.instantiate(segmentAt2gbModule, { e: { m: memory } });
        const value = new Uint8Array(memory.buffer, 0x80000000, 1)[0];
        if (value !== 0x2a) error = new Error(`read ${value} at address 0x80000000, expected 42`);
      } catch (e) { error = e; }
      memory = null;
      if (!error) {
        r.field(name32, ok);
        r.pass(tr('Data segments placed at addresses above 2 GB are initialized correctly.',
          'Yli 2 Gt:n osoitteisiin sijoitetut datasegmentit alustetaan oikein.'));
      } else {
        r.field(name32, failed(error));
        r.warn(tr('A WebAssembly module with a data segment placed at an address of 2 GB or above fails to load. '
          + 'Games that place their static data above 2 GB will not start; most games do not do this.',
          'WebAssembly-moduuli, jonka datasegmentti on sijoitettu 2 Gt:n osoitteeseen tai sen yläpuolelle, ei lataudu. '
          + 'Pelit, jotka sijoittavat staattisen datansa yli 2 Gt:n osoitteisiin, eivät käynnisty; useimmat pelit eivät tee näin.') + wk);
      }
    }

    // webkit.org/b/317794: 64-bit memory, data segment with a 64-bit offset.
    // (module (memory (export "m") i64 1) (data (i64.const 16) "*"))
    const name64 = tr('Data segment in a 64-bit memory (Wasm64)', 'Datasegmentti 64-bittisessä muistissa (Wasm64)');
    const mem64Module = new Uint8Array([...header, 0x05, 0x03, 0x01, 0x04, 0x01]);
    const segmentInMem64Module = new Uint8Array([...header,
      0x05, 0x03, 0x01, 0x04, 0x01,
      0x07, 0x05, 0x01, 0x01, 0x6d, 0x02, 0x00,
      0x0b, 0x07, 0x01, 0x00, 0x42, 0x10, 0x0b, 0x01, 0x2a]);
    let hasMem64 = false;
    try { hasMem64 = WebAssembly.validate(mem64Module); } catch (e) { hasMem64 = false; }
    if (!hasMem64) {
      r.field(name64, notTested);
      r.na(tr('64-bit WebAssembly memory (Wasm64) is not supported, so its data segments could not be tested.',
        '64-bittistä WebAssembly-muistia (Wasm64) ei tueta, joten sen datasegmenttejä ei voitu testata.'));
      return;
    }
    let error = null;
    try {
      const { instance } = await WebAssembly.instantiate(segmentInMem64Module);
      const value = new Uint8Array(instance.exports.m.buffer)[16];
      if (value !== 0x2a) error = new Error(`read ${value} at address 16, expected 42`);
    } catch (e) { error = e; }
    if (!error) {
      r.field(name64, ok);
      r.pass(tr('Data segments in 64-bit WebAssembly memories (Wasm64) are initialized correctly.',
        '64-bittisten WebAssembly-muistien (Wasm64) datasegmentit alustetaan oikein.'));
    } else {
      r.field(name64, failed(error));
      r.warn(tr('A Wasm64 module with a data segment fails to load. Games built for Wasm64 will not run; most games still ship 32-bit builds.',
        'Wasm64-moduuli, jossa on datasegmentti, ei lataudu. Wasm64:lle käännetyt pelit eivät toimi; useimmat pelit julkaistaan kuitenkin yhä 32-bittisinä.') + wk);
    }
  },
});
