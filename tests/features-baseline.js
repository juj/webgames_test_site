// Features that all reasonably modern GPUs (and up-to-date browsers) provide.
// If one is missing, the hardware, driver or browser is likely outdated and games may run with
// reduced performance or quality.
WGR.register({
  id: 'features-baseline',
  section: 'features',
  title: WGR.tr('Baseline features expected on modern hardware', 'Perusominaisuudet, jotka nykyaikaisesta laitteistosta odotetaan löytyvän'),
  async run(ctx, r) {
    const tr = WGR.tr;
    if (!ctx.adapter) { r.na(tr('No WebGPU adapter available.', 'WebGPU-adapteria ei ole käytettävissä.')); return; }

    const BASELINE = {
      'shader-f16': tr('16-bit floating point math in shaders. Used for faster, lower-bandwidth shading, especially on mobile GPUs.',
        '16-bittinen liukulukulaskenta varjostimissa. Nopeuttaa varjostusta ja vähentää muistikaistan käyttöä etenkin mobiililaitteiden näytönohjaimilla.'),
      'rg11b10ufloat-renderable': tr('Rendering to the compact rg11b10ufloat HDR format. Used to save memory and bandwidth in HDR rendering.',
        'Renderöinti tiiviiseen rg11b10ufloat-HDR-formaattiin. Säästää muistia ja kaistaa HDR-renderöinnissä.'),
      'depth-clip-control': tr('Disabling depth clipping. Used for shadow-map rendering techniques.',
        'Syvyysleikkauksen poistaminen käytöstä. Käytetään varjokarttojen renderöintitekniikoissa.'),
      'depth32float-stencil8': tr('Combined 32-bit float depth and stencil format.',
        'Yhdistetty 32-bittinen liukulukusyvyys- ja stencil-formaatti.'),
      'indirect-first-instance': tr('Non-zero firstInstance in indirect draw calls. Used for GPU-driven rendering.',
        'Nollasta poikkeava firstInstance epäsuorissa piirtokutsuissa. Käytetään näytönohjainvetoisessa renderöinnissä.'),
      'bgra8unorm-storage': tr('Writing bgra8unorm textures from compute shaders (e.g. post-processing straight to the screen).',
        'bgra8unorm-tekstuureihin kirjoittaminen laskentavarjostimista (esim. jälkikäsittely suoraan näytölle).'),
      'float32-filterable': tr('Filtering 32-bit float textures.', '32-bittisten liukulukutekstuurien suodatus.'),
      'float32-blendable': tr('Blending to 32-bit float render targets.', 'Sekoitus (blending) 32-bittisiin liukulukurenderöintikohteisiin.'),
      'clip-distances': tr('User-defined clip planes in vertex shaders.', 'Käyttäjän määrittämät leikkaustasot verteksivarjostimissa.'),
      'dual-source-blending': tr('Dual-source blending, used by some advanced transparency and blending techniques.',
        'Kaksilähteinen sekoitus (dual-source blending), jota käyttävät jotkin edistyneet läpinäkyvyys- ja sekoitustekniikat.'),
      'subgroups': tr('Subgroup (wave/SIMD) operations that speed up compute shaders.',
        'Aliryhmäoperaatiot (wave/SIMD), jotka nopeuttavat laskentavarjostimia.'),
    };

    const features = ctx.adapter.features;
    const present = [], missing = [];
    for (const name of Object.keys(BASELINE)) (features.has(name) ? present : missing).push(name);

    r.field(tr('Supported', 'Tuettu'), present.join(', ') || tr('(none)', '(ei yhtään)'));
    r.field(tr('Missing', 'Puuttuu'), missing.join(', ') || tr('(none)', '(ei yhtään)'));

    for (const name of missing) {
      r.warn(tr(`"${name}" is not supported. ${BASELINE[name]} All modern hardware supports this; its absence suggests an outdated GPU, graphics driver or browser, `
        + 'so this device might not produce the best experience in WebGPU games.',
        `"${name}" ei ole tuettu. ${BASELINE[name]} Kaikki nykyaikaiset laitteet tukevat tätä; sen puuttuminen viittaa vanhentuneeseen näytönohjaimeen, ajuriin tai selaimeen, `
        + 'joten tämä laite ei välttämättä tarjoa parasta mahdollista kokemusta WebGPU-peleissä.'));
    }
    if (!missing.length) r.pass(tr(`All ${present.length} baseline features are supported.`, `Kaikki ${present.length} perusominaisuutta ovat tuettuja.`));
    else if (present.length) r.pass(tr(`Supported: ${present.join(', ')}.`, `Tuettu: ${present.join(', ')}.`));
  },
});
