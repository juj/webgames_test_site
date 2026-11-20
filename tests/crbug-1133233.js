// crbug.com/1133233: Chrome performance bug when setting PannerNode position. Repeatedly updating a PannerNode's
// position (as games do every frame for 3D positional audio) gets progressively slower. Unity works around this by
// only updating the position when it has changed (Unity case 1270768).
//
// The check updates a PannerNode's position in batches, spaced like game frames, using both the legacy setPosition()
// method and the positionX/Y/Z AudioParams, and checks whether later batches are much slower than the first one.
//
// This must run on a *running* AudioContext: in a suspended or offline context the audio clock does not advance,
// so automation events legitimately pile up (per the Web Audio spec) and every browser would appear to slow down.
// Browsers only allow starting audio after a user gesture, so if the context cannot be started automatically the
// check offers a button instead.
WGR.register({
  id: 'crbug-1133233',
  section: 'bugs',
  group: 'Chrome / Chromium',
  engine: 'blink',
  bug: 'https://crbug.com/1133233',
  title: WGR.tr('Setting PannerNode position gets progressively slower', 'PannerNoden sijainnin asettaminen hidastuu vähitellen'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || typeof PannerNode === 'undefined') {
      r.na(tr('The Web Audio API is not available.', 'Web Audio -rajapinta ei ole käytettävissä.'));
      return;
    }

    const BATCHES = 8, PER_BATCH = 1000, FRAME_GAP_MS = 30;
    const usPerCall = (ms) => (ms * 1000 / PER_BATCH).toFixed(2);

    const variants = [];
    if (typeof PannerNode.prototype.setPosition === 'function') {
      variants.push({ name: 'setPosition()', update: (p, n) => p.setPosition(n % 100, (n * 7) % 13, -(n % 17)) });
    }
    if ('positionX' in PannerNode.prototype) {
      variants.push({
        name: 'positionX/Y/Z.value',
        update: (p, n) => { p.positionX.value = n % 100; p.positionY.value = (n * 7) % 13; p.positionZ.value = -(n % 17); },
      });
    }
    if (!variants.length) {
      r.warn(tr('PannerNode position cannot be set. 3D positional audio in games will not work.',
        'PannerNoden sijaintia ei voi asettaa. Pelien 3D-sijaintiääni ei toimi.'));
      return;
    }

    // Measures each batch of position updates. Every call sets a new position so that no "unchanged value"
    // fast path can skip the work. The panner has no input, so nothing is audible.
    const measure = async (audio, update) => {
      const panner = audio.createPanner();
      panner.connect(audio.destination);
      let n = 0;
      for (let i = 0; i < 200; ++i) update(panner, n++); // warm-up (JIT)
      const times = [];
      for (let b = 0; b < BATCHES; ++b) {
        await new Promise(res => setTimeout(res, FRAME_GAP_MS)); // let the audio clock advance, like a game frame
        const t0 = performance.now();
        for (let i = 0; i < PER_BATCH; ++i) update(panner, n++);
        times.push(performance.now() - t0);
      }
      panner.disconnect();
      return times;
    };

    const runMeasurements = async (audio, rep) => {
      if (audio.state !== 'running') {
        rep.na(tr('Audio could not be started, so the check was not run.', 'Ääntä ei voitu käynnistää, joten tarkistusta ei suoritettu.'));
        return;
      }
      let slow = false;
      for (const v of variants) {
        const times = await measure(audio, v.update);
        const first = Math.max(times[0], 0.05); // guard against coarse timer resolution
        const last = times[times.length - 1];
        const ratio = last / first;
        rep.field(v.name, tr(`${usPerCall(times[0])} µs/call in the first batch, ${usPerCall(last)} µs/call after ${BATCHES * PER_BATCH} calls (${ratio.toFixed(1)}×)`,
          `${usPerCall(times[0])} µs/kutsu ensimmäisessä erässä, ${usPerCall(last)} µs/kutsu ${BATCHES * PER_BATCH} kutsun jälkeen (${ratio.toFixed(1)}×)`));
        // Flag a clear slowdown trend, or calls that are simply very slow (> 50 µs each).
        if ((ratio > 4 && last > 2) || last / PER_BATCH > 0.05) {
          slow = true;
          rep.warn(tr(`Updating the PannerNode position with ${v.name} gets slower the more it is called (${ratio.toFixed(1)}× slower after ${BATCHES * PER_BATCH} updates). `
            + 'Games that move 3D sound sources every frame may lose performance over time.',
            `PannerNoden sijainnin päivittäminen ${v.name}-tavalla hidastuu, mitä enemmän sitä kutsutaan (${ratio.toFixed(1)}× hitaampi ${BATCHES * PER_BATCH} päivityksen jälkeen). `
            + 'Pelit, jotka liikuttavat 3D-äänilähteitä joka ruudunpäivityksellä, voivat hidastua ajan myötä.')
            + (ctx.isEngine('blink') ? tr(' This matches a known Chrome bug; Unity works around it by only updating positions that have changed.',
              ' Tämä vastaa tunnettua Chrome-bugia; Unity kiertää sen päivittämällä vain muuttuneet sijainnit.') : ''));
        }
      }
      if (!slow) rep.pass(tr('Updating PannerNode positions repeatedly does not slow down.', 'PannerNoden sijaintien toistuva päivittäminen ei hidastu.'));
      audio.close();
    };

    // Try to start audio without a user gesture (allowed e.g. if the user has interacted with the site before).
    const audio = new AC();
    if (audio.state !== 'running') {
      try { await WGR.withTimeout(audio.resume(), 500, 'AudioContext.resume()'); } catch (e) { /* needs a user gesture */ }
    }
    if (audio.state === 'running') {
      await runMeasurements(audio, r);
      return;
    }

    r.na(tr('This check needs to start Web Audio, which browsers only allow after you click on the page. No sound will be played.',
      'Tämä tarkistus käynnistää Web Audion, minkä selaimet sallivat vasta, kun napsautat sivua. Ääntä ei toisteta.'));
    r.deferUntilClick(tr('Run audio check', 'Suorita äänitarkistus'), async (rep) => {
      // resume() must be the first call inside the click handler so that it counts as a user gesture.
      const resumed = audio.resume();
      try { await WGR.withTimeout(resumed, 2000, 'AudioContext.resume()'); } catch (e) { /* reported below */ }
      await runMeasurements(audio, rep);
    });
  },
});
