// bugzil.la/2023423: Firefox versions older than 149 have WebGPU issues.
WGR.register({
  id: 'firefox-2023423',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/2023423',
  title: WGR.tr('WebGPU issues in Firefox versions older than 149', 'WebGPU-ongelmat Firefoxin versioissa, jotka ovat vanhempia kuin 149'),
  async run(ctx, r) {
    const tr = WGR.tr;
    if (!ctx.isEngine('gecko')) { r.na(tr('This issue only affects Firefox.', 'Tämä ongelma koskee vain Firefoxia.')); return; }
    const v = ctx.browser.version;
    r.field(tr('Firefox version', 'Firefoxin versio'), v);
    if (v < 149) {
      r.error(tr(`Firefox ${v} has known WebGPU issues that can break games. Please update Firefox to version 149 or newer.`,
        `Firefox ${v}:ssä on tunnettuja WebGPU-ongelmia, jotka voivat rikkoa pelejä. Päivitä Firefox versioon 149 tai uudempaan.`));
    } else {
      r.pass(tr(`Firefox ${v} is not affected (fixed in Firefox 149).`, `Ongelma ei koske Firefox ${v}:tä (korjattu Firefox 149:ssä).`));
    }
  },
});
