// crbug.com/481364093: No WebGPU support on Samsung Xclipse GPUs (Galaxy A37, A55, A56, A57, S24, S25 FE,
// S26, S26+, Z Flip7, Tab S10 FE, ...).
WGR.register({
  id: 'crbug-481364093',
  section: 'bugs',
  group: 'Chrome / Chromium',
  engine: 'blink',
  bug: 'https://crbug.com/481364093',
  title: WGR.tr('No WebGPU support on Samsung Xclipse GPUs', 'Ei WebGPU-tukea Samsung Xclipse -näytönohjaimilla'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const id = ctx.gpuIdentity();
    if (!id) {
      r.na(tr('The GPU could not be identified (neither WebGPU nor WebGL report a GPU name).',
        'Näytönohjainta ei voitu tunnistaa (WebGPU tai WebGL ei ilmoita näytönohjaimen nimeä).'));
      return;
    }
    const isXclipse = /xclipse/.test(id) || /\bsamsung\b/.test((ctx.adapterInfo && ctx.adapterInfo.vendor) || '');
    if (!isXclipse) { r.na(tr('This device does not use a Samsung Xclipse GPU.', 'Tässä laitteessa ei ole Samsung Xclipse -näytönohjainta.')); return; }

    r.field(tr('Detected GPU', 'Tunnistettu näytönohjain'),
      (WGR.webglInfo() || {}).renderer || (ctx.adapterInfo && ctx.adapterInfo.description) || 'Samsung Xclipse');
    if (!ctx.adapter) {
      r.error(tr('This device has a Samsung Xclipse GPU, and WebGPU is not available. This is a known Chromium issue: '
        + 'Chrome does not currently enable WebGPU on Xclipse GPUs. WebGPU games cannot run in this browser on this device.',
        'Tässä laitteessa on Samsung Xclipse -näytönohjain, eikä WebGPU ole käytettävissä. Tämä on tunnettu Chromium-ongelma: '
        + 'Chrome ei tällä hetkellä ota WebGPU:ta käyttöön Xclipse-näytönohjaimilla. WebGPU-pelit eivät toimi tällä selaimella tässä laitteessa.'));
    } else if (ctx.featureLevel !== 'core') {
      r.warn(tr(`This device has a Samsung Xclipse GPU and only a ${ctx.featureLevel} WebGPU adapter is available (known Chromium issue).`,
        `Tässä laitteessa on Samsung Xclipse -näytönohjain, ja käytettävissä on vain ${ctx.featureLevel}-tason WebGPU-adapteri (tunnettu Chromium-ongelma).`));
    } else {
      r.pass(tr('This device has a Samsung Xclipse GPU, but a WebGPU adapter is available, so this issue does not affect your browser version.',
        'Tässä laitteessa on Samsung Xclipse -näytönohjain, mutta WebGPU-adapteri on käytettävissä, joten tämä ongelma ei koske selainversiotasi.'));
    }
  },
});
