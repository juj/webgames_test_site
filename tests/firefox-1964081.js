// bugzil.la/1964081: createImageBitmap() issues in Firefox, affecting how games decode textures (e.g. glTF images).
// Decodes a PNG Blob with createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }),
// uploads it to a GPU texture and verifies the exact texel values, including a semi-transparent pixel.
WGR.register({
  id: 'firefox-1964081',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/1964081',
  title: WGR.tr('createImageBitmap() with premultiplyAlpha / colorSpaceConversion options',
    'createImageBitmap() premultiplyAlpha- ja colorSpaceConversion-asetuksilla'),
  async run(ctx, r) {
    const tr = WGR.tr;
    if (typeof createImageBitmap !== 'function') {
      r.error(tr('createImageBitmap() is not supported. Games cannot decode textures efficiently.',
        'createImageBitmap()-funktiota ei tueta. Pelit eivät voi purkaa tekstuureja tehokkaasti.'));
      return;
    }
    const known = ctx.isEngine('gecko') ? tr(' This matches a known Firefox issue.', ' Tämä vastaa tunnettua Firefox-ongelmaa.') : '';

    let bitmap;
    try {
      bitmap = await createImageBitmap(WGR.testPngBlob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch (e) {
      r.error(tr(`createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) failed: ${e.message}`,
        `createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) epäonnistui: ${e.message}`) + known);
      return;
    }
    if (bitmap.width !== 2 || bitmap.height !== 2) {
      r.error(tr(`createImageBitmap() returned an image of the wrong size (${bitmap.width}×${bitmap.height}, expected 2×2).`,
        `createImageBitmap() palautti väärän kokoisen kuvan (${bitmap.width}×${bitmap.height}, odotettiin 2×2).`));
      return;
    }

    const device = await ctx.getDevice();
    if (!device) {
      r.pass(tr('createImageBitmap() decoded the test image. Texel values were not verified because no WebGPU device is available.',
        'createImageBitmap() purki testikuvan. Tekseliarvoja ei tarkistettu, koska WebGPU-laiteoliota ei ole käytettävissä.'));
      return;
    }

    let px = null;
    const scope = await WGR.errorScope(device, async () => { px = await WGR.bitmapToPixels(device, bitmap); });
    bitmap.close();
    if (scope.exception || scope.errors.length || !px) {
      r.error(tr(`Uploading the ImageBitmap with copyExternalImageToTexture() failed: ${WGR.describeErrors(scope)}`,
        `ImageBitmapin lataaminen copyExternalImageToTexture()-funktiolla epäonnistui: ${WGR.describeErrors(scope)}`));
      return;
    }
    const expected = WGR.TEST_PNG_PIXELS;
    r.field(tr('Texels', 'Tekselit'), WGR.formatPixels(px, 4));
    r.field(tr('Expected', 'Odotettu'), WGR.formatPixels(expected.flat(), 4));
    if (WGR.pixelsMatch(px, expected, 3)) {
      r.pass(tr('The decoded image has the exact expected colors, including the non-premultiplied semi-transparent pixel.',
        'Puretussa kuvassa on täsmälleen odotetut värit, mukaan lukien esikertomaton (non-premultiplied) puoliläpinäkyvä pikseli.'));
    } else {
      r.error(tr('The image decoded by createImageBitmap() has incorrect texel values (e.g. alpha was premultiplied or a color conversion was applied). '
        + 'Game textures may look wrong, with dark fringes around transparent areas.',
        'createImageBitmap()-funktion purkamassa kuvassa on vääriä tekseliarvoja (esim. alfa on esikerrottu tai kuvaan on tehty värimuunnos). '
        + 'Pelien tekstuurit voivat näyttää väärältä, ja läpinäkyvien alueiden reunoille voi tulla tummia reunuksia.') + known);
    }
  },
});
