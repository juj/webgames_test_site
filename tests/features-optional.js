// Optional features that are not expected on every modern device, e.g. texture compression formats
// differ between desktop (BC) and mobile (ETC2 / ASTC) GPUs.
WGR.register({
  id: 'features-optional',
  section: 'features',
  title: WGR.tr('Optional features', 'Valinnaiset ominaisuudet'),
  async run(ctx, r) {
    const tr = WGR.tr;
    if (!ctx.adapter) { r.na(tr('No WebGPU adapter available.', 'WebGPU-adapteria ei ole käytettävissä.')); return; }

    const OPTIONAL = {
      'texture-compression-bc': tr('BC (DXT/S3TC) compressed textures — typical on desktop GPUs.',
        'BC (DXT/S3TC) -pakatut tekstuurit — tyypillisiä pöytäkoneiden näytönohjaimille.'),
      'texture-compression-bc-sliced-3d': tr('BC compressed 3D textures.', 'BC-pakatut 3D-tekstuurit.'),
      'texture-compression-etc2': tr('ETC2 compressed textures — typical on mobile GPUs.',
        'ETC2-pakatut tekstuurit — tyypillisiä mobiililaitteiden näytönohjaimille.'),
      'texture-compression-astc': tr('ASTC compressed textures — typical on mobile and Apple GPUs.',
        'ASTC-pakatut tekstuurit — tyypillisiä mobiililaitteiden ja Applen näytönohjaimille.'),
      'texture-compression-astc-sliced-3d': tr('ASTC compressed 3D textures.', 'ASTC-pakatut 3D-tekstuurit.'),
      'timestamp-query': tr('GPU timestamp queries for performance profiling (often restricted by browsers for privacy).',
        'Näytönohjaimen aikaleimakyselyt suorituskyvyn profilointiin (selaimet rajoittavat usein yksityisyyssyistä).'),
      'texture-formats-tier1': tr('Additional renderable and storage texture formats (tier 1).',
        'Lisää renderöitäviä ja storage-tekstuuriformaatteja (taso 1).'),
      'texture-formats-tier2': tr('Read-write storage access for additional texture formats (tier 2).',
        'Luku- ja kirjoitusoikeus storage-käytössä lisätekstuuriformaateille (taso 2).'),
      'primitive-index': tr('Access to the primitive index in fragment shaders.', 'Primitiivin indeksin käyttö fragmenttivarjostimissa.'),
    };
    // Features that are evaluated elsewhere (baseline check / adapter profile in the context check).
    const BASELINE = ['core-features-and-limits', 'shader-f16', 'rg11b10ufloat-renderable', 'depth-clip-control', 'depth32float-stencil8', 'indirect-first-instance',
      'bgra8unorm-storage', 'float32-filterable', 'float32-blendable', 'clip-distances', 'dual-source-blending', 'subgroups'];

    const features = ctx.adapter.features;
    const notSupported = [];
    for (const [name, desc] of Object.entries(OPTIONAL)) {
      if (features.has(name)) r.info(tr(`"${name}" is supported. ${desc}`, `"${name}" on tuettu. ${desc}`));
      else notSupported.push(name);
    }
    const other = [...features].filter(f => !(f in OPTIONAL) && !BASELINE.includes(f)).sort();
    if (other.length) r.info(tr(`Other supported features: ${other.join(', ')}.`, `Muut tuetut ominaisuudet: ${other.join(', ')}.`));
    if (notSupported.length) {
      r.na(tr(`Not supported (optional, not required): ${notSupported.join(', ')}.`,
        `Ei tuettu (valinnainen, ei pakollinen): ${notSupported.join(', ')}.`));
    }

    const tc = ['texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc'];
    if (!tc.some(f => features.has(f))) {
      r.warn(tr('No compressed texture format (BC, ETC2 or ASTC) is supported. Games must fall back to uncompressed textures, '
        + 'which use several times more GPU memory and bandwidth and take longer to download.',
        'Mitään pakattua tekstuuriformaattia (BC, ETC2 tai ASTC) ei tueta. Pelien on käytettävä pakkaamattomia tekstuureja, '
        + 'jotka vievät moninkertaisesti näytönohjaimen muistia ja kaistaa ja joiden lataaminen kestää kauemmin.'));
    }
    r.field(tr('All adapter features', 'Kaikki adapterin ominaisuudet'), [...features].sort().join(', ') || tr('(none)', '(ei yhtään)'));
  },
});
