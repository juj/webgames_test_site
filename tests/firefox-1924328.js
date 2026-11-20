// bugzil.la/1924328: Dual-source blending not supported in Firefox.
// If the "dual-source-blending" feature is exposed, creates a pipeline that actually uses it.
WGR.register({
  id: 'firefox-1924328',
  section: 'bugs',
  group: 'Firefox',
  engine: 'gecko',
  bug: 'https://bugzil.la/1924328',
  title: WGR.tr('Dual-source blending support', 'Kaksilähteisen sekoituksen (dual-source blending) tuki'),
  async run(ctx, r) {
    const tr = WGR.tr;
    const device = await ctx.getDevice();
    if (!device) { r.na(tr('No WebGPU device available.', 'WebGPU-laiteoliota ei ole käytettävissä.')); return; }
    const ff = ctx.isEngine('gecko') ? tr(' This is a known Firefox limitation.', ' Tämä on Firefoxin tunnettu rajoitus.') : '';
    if (!device.features.has('dual-source-blending')) {
      r.warn(tr('The "dual-source-blending" feature is not available. Games using it fall back to slower multi-pass or lower-quality blending.',
        '"dual-source-blending"-ominaisuus ei ole käytettävissä. Sitä käyttävät pelit joutuvat turvautumaan hitaampaan monivaiheiseen tai heikkolaatuisempaan sekoitukseen.') + ff);
      return;
    }
    const scope = await WGR.errorScope(device, async () => {
      const module = device.createShaderModule({
        code: `
          enable dual_source_blending;
          struct FOut { @location(0) @blend_src(0) color: vec4f, @location(0) @blend_src(1) blend: vec4f };
          @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
            var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
            return vec4f(p[i], 0.0, 1.0);
          }
          @fragment fn fs() -> FOut { var o: FOut; o.color = vec4f(1.0, 0.5, 0.25, 1.0); o.blend = vec4f(0.5); return o; }`,
      });
      const info = await module.getCompilationInfo();
      const errs = info.messages.filter(m => m.type === 'error');
      if (errs.length) throw new Error(tr(`shader compilation failed: ${errs.map(m => m.message).join('; ')}`,
        `varjostimen kääntäminen epäonnistui: ${errs.map(m => m.message).join('; ')}`));
      device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: {
          module, entryPoint: 'fs',
          targets: [{
            format: 'rgba8unorm',
            blend: {
              color: { srcFactor: 'one', dstFactor: 'src1', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'src1-alpha', operation: 'add' },
            },
          }],
        },
      });
    });
    if (!scope.exception && !scope.errors.length) {
      r.pass(tr('Dual-source blending is supported and a pipeline using it was created successfully.',
        'Kaksilähteinen sekoitus on tuettu, ja sitä käyttävä liukuhihna (pipeline) luotiin onnistuneesti.'));
    } else {
      r.error(tr(`"dual-source-blending" is advertised, but creating a pipeline that uses it failed: ${WGR.describeErrors(scope)}`,
        `"dual-source-blending" ilmoitetaan tuetuksi, mutta sitä käyttävän liukuhihnan luominen epäonnistui: ${WGR.describeErrors(scope)}`));
    }
  },
});
