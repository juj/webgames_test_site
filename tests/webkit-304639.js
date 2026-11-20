// webkit.org/b/304639: createImageBitmap() issues in Safari/WebKit, affecting how games decode textures (e.g. glTF images).
// Decodes a PNG Blob with createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none',
// colorSpaceConversion: 'none' }), uploads it to a GPU texture and verifies orientation and texel values.
WGR.register({
  id: 'webkit-304639',
  section: 'bugs',
  group: 'Safari / WebKit',
  engine: 'webkit',
  bug: 'https://webkit.org/b/304639',
  title: WGR.tr('createImageBitmap() with imageOrientation: flipY', 'createImageBitmap() asetuksella imageOrientation: flipY'),
  async run(ctx, r) {
    const tr = WGR.tr;
    if (typeof createImageBitmap !== 'function') {
      r.error(tr('createImageBitmap() is not supported. Games cannot decode textures efficiently.',
        'createImageBitmap()-funktiota ei tueta. Pelit eivät voi purkaa tekstuureja tehokkaasti.'));
      return;
    }
    const wk = ctx.isEngine('webkit') ? tr(' This matches a known Safari/WebKit issue.', ' Tämä vastaa tunnettua Safari/WebKit-ongelmaa.') : '';

    let bitmap;
    try {
      bitmap = await createImageBitmap(WGR.testPngBlob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch (e) {
      r.error(tr(`createImageBitmap(blob, { imageOrientation: 'flipY', ... }) failed: ${e.message}.`,
        `createImageBitmap(blob, { imageOrientation: 'flipY', ... }) epäonnistui: ${e.message}.`) + wk);
      return;
    }
    if (bitmap.width !== 2 || bitmap.height !== 2) {
      r.error(tr(`createImageBitmap() returned an image of the wrong size (${bitmap.width}×${bitmap.height}, expected 2×2).`,
        `createImageBitmap() palautti väärän kokoisen kuvan (${bitmap.width}×${bitmap.height}, odotettiin 2×2).`) + wk);
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
    const P = WGR.TEST_PNG_PIXELS;
    const flipped = [P[2], P[3], P[0], P[1]];
    r.field(tr('Texels', 'Tekselit'), WGR.formatPixels(px, 4));
    r.field(tr('Expected (flipped)', 'Odotettu (käännetty)'), WGR.formatPixels(flipped.flat(), 4));
    if (WGR.pixelsMatch(px, flipped, 3)) {
      r.pass(tr('The image was decoded with the correct vertical flip and exact colors.',
        'Kuva purettiin oikein pystysuunnassa käännettynä ja täsmälleen oikein värein.'));
    } else if (WGR.pixelsMatch(px, P, 3)) {
      r.error(tr(`imageOrientation: 'flipY' was ignored; the image was not flipped. Game textures may appear upside down.`,
        `imageOrientation: 'flipY' ohitettiin; kuvaa ei käännetty. Pelien tekstuurit voivat näkyä ylösalaisin.`) + wk);
    } else {
      r.error(tr('The image decoded by createImageBitmap() has incorrect texel values. Game textures may look wrong.',
        'createImageBitmap()-funktion purkamassa kuvassa on vääriä tekseliarvoja. Pelien tekstuurit voivat näyttää väärältä.') + wk);
    }
  },
});
