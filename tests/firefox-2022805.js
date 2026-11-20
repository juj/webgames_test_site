// bugzil.la/2022805: No Wasm 4GB / Wasm64 (Memory64) support in Firefox.
// Large WebGPU games compiled to WebAssembly may need more than 2 GB of memory, or 64-bit memory addressing.
WGR.register({
  id: 'firefox-2022805',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/2022805',
  title: WGR.tr('WebAssembly 4 GB memory and Wasm64 (Memory64) support', 'WebAssemblyn 4 Gt:n muistin ja Wasm64:n (Memory64) tuki'),
  async run(ctx, r) {
    const tr = WGR.tr;
    if (typeof WebAssembly !== 'object') {
      r.error(tr('WebAssembly is not supported. Most WebGPU games cannot run.', 'WebAssemblya ei tueta. Useimmat WebGPU-pelit eivät toimi.'));
      return;
    }
    const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

    // Module with a 32-bit memory: initial 1 page, maximum 65536 pages (4 GB).
    const mem4gbModule = new Uint8Array([...header, 0x05, 0x06, 0x01, 0x01, 0x01, 0x80, 0x80, 0x04]);
    // Module with a 64-bit memory (memory64 limits flag 0x04), initial 1 page.
    const mem64Module = new Uint8Array([...header, 0x05, 0x03, 0x01, 0x04, 0x01]);

    let ok4gb = false;
    try {
      ok4gb = WebAssembly.validate(mem4gbModule);
      if (ok4gb) {
        // Does not commit 4 GB, only reserves the maximum.
        new WebAssembly.Memory({ initial: 1, maximum: 65536 });
        await WebAssembly.instantiate(mem4gbModule);
      }
    } catch (e) { ok4gb = false; }

    let ok64 = false;
    try { ok64 = WebAssembly.validate(mem64Module); } catch (e) { ok64 = false; }

    const sup = (v) => v ? tr('supported', 'tuettu') : tr('not supported', 'ei tuettu');
    r.field(tr('4 GB Wasm memory (65536 pages)', '4 Gt:n Wasm-muisti (65536 sivua)'), sup(ok4gb));
    r.field('Wasm64 (Memory64)', sup(ok64));
    const ff = ctx.isEngine('gecko') ? tr(' This is a known Firefox limitation.', ' Tämä on Firefoxin tunnettu rajoitus.') : '';
    if (ok4gb) {
      r.pass(tr('WebAssembly memories of up to 4 GB are supported.', 'Enintään 4 Gt:n WebAssembly-muistit ovat tuettuja.'));
    } else {
      r.warn(tr('WebAssembly memories larger than 2 GB are not supported. Large games may fail to load or run out of memory.',
        'Yli 2 Gt:n WebAssembly-muisteja ei tueta. Suuret pelit eivät välttämättä lataudu, tai niiden muisti voi loppua.') + ff);
    }
    if (ok64) {
      r.pass(tr('64-bit WebAssembly memory (Wasm64) is supported.', '64-bittinen WebAssembly-muisti (Wasm64) on tuettu.'));
    } else {
      r.warn(tr('64-bit WebAssembly memory (Wasm64) is not supported. Games built for Wasm64 will not run; most games still ship 32-bit builds.',
        '64-bittistä WebAssembly-muistia (Wasm64) ei tueta. Wasm64:lle käännetyt pelit eivät toimi; useimmat pelit julkaistaan kuitenkin yhä 32-bittisinä.') + ff);
    }
  },
});
