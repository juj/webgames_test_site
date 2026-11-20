// webkit.org/b/219005: ResizeObserver devicePixelContentBoxSize is not supported in Safari.
// Without it, games cannot size their canvas to exactly match physical screen pixels, which can cause blurry
// or slightly misscaled output.
WGR.register({
  id: 'webkit-219005',
  section: 'bugs',
  group: 'Safari / WebKit',
  engine: 'webkit',
  bug: 'https://webkit.org/b/219005',
  title: WGR.tr('ResizeObserver devicePixelContentBoxSize support', 'ResizeObserverin devicePixelContentBoxSize-tuki'),
  async run(ctx, r) {
    const tr = WGR.tr;
    if (typeof ResizeObserver !== 'function') {
      r.warn(tr('ResizeObserver is not supported. Games cannot reliably track canvas size changes.',
        'ResizeObserveria ei tueta. Pelit eivät voi luotettavasti seurata canvasin koon muutoksia.'));
      return;
    }
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:-1000px;top:0;width:101px;height:37px;';
    document.body.appendChild(div);
    let entry = null;
    try {
      entry = await WGR.withTimeout(new Promise((resolve, reject) => {
        const ro = new ResizeObserver(entries => { ro.disconnect(); resolve(entries[0]); });
        try { ro.observe(div, { box: 'device-pixel-content-box' }); } catch (e) { reject(e); }
      }), 3000, 'ResizeObserver callback');
    } catch (e) {
      r.field(tr('Error', 'Virhe'), e.message);
    } finally {
      div.remove();
    }
    const size = entry && entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
    if (size) {
      r.field('devicePixelContentBoxSize', tr(`${size.inlineSize}×${size.blockSize} (for a 101×37 CSS px element at ${devicePixelRatio}x)`,
        `${size.inlineSize}×${size.blockSize} (101×37 CSS-pikselin elementille, pikselisuhde ${devicePixelRatio}x)`));
      r.pass(tr('ResizeObserver reports devicePixelContentBoxSize, so games can render at exact native resolution.',
        'ResizeObserver ilmoittaa devicePixelContentBoxSize-arvon, joten pelit voivat renderöidä täsmälleen näytön natiivitarkkuudella.'));
    } else {
      r.warn(tr('ResizeObserver devicePixelContentBoxSize is not supported. Games have to estimate the canvas size in physical pixels, '
        + 'which can cause slightly blurry rendering or moiré artifacts on high-DPI or zoomed displays.',
        'ResizeObserverin devicePixelContentBoxSize-arvoa ei tueta. Pelien on arvioitava canvasin koko fyysisinä pikseleinä, '
        + 'mikä voi aiheuttaa hieman sumeaa kuvaa tai moiré-häiriöitä tarkkuusnäytöillä tai zoomattaessa.')
        + (ctx.isEngine('webkit') ? tr(' This is a known Safari/WebKit limitation.', ' Tämä on Safarin/WebKitin tunnettu rajoitus.') : ''));
    }
  },
});
