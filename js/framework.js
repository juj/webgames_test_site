/*
 * WebGPU readiness checker - shared framework.
 *
 * Every check lives in its own file under tests/ and calls WGR.register({...}).
 * index.html loads this file first, then all tests/*.js, then calls WGR.runAll().
 *
 * A registered check looks like:
 *   WGR.register({
 *     id: 'unique-id',
 *     section: 'context' | 'features' | 'bugs',
 *     group: 'Firefox',                  // optional sub-heading inside a section
 *     engine: 'gecko',                   // optional: browser engine the bug is reported against
 *     bug: 'https://bugzil.la/123',      // optional: link(s) to the bug report
 *     title: WGR.tr('English title', 'Suomenkielinen otsikko'),
 *     timeout: 15000,                    // optional, ms
 *     async run(ctx, r) { r.pass('...'); r.info('...'); r.warn('...'); r.error('...'); r.na('...'); r.field(k, v); }
 *   });
 *
 * Localization: the page language is English or Finnish. It is chosen from the "?lang=fi" / "?lang=en" URL
 * parameter if present, otherwise from the browser's primary language. All user-visible strings are written
 * as WGR.tr(englishText, finnishText). Static text in index.html is translated via data-fi="..." attributes.
 */
'use strict';

(function () {
  // ---------------------------------------------------------------------------
  // Language selection
  // ---------------------------------------------------------------------------
  function detectLang() {
    let q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { /* ignore */ }
    if (q) {
      q = q.toLowerCase();
      if (q.startsWith('fi')) return 'fi';
      if (q.startsWith('en')) return 'en';
    }
    const primary = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^fi\b/i.test(primary) ? 'fi' : 'en';
  }
  const LANG = detectLang();

  /** Returns the Finnish text when the page language is Finnish, otherwise the English text. */
  function tr(en, fi) { return LANG === 'fi' && fi !== undefined ? fi : en; }

  function applyStaticTranslations() {
    document.documentElement.lang = LANG;
    if (LANG === 'fi') {
      document.querySelectorAll('[data-fi]').forEach(e => { e.textContent = e.getAttribute('data-fi'); });
    }
    document.querySelectorAll('.lang-switch a').forEach(a => {
      const active = a.dataset.lang === LANG;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'true');
    });
  }

  const LEVELS = ['na', 'pass', 'info', 'warn', 'error'];
  const LEVEL_LABEL = {
    na: tr('N/A', 'Ei koske'), pass: 'OK', info: tr('Info', 'Tieto'), warn: tr('Warning', 'Varoitus'), error: tr('Error', 'Virhe'),
  };
  const ENGINE_LABEL = { blink: 'Chrome / Chromium', gecko: 'Firefox', webkit: 'Safari / WebKit' };
  const tests = [];

  // ---------------------------------------------------------------------------
  // Browser / OS detection
  // ---------------------------------------------------------------------------
  function detectBrowser() {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    let name = tr('Unknown browser', 'Tuntematon selain'), engine = 'unknown', version = 0, m;

    if (isIOS) {
      // All iOS / iPadOS browsers use WebKit.
      engine = 'webkit';
      if ((m = ua.match(/CriOS\/(\d+)/))) { name = 'Chrome (iOS)'; }
      else if ((m = ua.match(/FxiOS\/(\d+)/))) { name = 'Firefox (iOS)'; }
      else if ((m = ua.match(/EdgiOS\/(\d+)/))) { name = 'Edge (iOS)'; }
      else if ((m = ua.match(/Version\/(\d+)/))) { name = 'Safari'; }
      version = m ? +m[1] : 0;
    } else if ((m = ua.match(/Firefox\/(\d+)/))) {
      name = 'Firefox'; engine = 'gecko'; version = +m[1];
    } else if ((m = ua.match(/Edg\/(\d+)/))) {
      name = 'Microsoft Edge'; engine = 'blink'; version = +m[1];
    } else if ((m = ua.match(/OPR\/(\d+)/))) {
      name = 'Opera'; engine = 'blink'; version = +m[1];
    } else if ((m = ua.match(/SamsungBrowser\/(\d+)/))) {
      name = 'Samsung Internet'; engine = 'blink'; version = +m[1];
    } else if ((m = ua.match(/Chrom(?:e|ium)\/(\d+)/))) {
      name = /Chromium\//.test(ua) ? 'Chromium' : 'Chrome'; engine = 'blink'; version = +m[1];
    } else if ((m = ua.match(/Version\/(\d+)(?:\.\d+)*.*Safari/))) {
      name = 'Safari'; engine = 'webkit'; version = +m[1];
    }

    let os = tr('Unknown OS', 'Tuntematon käyttöjärjestelmä');
    if (isIOS) os = /iPad/.test(ua) || navigator.maxTouchPoints > 1 ? 'iPadOS' : 'iOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    const mobile = isIOS || /Android|Mobi/.test(ua);
    return { name, engine, version, os, mobile, ua };
  }

  // ---------------------------------------------------------------------------
  // Generic helpers available to the checks as WGR.*
  // ---------------------------------------------------------------------------
  function withTimeout(promise, ms, what) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(tr(
          `${what || 'Operation'} timed out after ${ms} ms`,
          `${what || 'Toiminto'} aikakatkaistiin ${ms} ms jälkeen`))), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  /** Runs fn() inside validation / out-of-memory / internal error scopes. */
  async function errorScope(device, fn) {
    device.pushErrorScope('validation');
    device.pushErrorScope('out-of-memory');
    device.pushErrorScope('internal');
    let exception = null, result;
    try { result = await fn(); } catch (e) { exception = e; }
    const internal = await device.popErrorScope();
    const oom = await device.popErrorScope();
    const validation = await device.popErrorScope();
    const errors = [];
    if (validation) errors.push({ type: 'validation', message: validation.message });
    if (oom) errors.push({ type: 'out-of-memory', message: oom.message });
    if (internal) errors.push({ type: 'internal', message: internal.message });
    return { result, exception, errors };
  }

  function describeErrors(scope) {
    const typeLabel = {
      validation: tr('validation error', 'validointivirhe'),
      'out-of-memory': tr('out-of-memory error', 'muisti lopussa -virhe (out-of-memory)'),
      internal: tr('internal error', 'sisäinen virhe'),
    };
    const parts = scope.errors.map(e => `${typeLabel[e.type]}: ${e.message}`);
    if (scope.exception) parts.push(`${tr('exception', 'poikkeus')}: ${scope.exception.message || scope.exception}`);
    return parts.join('; ');
  }

  /** Copies `size` bytes of `src` into a staging buffer, maps it and returns an ArrayBuffer copy. */
  async function readBuffer(device, src, size, offset = 0, timeoutMs = 5000) {
    const staging = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(src, offset, staging, 0, size);
    device.queue.submit([enc.finish()]);
    await withTimeout(staging.mapAsync(GPUMapMode.READ), timeoutMs, 'GPUBuffer.mapAsync()');
    const copy = staging.getMappedRange().slice(0);
    staging.unmap();
    staging.destroy();
    return copy;
  }

  /** Reads back a 4-bytes-per-texel 2D texture as a tightly packed Uint8Array. */
  async function readTexture(device, texture, width, height) {
    const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
    const size = bytesPerRow * height;
    const buf = device.createBuffer({ size, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture }, { buffer: buf, bytesPerRow }, [width, height]);
    device.queue.submit([enc.finish()]);
    const data = new Uint8Array(await readBuffer(device, buf, size));
    buf.destroy();
    const out = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; ++y) out.set(data.subarray(y * bytesPerRow, y * bytesPerRow + width * 4), y * width * 4);
    return out;
  }

  let webglInfoCache;
  /** Returns {vendor, renderer} strings from WebGL, used to identify the GPU when WebGPU is unavailable. */
  function webglInfo() {
    if (webglInfoCache !== undefined) return webglInfoCache;
    webglInfoCache = null;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        webglInfoCache = {
          vendor: String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR) || ''),
          renderer: String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''),
        };
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (e) { /* ignore */ }
    return webglInfoCache;
  }

  // A 2x2 RGBA PNG: top row red, green; bottom row blue, (200,100,50,128 alpha).
  const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP4z8DwHwwZGP7/P5Fi1AAARQIH2YQeyqkAAAAASUVORK5CYII=';
  const TEST_PNG_PIXELS = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [200, 100, 50, 128]];
  function testPngBlob() {
    const bin = atob(TEST_PNG_BASE64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; ++i) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  }

  /** Uploads an ImageBitmap into an rgba8unorm texture via copyExternalImageToTexture and reads it back. */
  async function bitmapToPixels(device, bitmap) {
    const w = bitmap.width, h = bitmap.height;
    const tex = device.createTexture({
      size: [w, h], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: tex, premultipliedAlpha: false }, [w, h]);
    const px = await readTexture(device, tex, w, h);
    tex.destroy();
    return px;
  }

  function pixelsMatch(actual, expected, tolerance) {
    for (let i = 0; i < expected.length; ++i) {
      for (let c = 0; c < 4; ++c) {
        if (Math.abs(actual[i * 4 + c] - expected[i][c]) > tolerance) return false;
      }
    }
    return true;
  }

  function formatPixels(px, count) {
    const out = [];
    for (let i = 0; i < count; ++i) out.push(`(${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]},${px[i * 4 + 3]})`);
    return out.join(' ');
  }

  // ---------------------------------------------------------------------------
  // Shared context passed to all checks
  // ---------------------------------------------------------------------------
  function createContext() {
    const ctx = {
      lang: LANG,
      browser: detectBrowser(),
      gpu: navigator.gpu || null,
      adapter: null,          // GPUAdapter used for the run (set by tests/context.js)
      adapterInfo: null,      // GPUAdapterInfo
      adapterOptions: null,   // options that produced `adapter` (used to recreate a lost device)
      featureLevel: null,     // 'core' | 'compatibility' | 'fallback' | null
      device: null,
      deviceLost: false,
      deviceError: null,

      isEngine(engine) { return this.browser.engine === engine; },

      /** Lower-case string describing the GPU from WebGPU adapter info and WebGL renderer strings. */
      gpuIdentity() {
        const parts = [];
        const i = this.adapterInfo;
        if (i) parts.push(i.vendor, i.architecture, i.device, i.description);
        const gl = webglInfo();
        if (gl) parts.push(gl.vendor, gl.renderer);
        return parts.filter(Boolean).join(' | ').toLowerCase();
      },

      /** Returns a working GPUDevice, recreating it if a previous check caused a device loss. */
      async getDevice() {
        if (this.device && !this.deviceLost) return this.device;
        if (!this.gpu || !this.adapterOptions) return null;
        const adapter = await this.gpu.requestAdapter(this.adapterOptions);
        if (!adapter) return null;
        await this.createDevice(adapter);
        return this.device;
      },

      async createDevice(adapter) {
        this.device = null;
        this.deviceLost = false;
        // Enable every feature the adapter offers so feature-specific checks can run.
        const features = [...adapter.features];
        let device = null;
        try {
          device = await adapter.requestDevice({ label: 'wgr-device', requiredFeatures: features });
        } catch (e) {
          this.deviceError = e;
          try { device = await adapter.requestDevice({ label: 'wgr-device' }); } catch (e2) { this.deviceError = e2; }
        }
        if (!device) return null;
        device.lost.then(info => {
          if (this.device === device) this.deviceLost = true;
          console.warn('[WGR] GPUDevice lost:', info.reason, info.message);
        });
        device.addEventListener('uncapturederror', ev => console.error('[WGR] Uncaptured WebGPU error:', ev.error.message));
        this.device = device;
        return device;
      },
    };
    return ctx;
  }

  // ---------------------------------------------------------------------------
  // Reporting / DOM
  // ---------------------------------------------------------------------------
  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  class Reporter {
    constructor(test, card) {
      this.test = test;
      this.card = card;
      this.body = card.querySelector('.card-body');
      this.worst = null;
      this.notes = [];
      this.fields = [];
      this.fieldTable = null;
    }
    _bump(level) {
      if (this.worst === null || LEVELS.indexOf(level) > LEVELS.indexOf(this.worst)) this.worst = level;
    }
    note(level, text) {
      this._bump(level);
      this.notes.push({ level, text });
      const n = el('div', `note note-${level}`);
      n.appendChild(el('span', 'note-badge', LEVEL_LABEL[level]));
      n.appendChild(el('span', 'note-text', text));
      this.body.appendChild(n);
    }
    pass(text) { this.note('pass', text); }
    info(text) { this.note('info', text); }
    warn(text) { this.note('warn', text); }
    error(text) { this.note('error', text); }
    na(text) { this.note('na', text); }
    /** Adds an (info) key/value row to the card's field table. */
    field(name, value) {
      if (value === undefined || value === null || value === '') value = tr('(not reported)', '(ei ilmoitettu)');
      this.fields.push({ name, value: String(value) });
      if (!this.fieldTable) {
        this.fieldTable = el('table', 'fields');
        this.body.appendChild(this.fieldTable);
      }
      const tr_ = el('tr');
      tr_.appendChild(el('th', '', name));
      tr_.appendChild(el('td', '', String(value)));
      this.fieldTable.appendChild(tr_);
    }
    /** Appends an arbitrary DOM element (e.g. a canvas) to the card. */
    append(node) { this.body.appendChild(node); }
    /**
     * Adds a button to the card that runs fn(reporter) when clicked. Use this for checks that need a user gesture
     * (e.g. starting audio). fn runs synchronously inside the click handler until its first await, so gesture-gated
     * calls such as AudioContext.resume() must come first. The card status and overall verdict are updated afterwards.
     */
    deferUntilClick(label, fn) {
      const btn = el('button', 'card-action', label);
      this.body.appendChild(btn);
      btn.onclick = async () => {
        btn.disabled = true;
        try { await fn(this); } catch (e) {
          this.error(tr(`The check could not complete: ${e && e.message ? e.message : e}`,
            `Tarkistusta ei voitu suorittaa loppuun: ${e && e.message ? e.message : e}`));
        }
        btn.remove();
        if (this.onUpdate) this.onUpdate();
      };
    }
  }

  function createCard(test, ctx) {
    const sectionEl = document.getElementById(`section-${test.section}`) || document.getElementById('section-bugs');
    let container = sectionEl.querySelector('.cards');
    if (test.group) {
      const gid = `group-${test.section}-${test.group.replace(/[^a-z0-9]+/gi, '-')}`;
      container = document.getElementById(gid);
      if (!container) {
        sectionEl.appendChild(el('h3', 'group-title', test.group));
        container = el('div', 'cards');
        container.id = gid;
        sectionEl.appendChild(container);
      }
    }
    const card = el('div', 'card status-running');
    const head = el('div', 'card-head');
    head.appendChild(el('span', 'status-badge', tr('Running…', 'Käynnissä…')));
    head.appendChild(el('span', 'card-title', test.title));
    if (test.engine) {
      const tag = el('span', 'tag', ENGINE_LABEL[test.engine] || test.engine);
      if (ctx.browser.engine === test.engine) {
        tag.classList.add('tag-match');
        tag.title = tr('Reported against your browser engine', 'Raportoitu käyttämällesi selainmoottorille');
      }
      head.appendChild(tag);
    }
    for (const url of [].concat(test.bug || [])) {
      const a = el('a', 'bug-link', url.replace(/^https?:\/\//, ''));
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      head.appendChild(a);
    }
    card.appendChild(head);
    card.appendChild(el('div', 'card-body'));
    container.appendChild(card);
    return card;
  }

  function finishCard(card, level) {
    for (const c of [...card.classList]) if (c.startsWith('status-')) card.classList.remove(c);
    card.classList.add(`status-${level}`);
    card.querySelector('.status-badge').textContent = LEVEL_LABEL[level];
  }

  function renderVerdict(results, ctx) {
    const v = document.getElementById('verdict');
    const count = lvl => results.filter(r => r.level === lvl).length;
    const errors = count('error'), warns = count('warn');
    const context = results.find(r => r.test.id === 'context');
    let cls, headline, detail;
    if (!ctx.gpu || !ctx.adapter || !ctx.device || (context && context.level === 'error')) {
      cls = 'error';
      headline = tr('No — WebGPU games will not run here.', 'Ei — WebGPU-pelit eivät toimi tässä ympäristössä.');
      detail = tr('A usable WebGPU device could not be created. See the errors below for details and suggestions.',
        'Käyttökelpoista WebGPU-laiteoliota ei voitu luoda. Katso alla olevista virheistä lisätietoja ja korjausehdotuksia.');
    } else if (errors) {
      cls = 'error';
      headline = tr('Partially — WebGPU works, but problems were found.', 'Osittain — WebGPU toimii, mutta ongelmia löytyi.');
      detail = tr(`${errors} check(s) reported errors that may break or visibly degrade WebGPU games.`,
        `Virheitä löytyi ${errors} tarkistuksessa. Ne voivat estää WebGPU-pelien toiminnan tai heikentää niiden ulkoasua näkyvästi.`);
    } else if (warns) {
      cls = 'warn';
      headline = tr('Mostly — WebGPU works, with some caveats.', 'Pääosin — WebGPU toimii, mutta pienin varauksin.');
      detail = tr(`${warns} check(s) reported warnings. Games should run, but possibly with reduced performance or quality.`,
        `Varoituksia löytyi ${warns} tarkistuksessa. Pelien pitäisi toimia, mutta mahdollisesti heikommalla suorituskyvyllä tai laadulla.`);
    } else {
      cls = 'pass';
      headline = tr('Yes! Your device and browser are ready for WebGPU games.', 'Kyllä! Laitteesi ja selaimesi ovat valmiita WebGPU-peleihin.');
      detail = tr('All checks passed.', 'Kaikki tarkistukset menivät läpi.');
    }
    v.className = `verdict verdict-${cls}`;
    v.innerHTML = '';
    v.appendChild(el('div', 'verdict-headline', headline));
    v.appendChild(el('div', 'verdict-detail', detail));
    v.appendChild(el('div', 'verdict-summary', tr(
      `${count('pass')} OK · ${count('info')} info · ${warns} warnings · ${errors} errors · ${count('na')} not applicable`,
      `${count('pass')} OK · ${count('info')} tietoa · ${warns} varoitusta · ${errors} virhettä · ${count('na')} ei koske`)));
    document.getElementById('copy-report').disabled = false;
  }

  function textReport(results, ctx) {
    const lines = [
      tr('WebGPU readiness report', 'WebGPU-valmiusraportti'),
      `${tr('Date', 'Päivämäärä')}: ${new Date().toISOString()}`,
      `${tr('User agent', 'Selaimen tunniste')}: ${ctx.browser.ua}`,
      '',
    ];
    for (const r of results) {
      lines.push(`[${LEVEL_LABEL[r.level]}] ${r.test.title}${r.test.bug ? ' (' + [].concat(r.test.bug).join(', ') + ')' : ''}`);
      for (const f of r.reporter.fields) lines.push(`    ${f.name}: ${f.value}`);
      for (const n of r.reporter.notes) lines.push(`    - ${LEVEL_LABEL[n.level]}: ${n.text}`);
    }
    return lines.join('\n');
  }

  async function runAll() {
    const ctx = createContext();
    const cards = tests.map(t => createCard(t, ctx));
    const results = [];
    for (let i = 0; i < tests.length; ++i) {
      const test = tests[i];
      const r = new Reporter(test, cards[i]);
      try {
        await withTimeout(Promise.resolve().then(() => test.run(ctx, r)), test.timeout || 15000, tr('Check', 'Tarkistus'));
      } catch (e) {
        console.error(`[WGR] Check '${test.id}' failed:`, e);
        r.error(tr(`The check could not complete: ${e && e.message ? e.message : e}`,
          `Tarkistusta ei voitu suorittaa loppuun: ${e && e.message ? e.message : e}`));
      }
      if (r.worst === null) r.pass(tr('Passed.', 'Läpäisty.'));
      finishCard(cards[i], r.worst);
      const result = { test, level: r.worst, reporter: r };
      results.push(result);
      // Checks with deferred (click-triggered) parts update their card and the verdict later.
      r.onUpdate = () => {
        result.level = r.worst;
        finishCard(cards[i], r.worst);
        if (results.length === tests.length) renderVerdict(results, ctx);
      };
    }
    renderVerdict(results, ctx);
    document.getElementById('copy-report').onclick = async () => {
      const text = textReport(results, ctx);
      try { await navigator.clipboard.writeText(text); alert(tr('Report copied to clipboard.', 'Raportti kopioitu leikepöydälle.')); }
      catch (e) { const w = window.open('', '_blank'); if (w) { w.document.body.innerText = text; } }
    };
    window.WGR.lastResults = results;
    window.WGR.ctx = ctx;
    return results;
  }

  window.WGR = {
    lang: LANG,
    tr,
    register(test) { tests.push(test); },
    runAll,
    withTimeout,
    errorScope,
    describeErrors,
    readBuffer,
    readTexture,
    webglInfo,
    testPngBlob,
    TEST_PNG_PIXELS,
    bitmapToPixels,
    pixelsMatch,
    formatPixels,
  };

  // framework.js is loaded at the end of <body>, so the static DOM is already available.
  applyStaticTranslations();
})();
