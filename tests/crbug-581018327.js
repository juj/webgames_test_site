// crbug.com/581018327: Intel Arc 140T has WebGPU problems.
WGR.register({
  id: 'crbug-581018327',
  section: 'bugs',
  group: 'Chrome / Chromium',
  engine: 'blink',
  bug: 'https://crbug.com/581018327',
  title: WGR.tr('WebGPU problems on Intel Arc 140T graphics', 'WebGPU-ongelmat Intel Arc 140T -grafiikalla'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const id = ctx.gpuIdentity();
    if (!id) { r.na(tr('The GPU could not be identified.', 'Näytönohjainta ei voitu tunnistaa.')); return; }
    const isArc140T = /intel/.test(id) && /arc[^|]{0,12}140t|\b140t\b/.test(id);
    if (!isArc140T) { r.na(tr('This device does not use Intel Arc 140T graphics.', 'Tässä laitteessa ei ole Intel Arc 140T -grafiikkaa.')); return; }

    if (ctx.isEngine('blink')) {
      r.warn(tr('This device uses Intel Arc 140T graphics, which has known WebGPU problems in Chrome. Games may render incorrectly or crash. '
        + 'Keeping your Intel graphics driver up to date is strongly recommended.',
        'Tässä laitteessa on Intel Arc 140T -grafiikka, jolla on tunnettuja WebGPU-ongelmia Chromessa. Pelit voivat renderöityä väärin tai kaatua. '
        + 'Intelin näytönohjainajurin pitämistä ajan tasalla suositellaan vahvasti.'));
    } else {
      r.info(tr('This device uses Intel Arc 140T graphics, which has known WebGPU problems in Chrome. Your browser is not Chromium-based and may not be affected.',
        'Tässä laitteessa on Intel Arc 140T -grafiikka, jolla on tunnettuja WebGPU-ongelmia Chromessa. Selaimesi ei perustu Chromiumiin, joten ongelma ei välttämättä koske sitä.'));
    }
  },
});
