// crbug.com/519877025: No shader-f16 support on Qualcomm Adreno 6xx GPUs (Honor X5c, Galaxy Tab A9+,
// Honor 400 Lite, HMD Fusion X1, Moto G85, OnePlus 13, ...).
WGR.register({
  id: 'crbug-519877025',
  section: 'bugs',
  group: 'Chrome / Chromium',
  engine: 'blink',
  bug: 'https://crbug.com/519877025',
  title: WGR.tr('No shader-f16 support on Qualcomm Adreno 6xx GPUs', 'Ei shader-f16-tukea Qualcomm Adreno 6xx -näytönohjaimilla'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const id = ctx.gpuIdentity();
    if (!id) { r.na(tr('The GPU could not be identified.', 'Näytönohjainta ei voitu tunnistaa.')); return; }
    const m = id.match(/adreno[^0-9|]{0,12}(\d{3})\b/);
    const isAdreno6 = (m && m[1][0] === '6') || /adreno-6/.test(id);
    if (!isAdreno6) { r.na(tr('This device does not use a Qualcomm Adreno 6xx GPU.', 'Tässä laitteessa ei ole Qualcomm Adreno 6xx -näytönohjainta.')); return; }

    r.field(tr('Detected GPU', 'Tunnistettu näytönohjain'), m ? `Adreno ${m[1]}` : 'Adreno 6xx');
    if (!ctx.adapter) {
      r.na(tr('No WebGPU adapter is available, so shader-f16 support cannot be checked.',
        'WebGPU-adapteria ei ole käytettävissä, joten shader-f16-tukea ei voida tarkistaa.'));
      return;
    }
    if (!ctx.adapter.features.has('shader-f16')) {
      r.warn(tr('This Adreno 6xx GPU does not expose the "shader-f16" feature in Chrome (known Chromium issue). '
        + 'Games fall back to 32-bit shader math, which is slower and uses more power on mobile GPUs.',
        'Tämä Adreno 6xx -näytönohjain ei tarjoa "shader-f16"-ominaisuutta Chromessa (tunnettu Chromium-ongelma). '
        + 'Pelit joutuvat käyttämään 32-bittistä varjostinlaskentaa, joka on mobiililaitteiden näytönohjaimilla hitaampaa ja kuluttaa enemmän virtaa.'));
    } else {
      r.pass(tr('This Adreno 6xx GPU exposes "shader-f16", so this issue does not affect your browser version.',
        'Tämä Adreno 6xx -näytönohjain tarjoaa "shader-f16"-ominaisuuden, joten tämä ongelma ei koske selainversiotasi.'));
    }
  },
});
