// bugzil.la/1283029: Firefox lacks the modern spatial AudioListener API (positionX/Y/Z, forwardX/Y/Z, upX/Y/Z
// AudioParams); only the deprecated setPosition() / setOrientation() methods are available.
WGR.register({
  id: 'firefox-1283029',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/1283029',
  title: WGR.tr('Modern 3D spatial audio AudioListener API missing', '3D-tilaäänen moderni AudioListener-rajapinta puuttuu'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const AL = window.AudioListener;
    if (!AL || !(window.AudioContext || window.webkitAudioContext)) {
      r.warn(tr('The Web Audio API is not available. Games will have no sound.', 'Web Audio -rajapinta ei ole käytettävissä. Peleissä ei ole ääntä.'));
      return;
    }
    const props = ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'];
    const missing = props.filter(p => !(p in AL.prototype));
    const legacy = typeof AL.prototype.setPosition === 'function' && typeof AL.prototype.setOrientation === 'function';
    r.field(tr('AudioListener position/orientation AudioParams', 'AudioListenerin sijainti- ja suunta-AudioParamit'),
      missing.length ? tr(`missing: ${missing.join(', ')}`, `puuttuu: ${missing.join(', ')}`) : tr('available', 'käytettävissä'));
    r.field(tr('Legacy setPosition()/setOrientation()', 'Vanhat setPosition()/setOrientation()'),
      legacy ? tr('available', 'käytettävissä') : tr('missing', 'puuttuu'));

    if (!missing.length) {
      r.pass(tr('The modern AudioListener API for 3D spatial audio is supported.', '3D-tilaäänen moderni AudioListener-rajapinta on tuettu.'));
    } else if (legacy) {
      r.info(tr('The modern AudioListener API is not supported. Games fall back to the deprecated setPosition()/setOrientation() methods, '
        + 'so 3D positional audio works, but listener movement cannot be smoothly automated.',
        'Modernia AudioListener-rajapintaa ei tueta. Pelit käyttävät sen sijaan vanhentuneita setPosition()/setOrientation()-metodeja, '
        + 'joten 3D-sijaintiääni toimii, mutta kuuntelijan liikettä ei voi automatisoida sulavasti.'));
    } else {
      r.warn(tr('Neither the modern nor the legacy AudioListener API is available. 3D positional audio in games will not work.',
        'Modernia eikä vanhaa AudioListener-rajapintaa ole käytettävissä. Pelien 3D-sijaintiääni ei toimi.'));
    }
  },
});
