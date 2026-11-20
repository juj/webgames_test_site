// crbug.com/446920095: Chrome is missing the 'port' property in Audio Worklets.
// The Web Audio spec added a MessagePort to AudioWorkletGlobalScope (and the matching AudioWorklet.port on the main
// thread) in 2022 (WebAudio/web-audio-api#2456, #2507), so that code running in the audio worklet can talk to the main
// thread without creating dummy "bootstrap" AudioWorkletNodes. Emscripten's Wasm Audio Worklets (used by games for
// low-latency audio) wanted to drop that workaround (emscripten-core/emscripten#25354) but could not because of Chrome.
//
// The check loads a small worklet module into an OfflineAudioContext (needs no user gesture). The module posts a
// message through the global 'port', and a processor reports through its node port whether the global 'port' exists.
WGR.register({
  id: 'crbug-446920095',
  section: 'bugs',
  group: 'Chrome / Chromium',
  engine: 'blink',
  bug: 'https://crbug.com/446920095',
  title: WGR.tr('Audio Worklet global "port" for messaging', 'Audio Workletin globaali "port" viestintään'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC || typeof AudioWorkletNode === 'undefined' || !('audioWorklet' in OAC.prototype || 'audioWorklet' in BaseAudioContext.prototype)) {
      r.warn(tr('Audio Worklets are not supported. Games that run their audio engine in an Audio Worklet (e.g. Emscripten Wasm Audio Worklets) cannot play sound.',
        'Audio Workletteja ei tueta. Pelit, joiden äänimoottori toimii Audio Workletissa (esim. Emscriptenin Wasm Audio Worklets), eivät voi toistaa ääntä.'));
      return;
    }

    const audio = new OAC(1, 128 * 4, 48000);
    const mainPort = audio.audioWorklet.port; // AudioWorklet.port (main-thread end), part of the same spec change
    r.field('AudioWorklet.port', mainPort ? tr('present', 'on') : tr('missing', 'puuttuu'));

    // Message posted from the worklet global scope through the global 'port'.
    const globalMessage = mainPort ? new Promise(resolve => {
      mainPort.onmessage = e => resolve(e.data);
    }) : null;

    const src = `
      const hasPort = typeof port !== 'undefined' && port !== null && typeof port.postMessage === 'function';
      if (hasPort) port.postMessage({ from: 'global', ok: true });
      registerProcessor('wgr-port-probe', class extends AudioWorkletProcessor {
        constructor() { super(); this.port.postMessage({ from: 'processor', hasPort }); }
        process() { return false; }
      });`;
    const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    try {
      await WGR.withTimeout(audio.audioWorklet.addModule(url), 5000, 'audioWorklet.addModule()');
    } catch (e) {
      r.warn(tr(`Loading an Audio Worklet module failed: ${e.message}. Games that use Audio Worklets may not play sound.`,
        `Audio Worklet -moduulin lataaminen epäonnistui: ${e.message}. Audio Workletteja käyttävät pelit eivät ehkä toista ääntä.`));
      return;
    } finally {
      URL.revokeObjectURL(url);
    }

    // Use a processor (the old workaround path) to find out whether the global 'port' exists in the worklet scope.
    let processorReport = null;
    try {
      const node = new AudioWorkletNode(audio, 'wgr-port-probe');
      const reported = new Promise(resolve => { node.port.onmessage = e => resolve(e.data); });
      node.connect(audio.destination);
      audio.startRendering();
      processorReport = await WGR.withTimeout(reported, 3000, tr('message from the AudioWorkletProcessor', 'viesti AudioWorkletProcessorilta'));
    } catch (e) {
      r.field(tr('Processor', 'Prosessori'), e.message);
    }
    let globalReport = null;
    if (globalMessage) {
      try { globalReport = await WGR.withTimeout(globalMessage, processorReport ? 1000 : 3000, tr('message through the global port', 'viesti globaalin portin kautta')); }
      catch (e) { /* reported below */ }
    }

    const hasGlobalPort = processorReport ? processorReport.hasPort : null;
    r.field(tr('"port" in AudioWorkletGlobalScope', '"port" AudioWorkletGlobalScopessa'),
      hasGlobalPort === null ? tr('unknown', 'tuntematon') : hasGlobalPort ? tr('present', 'on') : tr('missing', 'puuttuu'));
    r.field(tr('Message from worklet to main thread', 'Viesti workletista pääsäikeeseen'),
      globalReport && globalReport.ok ? tr('received', 'vastaanotettu') : tr('not received', 'ei vastaanotettu'));

    if (mainPort && globalReport && globalReport.ok) {
      r.pass(tr('Audio Worklets have a global message port, so audio engines can communicate with the page without workarounds.',
        'Audio Workleteilla on globaali viestiportti, joten äänimoottorit voivat viestiä sivun kanssa ilman kiertoteitä.'));
    } else {
      r.warn(tr('Audio Worklets lack the global message port that the Web Audio specification added in 2022 (AudioWorklet.port / AudioWorkletGlobalScope.port). '
        + 'Games that run their audio in an Audio Worklet (e.g. Emscripten Wasm Audio Worklets) need a workaround, and audio may fail in games that rely on it.',
        'Audio Workleteista puuttuu globaali viestiportti, jonka Web Audio -määrittely lisäsi vuonna 2022 (AudioWorklet.port / AudioWorkletGlobalScope.port). '
        + 'Pelit, jotka suorittavat äänensä Audio Workletissa (esim. Emscriptenin Wasm Audio Worklets), tarvitsevat kiertotien, ja ääni voi lakata toimimasta siihen luottavissa peleissä.')
        + (ctx.isEngine('blink') ? tr(' This is a known Chrome issue.', ' Tämä on tunnettu Chromen ongelma.') : ''));
    }
  },
});
