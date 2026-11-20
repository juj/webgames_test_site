// Detects the WebGPU adapter (high-performance core -> compatibility -> fallback), creates the shared
// GPUDevice used by all later checks, and verifies that a WebGPU canvas context can be configured.
WGR.register({
  id: 'context',
  section: 'context',
  title: WGR.tr('WebGPU adapter, device and canvas context', 'WebGPU-adapteri, -laiteolio ja canvas-konteksti'),
  timeout: 20000,
  async run(ctx, r) {
    const tr = WGR.tr;
    const yesNo = (v) => v ? tr('yes', 'kyllä') : tr('no', 'ei');
    const b = ctx.browser;
    if (!ctx.gpu) {
      r.field('navigator.gpu', tr('missing', 'puuttuu'));
      let hint;
      if (!window.isSecureContext) {
        hint = tr('WebGPU is only available on secure (HTTPS) pages.', 'WebGPU on käytettävissä vain suojatuilla (HTTPS) sivuilla.');
      } else if (b.engine === 'gecko') {
        hint = tr('Firefox enables WebGPU by default only in recent versions on supported platforms. Update Firefox, or check that "dom.webgpu.enabled" is true in about:config.',
          'Firefox ottaa WebGPU:n oletuksena käyttöön vain uusimmissa versioissa tuetuilla alustoilla. Päivitä Firefox tai tarkista, että "dom.webgpu.enabled" on true-tilassa sivulla about:config.');
      } else if (b.engine === 'webkit') {
        hint = tr('Safari supports WebGPU starting from Safari 26 (macOS / iOS / iPadOS 26). Update your operating system.',
          'Safari tukee WebGPU:ta Safari 26:sta alkaen (macOS / iOS / iPadOS 26). Päivitä käyttöjärjestelmäsi.');
      } else if (b.engine === 'blink') {
        hint = tr('Update your browser. On Linux and some Android devices, WebGPU may still be disabled by default (try chrome://flags/#enable-unsafe-webgpu at your own risk).',
          'Päivitä selaimesi. Linuxissa ja joissakin Android-laitteissa WebGPU voi yhä olla oletuksena pois päältä (voit kokeilla asetusta chrome://flags/#enable-unsafe-webgpu omalla vastuullasi).');
      } else {
        hint = tr('Use a recent version of Chrome, Edge, Firefox or Safari.', 'Käytä Chromen, Edgen, Firefoxin tai Safarin uusinta versiota.');
      }
      r.error(tr(`This browser does not expose the WebGPU API (navigator.gpu is missing). ${hint}`,
        `Tämä selain ei tarjoa WebGPU-rajapintaa (navigator.gpu puuttuu). ${hint}`));
      return;
    }

    const tryAdapter = async (opts) => {
      try { return await ctx.gpu.requestAdapter(opts); } catch (e) { console.warn('[WGR] requestAdapter failed', opts, e); return null; }
    };
    const isFallback = (a) => !!((a.info && a.info.isFallbackAdapter) || a.isFallbackAdapter);

    // 1) High-performance core profile.
    let opts = { powerPreference: 'high-performance' };
    let adapter = await tryAdapter(opts);
    let level = adapter ? 'core' : null;

    // 2) Compatibility profile (OpenGL ES / D3D11 class hardware).
    if (!adapter) {
      opts = { powerPreference: 'high-performance', featureLevel: 'compatibility', compatibilityMode: true };
      adapter = await tryAdapter(opts);
      if (adapter) level = adapter.features.has('core-features-and-limits') ? 'core' : 'compatibility';
    }

    // 3) Fallback (software) adapter.
    if (!adapter) {
      opts = { forceFallbackAdapter: true };
      adapter = await tryAdapter(opts);
      if (adapter) level = 'fallback';
    }
    if (adapter && isFallback(adapter)) level = 'fallback';

    if (!adapter) {
      r.field('navigator.gpu', tr('present', 'olemassa'));
      r.field(tr('Adapter', 'Adapteri'), tr('none', 'ei mitään'));
      const gl = WGR.webglInfo();
      r.error(tr('The browser supports WebGPU, but no WebGPU adapter could be obtained (core, compatibility and fallback adapters were all unavailable). '
        + 'Common causes: the GPU or driver is on the browser\'s blocklist, the graphics driver is outdated, or hardware acceleration is turned off in the browser settings. '
        + 'Try updating your graphics driver and browser, and make sure hardware acceleration is enabled.',
        'Selain tukee WebGPU:ta, mutta WebGPU-adapteria ei saatu (core-, compatibility- eikä fallback-adapteria ollut saatavilla). '
        + 'Yleisiä syitä: näytönohjain tai sen ajuri on selaimen estolistalla, näytönohjaimen ajuri on vanhentunut tai laitteistokiihdytys on poistettu käytöstä selaimen asetuksista. '
        + 'Päivitä näytönohjaimen ajuri ja selain, ja varmista, että laitteistokiihdytys on käytössä.'));
      if (gl) r.info(tr(`WebGL reports the GPU as: ${gl.renderer}`, `WebGL ilmoittaa näytönohjaimeksi: ${gl.renderer}`));
      else r.warn(tr('WebGL is not available either, which suggests that GPU acceleration is disabled or unsupported in this browser.',
        'Myöskään WebGL ei ole käytettävissä, mikä viittaa siihen, että grafiikkakiihdytys on pois päältä tai sitä ei tueta tässä selaimessa.'));
      return;
    }

    ctx.adapter = adapter;
    ctx.adapterOptions = opts;
    ctx.featureLevel = level;
    let info = adapter.info;
    if (!info && adapter.requestAdapterInfo) { try { info = await adapter.requestAdapterInfo(); } catch (e) { /* ignore */ } }
    ctx.adapterInfo = info || null;

    // ---- Info fields ----
    r.field(tr('Adapter profile', 'Adapterin profiili'), {
      core: tr('Core (high-performance)', 'Core (suorituskykyinen)'),
      compatibility: tr('Compatibility', 'Compatibility (yhteensopivuustila)'),
      fallback: tr('Fallback (software)', 'Fallback (ohjelmistopohjainen)'),
    }[level]);
    if (info) {
      r.field(tr('GPU vendor', 'Näytönohjaimen valmistaja'), info.vendor);
      r.field(tr('GPU architecture', 'Näytönohjaimen arkkitehtuuri'), info.architecture);
      r.field(tr('GPU device', 'Näytönohjaimen laite'), info.device);
      r.field(tr('GPU description', 'Näytönohjaimen kuvaus'), info.description);
      if (info.subgroupMinSize) r.field(tr('Subgroup size', 'Aliryhmän (subgroup) koko'), `${info.subgroupMinSize}–${info.subgroupMaxSize}`);
    }
    r.field(tr('Fallback adapter', 'Fallback-adapteri'), yesNo(isFallback(adapter)));
    r.field(tr('Preferred canvas format', 'Suositeltu canvas-formaatti'), ctx.gpu.getPreferredCanvasFormat ? ctx.gpu.getPreferredCanvasFormat() : tr('(unknown)', '(tuntematon)'));
    const L = adapter.limits;
    const mb = (v) => `${(v / (1024 * 1024)).toFixed(0)} MB`;
    r.field(tr('Max texture size (2D)', 'Tekstuurin enimmäiskoko (2D)'), L.maxTextureDimension2D);
    r.field(tr('Max buffer size', 'Puskurin enimmäiskoko'), mb(L.maxBufferSize));
    r.field(tr('Max storage buffer binding', 'Storage-puskurin sidonnan enimmäiskoko'), mb(L.maxStorageBufferBindingSize));
    r.field(tr('Max storage buffers per stage', 'Storage-puskureita enintään per varjostinvaihe'), L.maxStorageBuffersPerShaderStage);
    r.field(tr('Max storage textures per stage', 'Storage-tekstuureja enintään per varjostinvaihe'), L.maxStorageTexturesPerShaderStage);
    r.field(tr('Max color attachments', 'Väriliitteitä (color attachments) enintään'), L.maxColorAttachments);
    r.field(tr('Max compute workgroup storage', 'Laskentatyöryhmän jaetun muistin enimmäiskoko'), `${L.maxComputeWorkgroupStorageSize} ${tr('bytes', 'tavua')}`);
    r.field(tr('Max compute invocations / workgroup', 'Laskentasäikeitä enintään / työryhmä'), L.maxComputeInvocationsPerWorkgroup);
    if (ctx.gpu.wgslLanguageFeatures) {
      r.field(tr('WGSL language features', 'WGSL-kielen ominaisuudet'), [...ctx.gpu.wgslLanguageFeatures].sort().join(', ') || tr('(none)', '(ei yhtään)'));
    }

    // ---- Profile verdict ----
    if (level === 'core') {
      r.pass(tr('A high-performance WebGPU adapter with the full core feature set is available.',
        'Suorituskykyinen WebGPU-adapteri, jolla on täysi core-ominaisuusjoukko, on käytettävissä.'));
    } else if (level === 'compatibility') {
      r.warn(tr('Only a WebGPU compatibility-profile adapter is available; the full core profile is not supported. '
        + 'This usually means the GPU or driver only supports older graphics APIs (such as OpenGL ES 3.1 or Direct3D 11). '
        + 'Many WebGPU games require the core profile and may refuse to start or run with reduced quality.',
        'Käytettävissä on vain WebGPU:n yhteensopivuusprofiilin (compatibility) adapteri; täyttä core-profiilia ei tueta. '
        + 'Tämä tarkoittaa yleensä, että näytönohjain tai sen ajuri tukee vain vanhempia grafiikkarajapintoja (kuten OpenGL ES 3.1 tai Direct3D 11). '
        + 'Monet WebGPU-pelit vaativat core-profiilin, joten ne eivät välttämättä käynnisty tai toimivat heikommalla laadulla.'));
    } else {
      r.warn(tr('Only a fallback (software-emulated) WebGPU adapter is available, so rendering runs on the CPU instead of the GPU. '
        + 'Games will run extremely slowly or not at all. Check that hardware acceleration is enabled and your graphics driver is up to date.',
        'Käytettävissä on vain ohjelmistopohjainen (fallback) WebGPU-adapteri, joten renderöinti tapahtuu suorittimella eikä näytönohjaimella. '
        + 'Pelit toimivat erittäin hitaasti tai eivät lainkaan. Tarkista, että laitteistokiihdytys on käytössä ja näytönohjaimen ajuri on ajan tasalla.'));
    }

    // ---- Device ----
    const device = await ctx.createDevice(adapter);
    if (!device) {
      const msg = ctx.deviceError ? ctx.deviceError.message : tr('unknown error', 'tuntematon virhe');
      r.error(tr(`A WebGPU adapter was found, but creating a GPUDevice failed: ${msg}.`,
        `WebGPU-adapteri löytyi, mutta GPUDevice-laiteolion luominen epäonnistui: ${msg}.`));
      return;
    }
    r.field(tr('Device enabled features', 'Laiteolion käyttöön otetut ominaisuudet'), device.features.size);

    // ---- Canvas context ----
    const canvas = document.createElement('canvas');
    canvas.className = 'preview';
    canvas.width = 320; canvas.height = 180;
    const gpuCtx = canvas.getContext('webgpu');
    if (!gpuCtx) {
      r.error(tr('Creating a "webgpu" canvas context failed (canvas.getContext("webgpu") returned null). Games cannot display anything on screen.',
        '"webgpu"-canvas-kontekstin luominen epäonnistui (canvas.getContext("webgpu") palautti null). Pelit eivät voi näyttää mitään ruudulla.'));
      return;
    }
    const format = ctx.gpu.getPreferredCanvasFormat();
    const scope = await WGR.errorScope(device, async () => {
      gpuCtx.configure({ device, format, alphaMode: 'opaque' });
      const module = device.createShaderModule({
        code: `
          struct VOut { @builtin(position) pos: vec4f, @location(0) color: vec3f };
          @vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
            var p = array<vec2f, 3>(vec2f(0.0, 0.8), vec2f(-0.8, -0.8), vec2f(0.8, -0.8));
            var c = array<vec3f, 3>(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
            var o: VOut; o.pos = vec4f(p[i], 0.0, 1.0); o.color = c[i]; return o;
          }
          @fragment fn fs(v: VOut) -> @location(0) vec4f { return vec4f(v.color, 1.0); }`,
      });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      });
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: gpuCtx.getCurrentTexture().createView(), clearValue: [0.08, 0.09, 0.12, 1], loadOp: 'clear', storeOp: 'store' }],
      });
      pass.setPipeline(pipeline);
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    });
    if (scope.exception || scope.errors.length) {
      r.error(tr(`The WebGPU canvas context could not be configured or rendered to: ${WGR.describeErrors(scope)}`,
        `WebGPU-canvas-kontekstia ei voitu määrittää tai siihen ei voitu renderöidä: ${WGR.describeErrors(scope)}`));
      return;
    }
    r.pass(tr(`A WebGPU canvas context was created and configured (${format}). You should see a red-green-blue triangle below:`,
      `WebGPU-canvas-konteksti luotiin ja määritettiin (${format}). Alla pitäisi näkyä punavihreäsininen kolmio:`));
    r.append(canvas);
  },
});
