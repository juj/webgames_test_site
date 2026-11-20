// Reports basic information about the browser and device. Purely informational.
WGR.register({
  id: 'environment',
  section: 'context',
  title: WGR.tr('Browser and device', 'Selain ja laite'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const yesNo = (v) => v ? tr('yes', 'kyllä') : tr('no', 'ei');
    const b = ctx.browser;
    r.field(tr('Browser', 'Selain'), `${b.name}${b.version ? ' ' + b.version : ''}`);
    r.field(tr('Browser engine', 'Selainmoottori'),
      { blink: 'Blink (Chromium)', gecko: 'Gecko (Firefox)', webkit: 'WebKit (Safari)' }[b.engine] || tr('Unknown', 'Tuntematon'));
    r.field(tr('Operating system', 'Käyttöjärjestelmä'), b.os);
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      try {
        const hi = await WGR.withTimeout(navigator.userAgentData.getHighEntropyValues(['platformVersion', 'model', 'architecture', 'bitness']), 2000, 'UA hints');
        if (hi.platformVersion) r.field(tr('OS version', 'Käyttöjärjestelmän versio'), hi.platformVersion);
        if (hi.model) r.field(tr('Device model', 'Laitemalli'), hi.model);
        if (hi.architecture) r.field(tr('CPU architecture', 'Suoritinarkkitehtuuri'), `${hi.architecture}${hi.bitness ? ` (${hi.bitness}-${tr('bit', 'bittinen')})` : ''}`);
      } catch (e) { /* optional */ }
    }
    r.field(tr('User agent', 'Selaimen tunniste (user agent)'), b.ua);
    r.field(tr('Logical CPU cores', 'Loogiset suoritinytimet'), navigator.hardwareConcurrency);
    if (navigator.deviceMemory) r.field(tr('Device memory (approx.)', 'Laitteen muisti (likimäärin)'), `${navigator.deviceMemory} GB`);
    r.field(tr('Screen', 'Näyttö'), tr(`${screen.width}×${screen.height} @ ${window.devicePixelRatio}x device pixel ratio`,
      `${screen.width}×${screen.height}, pikselisuhde ${window.devicePixelRatio}x`));
    r.field(tr('Secure context (HTTPS)', 'Suojattu yhteys (HTTPS)'), yesNo(window.isSecureContext));
    r.field(tr('Cross-origin isolated', 'Cross-origin-eristetty'), yesNo(window.crossOriginIsolated));
    const gl = WGR.webglInfo();
    r.field(tr('WebGL renderer', 'WebGL-renderöijä'), gl ? `${gl.vendor} — ${gl.renderer}` : tr('WebGL unavailable', 'WebGL ei käytettävissä'));

    if (!window.isSecureContext) {
      r.error(tr('This page is not served from a secure context (HTTPS or localhost). Browsers only expose WebGPU in secure contexts.',
        'Tätä sivua ei ladattu suojatun yhteyden (HTTPS tai localhost) kautta. Selaimet tarjoavat WebGPU:n vain suojatuilla sivuilla.'));
    } else if (b.engine === 'unknown') {
      r.warn(tr('Your browser could not be identified. Results of browser-specific checks may be inaccurate.',
        'Selaintasi ei voitu tunnistaa. Selainkohtaisten tarkistusten tulokset voivat olla epätarkkoja.'));
    } else {
      r.info(tr(`Detected ${b.name}${b.version ? ' ' + b.version : ''} on ${b.os}.`,
        `Tunnistettu ${b.name}${b.version ? ' ' + b.version : ''}, käyttöjärjestelmä ${b.os}.`));
    }
  },
});
