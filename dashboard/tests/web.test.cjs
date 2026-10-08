const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function harness(fetchJSON = async () => fixture(), opts = {}) {
  const pages = {}, slots = {}, states = [], effects = [], timers = new Map();
  let cursor = 0, id = 0;
  const hooks = {
    useState(initial) {
      const n = cursor++;
      if (!(n in states)) states[n] = initial;
      return [states[n], v => { states[n] = typeof v === 'function' ? v(states[n]) : v; }];
    },
    useEffect(effect) { effects.push(effect); },
  };
  const React = {
    createElement(type, props, ...children) {
      return {type, props: props || {}, children: children.flat(Infinity)};
    }
  };
  const storage = new Map(Object.entries(opts.localStorage || {}));
  const localStorageMock = {
    getItem(k) {
      if (opts.throwStorage) throw new Error('storage blocked');
      return storage.has(k) ? storage.get(k) : null;
    },
    setItem(k, v) {
      if (opts.throwStorage) throw new Error('storage blocked');
      storage.set(k, String(v));
    },
    removeItem(k) {
      if (opts.throwStorage) throw new Error('storage blocked');
      storage.delete(k);
    },
    clear() {
      if (opts.throwStorage) throw new Error('storage blocked');
      storage.clear();
    }
  };
  const nav = opts.navigator !== undefined ? opts.navigator : undefined;
  const window = {
    __HERMES_PLUGIN_SDK__: {React, hooks, fetchJSON, ...(opts.sdkExtra || {})},
    __HERMES_PLUGINS__: {
      register(name, component) {pages[name] = component;},
      registerSlot(name, slot, component) {slots[slot] = component;}
    },
    localStorage: localStorageMock,
    navigator: nav,
  };
  assert.ok(fs.existsSync(path.join(root, 'index.js')), 'prebuilt index.js entrypoint must exist');
  const sandbox = {
    window,
    navigator: nav,
    localStorage: localStorageMock,
    AbortController, Date, Number, Intl, Object, Array, Math, Promise,
    setTimeout(fn, ms) {const n = ++id; timers.set(n, {fn, ms}); return n;},
    clearTimeout(n) {timers.delete(n);}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), sandbox);
  return {
    pages, slots, timers, states, storage,
    render(component = pages['headroom-monitor']) {cursor = 0; return resolve(component());},
    mount() {return effects.splice(0).map(e => e()).filter(Boolean);},
    async tick(ms = 5000) {
      const t = [...timers].find(([,v]) => v.ms === ms);
      assert.ok(t, `timer ${ms}`);
      timers.delete(t[0]);
      t[1].fn();
      await settle();
    }
  };
}

function resolve(node) {
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return resolve(node.type({...node.props, children:node.children}));
  return {...node, children:node.children.map(resolve)};
}
function text(node) {
  return !node ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join(' ');
}
function nodes(node, type) {
  return !node || typeof node !== 'object' ? [] : [...(node.type === type ? [node] : []), ...node.children.flatMap(n => nodes(n,type))];
}
async function settle() {
  for(let i=0; i<12; i++) await Promise.resolve();
}
function fixture() {
  return {
    available:true,
    sampled_at:new Date().toISOString(),
    scope:'proxy',
    summary:{
      mode:'auto',
      primary_model:'gpt-test',
      api_requests:12,
      requests_compressed:8,
      tokens_before:1000,
      tokens_saved:400,
      tokens_after:600,
      compression_pct_overall:40,
      avg_compression_pct:35,
      best_compression_pct:70,
      tool_schema_tokens_saved:25,
      codex_ws_tokens_saved:90,
      cost_without_usd:1,
      cost_with_usd:.6,
      compression_saved_usd:.4,
      provider_cache_discount_usd:.2,
      cost_savings_pct:40,
      uncompressed_requests:{below_threshold:4}
    },
    agents:[{
      agent:'hermes',
      label:'Main Agent',
      requests:12,
      before_tokens:1000,
      after_tokens:600,
      tokens_saved:400,
      savings_percent:40,
      models:['gpt-test'],
      providers:['openai']
    }],
    history:[{
      sampled_at:new Date().toISOString(),
      api_requests:12,
      tokens_before:1000,
      tokens_saved:400,
      compression_pct_overall:40
    }]
  };
}

test('prebuilt manifest and actual registry use supported mounts', () => {
  assert.ok(fs.existsSync(path.join(root,'manifest.json')), 'dashboard manifest must exist');
  const m = JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  assert.equal(m.name,'headroom-monitor');
  assert.equal(m.entry,'index.js');
  assert.equal(m.api,'plugin_api.py');
  assert.equal(m.css,'styles.css');
  assert.equal(m.tab.path,'/headroom-monitor');
  assert.notEqual(m.tab.hidden,true);
  const h = harness();
  assert.equal(typeof h.pages[m.name],'function');
  for(const slot of ['sidebar','header-right']) {
    assert.ok(m.slots.includes(slot));
    assert.equal(typeof h.slots[slot],'function');
  }
});

test('snapshot uses authenticated SDK helper and renders proxy metrics, estimates, agents and SVG (EN default)', async () => {
  const calls=[];
  const h = harness(async (url,opts) => {calls.push([url,opts]); return fixture();});
  assert.match(text(h.render()),/Loading/);
  const cleanups=h.mount();
  await settle();
  const tree=h.render();
  const t=text(tree);
  assert.equal(calls[0][0],'/api/plugins/headroom-monitor/snapshot');
  for(const s of [
    'Global proxy','not current chat','Before compression','After compression','Tokens saved',
    '400','600','1,000','Compressed requests','8','Provider cache discount','Estimated compression savings',
    '$0.40','$0.20','Main Agent','gpt-test','openai','below_threshold','Responses: chunk compression (HTTP/WS)','do not add'
  ]) {
    assert.ok(t.includes(s), s);
  }
  assert.equal(nodes(tree,'svg').length,1);
  assert.ok(nodes(tree,'polyline').length);
  assert.ok(!t.includes('490'),'WS must not be summed into total');
  cleanups.forEach(fn=>fn());
});

test('offline preserves last good data and recovers on the next bounded poll (EN default)', async () => {
  let attempt=0;
  const h=harness(async()=>{attempt++; if(attempt===2) throw Error('do not show secret diagnostic'); return fixture();});
  h.render();
  const cleanups=h.mount();
  await settle();
  assert.match(text(h.render()),/400/);
  await h.tick();
  const offline=text(h.render());
  assert.match(offline,/Cannot reach Headroom/);
  assert.match(offline,/Showing last good snapshot/);
  assert.match(offline,/400/);
  assert.ok(!offline.includes('secret diagnostic'));
  await h.tick();
  assert.ok(!text(h.render()).includes('Cannot reach Headroom'));
  cleanups.forEach(fn=>fn());
  assert.equal(h.timers.size,0);
});

test('unavailable and malformed snapshots do not masquerade as zero metrics (EN default)', async () => {
  for(const payload of [{available:false,sampled_at:new Date().toISOString(),scope:'proxy',summary:{},agents:[],history:[]},{...fixture(),scope:'chat'}]) {
    const h=harness(async()=>payload);
    h.render();
    const cleanup=h.mount();
    await settle();
    const t=text(h.render());
    assert.match(t,/Offline/);
    assert.ok(!t.includes('After compression'));
    cleanup.forEach(fn=>fn());
  }
});

test('stale snapshots and missing optional metrics remain honest (EN default)', async () => {
  const data=fixture();
  data.sampled_at='2020-01-01T00:00:00Z';
  data.summary.tokens_after=null;
  data.history=[];
  data.agents=[];
  const h=harness(async()=>data);
  h.render();
  const cleanup=h.mount();
  await settle();
  const t=text(h.render());
  assert.match(t,/Stale data/);
  assert.match(t,/—/);
  assert.match(t,/History is empty/);
  assert.match(t,/No agent breakdown available yet/);
  cleanup.forEach(fn=>fn());
});

test('polling shares one request across page and widgets and aborts on final unmount', async () => {
  const calls=[];
  let resolveFetch;
  const h=harness((url,opts)=>{calls.push(opts); return new Promise(r=>resolveFetch=r);});
  h.render();
  h.render(h.slots['sidebar']);
  h.render(h.slots['header-right']);
  const cleanup=h.mount();
  assert.equal(calls.length,1);
  cleanup[0]();
  assert.equal(calls[0].signal.aborted,false);
  cleanup[1]();
  cleanup[2]();
  assert.equal(calls[0].signal.aborted,true);
  resolveFetch(fixture());
  await settle();
  assert.equal(h.timers.size,0);
});

test('hung SDK request times out and resumes polling without overlap (EN default)', async () => {
  let calls=0;
  const h=harness(()=>{calls++; return new Promise(()=>{});});
  h.render();
  const cleanup=h.mount();
  assert.equal(calls,1);
  await h.tick(10000);
  assert.match(text(h.render()),/Offline/);
  await h.tick(5000);
  assert.equal(calls,2);
  cleanup.forEach(fn=>fn());
  await settle();
  assert.equal(h.timers.size,0);
});

test('accounting labels do not confuse subscription bills, global savings and repeated wire reductions (EN default)', async () => {
  const h=harness();
  h.render();
  const cleanup=h.mount();
  await settle();
  const t=text(h.render());
  for (const label of ['Tracked savings / tokens before optimization', 'Cumulative input tokens', 'subscription', 'wire context', 'Weighted average']) {
    assert.ok(t.includes(label), label);
  }
  cleanup.forEach(fn=>fn());
});

test('savings hints and chart denominator use tokens before optimization in EN and RU', async () => {
  for (const locale of ['en', 'ru']) {
    const h = harness(async () => fixture(), { localStorage: { 'headroom-monitor:locale': locale } });
    h.render();
    const cleanup = h.mount();
    await settle();
    try {
      const page = h.render();
      const card = label => nodes(page, 'div').find(n => n.props.className?.startsWith('hrm-metric') && text(n.children[0]) === label);
      const isRu = locale === 'ru';
      const count = value => new Intl.NumberFormat(isRu ? 'ru-RU' : 'en-US').format(value);
      assert.equal(text(nodes(card(isRu ? 'До сжатия' : 'Before compression'), 'strong')[0]), count(1000));
      const after = card(isRu ? 'После сжатия' : 'After compression');
      assert.equal(text(nodes(after, 'strong')[0]), count(600));
      assert.match(text(after), isRu ? /Накопленные входные токены/ : /Cumulative input tokens/);
      const saved = card(isRu ? 'Сэкономлено токенов' : 'Tokens saved');
      assert.equal(text(nodes(saved, 'p')[0]), isRu ? 'Учтённая экономия / база до оптимизации: 40%' : 'Tracked savings / tokens before optimization: 40%');
      const aria = nodes(page, 'svg')[0].props['aria-label'];
      assert.match(aria, isRu ? /экономия \/ база до оптимизации/ : /savings \/ tokens before optimization/);
      assert.doesNotMatch(aria, /cumulative input|накопленный вход/i);
      assert.doesNotMatch(text(saved), /66[.,]7%/); // savings / after would be the wrong denominator
    } finally {
      cleanup.forEach(fn => fn());
    }
  }
});

test('compression cost card never presents total cost savings share as compression-only savings in EN and RU', async () => {
  for (const locale of ['en', 'ru']) {
    const data = fixture();
    Object.assign(data.summary, { cost_with_usd: .7, compression_saved_usd: .24, provider_cache_discount_usd: .06, cost_savings_pct: 30 });
    const h = harness(async () => data, { localStorage: { 'headroom-monitor:locale': locale } });
    h.render();
    const cleanup = h.mount();
    await settle();
    try {
      const page = h.render();
      const label = locale === 'ru' ? 'Оценка экономии от сжатия' : 'Estimated compression savings';
      const card = nodes(page, 'div').find(n => n.props.className?.startsWith('hrm-metric') && text(n.children[0]) === label);
      assert.ok(card);
      const money = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
      assert.equal(text(nodes(card, 'strong')[0]), money.format(.24));
      assert.doesNotMatch(text(card), /30%|24%|of cost| стоимости/);
      const cacheLabel = locale === 'ru' ? 'Скидка кэша провайдера' : 'Provider cache discount';
      const cache = nodes(page, 'div').find(n => n.props.className?.startsWith('hrm-metric') && text(n.children[0]) === cacheLabel);
      assert.equal(text(nodes(cache, 'strong')[0]), money.format(.06));
    } finally {
      cleanup.forEach(fn => fn());
    }
  }
});

test('all backend uncompressed reasons have EN and RU labels with counts and unknown fallback', async () => {
  const backend = fs.readFileSync(path.join(root, 'plugin_api.py'), 'utf8');
  const reasonLiteral = backend.match(/UNCOMPRESSED_REASONS = frozenset\(\(([\s\S]*?)\)\)/);
  assert.ok(reasonLiteral, 'backend reason allowlist must be discoverable');
  const reasonKeys = [...reasonLiteral[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const labels = {
    prefix_frozen: ['Cacheable prefix preserved', 'Сохранён кешируемый префикс'],
    size_floor: ['Below minimum size', 'Ниже минимального размера'],
    no_savings: ['No savings', 'Нет выигрыша'],
    compressor_noop: ['No change after processing', 'Без изменений после обработки'],
    cache_hit: ['Cache hit', 'Попадание в кэш'],
    passthrough: ['Passthrough', 'Без обработки'],
    disabled: ['Compression disabled', 'Сжатие отключено'],
    below_threshold: ['Below threshold', 'Ниже порога'],
    compression_disabled: ['Compression disabled', 'Сжатие отключено'],
    no_compressible_content: ['No compressible content', 'Нет содержимого для сжатия'],
    error: ['Compression error', 'Ошибка сжатия'],
    ratio_too_high: ['Compression ratio too high', 'Слишком высокий коэффициент сжатия'],
    no_content: ['No content', 'Нет содержимого'],
    skipped: ['Compression skipped', 'Сжатие пропущено']
  };
  assert.deepEqual(Object.keys(labels).sort(), reasonKeys.slice().sort());
  for (const [index, locale] of ['en', 'ru'].entries()) {
    const data = fixture();
    data.summary.uncompressed_requests = Object.fromEntries(reasonKeys.map((key, i) => [key, i + 1]));
    data.summary.uncompressed_requests.future_reason = 99;
    const h = harness(async () => data, { localStorage: { 'headroom-monitor:locale': locale } });
    h.render();
    const cleanup = h.mount();
    await settle();
    try {
      const reasons = nodes(h.render(), 'dl')[0];
      const rows = reasons.children;
      assert.equal(rows.length, reasonKeys.length + 1);
      reasonKeys.forEach((key, i) => {
        const label = nodes(rows[i], 'dt')[0];
        assert.equal(text(label.children[0]), labels[key][index], key);
        assert.equal(text(nodes(rows[i], 'dd')[0]), String(i + 1), key);
        assert.ok(text(label).includes(key), 'technical reason key remains available');
      });
      assert.equal(text(nodes(rows.at(-1), 'dt')[0].children[0]), 'future_reason');
      assert.equal(text(nodes(rows.at(-1), 'dd')[0]), '99');
    } finally {
      cleanup.forEach(fn => fn());
    }
  }
});

test('small ratios use a readable chart scale and upstream anomalies stay marked (EN default)', async () => {
  const data=fixture();
  data.summary.best_compression_pct=282.4;
  data.history=[{...data.history[0],compression_pct_overall:.9}];
  const h=harness(async()=>data);
  h.render();
  const cleanup=h.mount();
  await settle();
  const t=text(h.render());
  assert.match(t,/accounting anomaly/);
  const chart=text(nodes(h.render(),'svg')[0]);
  assert.ok(chart.includes('1%'));
  assert.ok(!chart.includes('100%'));
  cleanup.forEach(fn=>fn());
});

test('styles inherit theme variables without fixed color fallbacks', () => {
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css));
  assert.ok(!css.includes('var(--foreground)'), 'Hermes --foreground is a transparent decorative layer, not text color');
});

test('EN default when no Russian system/browser locale', async () => {
  const h = harness(async () => fixture());
  h.render();
  const cleanup = h.mount();
  await settle();
  const page = h.render();
  assert.equal(page.props.lang, 'en');
  const t = text(page);
  assert.ok(t.includes('Fewer tokens. More context.'));
  assert.ok(t.includes('Before compression'));
  assert.ok(t.includes('Tokens saved'));
  assert.ok(t.includes('$0.40'));
  assert.ok(t.includes('1,000'));
  const selects = nodes(page, 'select');
  assert.equal(selects.length, 1);
  assert.equal(selects[0].props.value, 'auto');
  const optionLabels = nodes(selects[0], 'option').map(o => text(o));
  assert.deepEqual(optionLabels, ['Auto', 'English', 'Русский']);
  cleanup.forEach(fn => fn());
});

test('ru-RU auto detects Russian system locale and renders complete Russian UI', async () => {
  const h = harness(async () => fixture(), {
    navigator: { languages: ['ru-RU', 'ru', 'en-US'], language: 'ru-RU' }
  });
  h.render();
  const cleanup = h.mount();
  await settle();
  const page = h.render();
  assert.equal(page.props.lang, 'ru');
  const t = text(page);
  for (const s of [
    'Глобальный прокси', 'не текущий чат', 'Меньше токенов. Больше контекста.',
    'До сжатия', 'После сжатия', 'Сэкономлено токенов', 'Сжатые запросы',
    'Учётная база: вход + учтённая экономия', 'Качество сжатия', 'Стоимость · оценка, не счёт провайдера',
    'Почему запросы не сжаты', 'Область данных', 'Недавние запросы: сокращение переданного контекста'
  ]) {
    assert.ok(t.includes(s), s);
  }
  assert.ok(t.includes('0,40') || t.includes('0.40'));
  assert.ok(t.includes('1 000') || t.includes('1 000'));
  const sidebar = h.render(h.slots['sidebar']);
  assert.equal(sidebar.props.lang, 'ru');
  assert.ok(text(sidebar).includes('Сэкономлено токенов'));
  cleanup.forEach(fn => fn());
});

test('unsupported locales fall back to English', async () => {
  for (const lang of ['de-DE', 'fr', 'zh-CN', 'ja-JP', 'es']) {
    const h = harness(async () => fixture(), {
      navigator: { languages: [lang, 'en'], language: lang }
    });
    h.render();
    const cleanup = h.mount();
    await settle();
    const page = h.render();
    assert.equal(page.props.lang, 'en');
    const t = text(page);
    assert.ok(t.includes('Fewer tokens. More context.'));
    assert.ok(t.includes('Before compression'));
    cleanup.forEach(fn => fn());
  }
});

test('explicit EN and RU overrides persist and switch locale regardless of system locale', async () => {
  const hRu = harness(async () => fixture(), {
    navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage: { 'headroom-monitor:locale': 'ru' }
  });
  hRu.render();
  const cleanupRu = hRu.mount();
  await settle();
  const pageRu = hRu.render();
  assert.equal(pageRu.props.lang, 'ru');
  assert.ok(text(pageRu).includes('Меньше токенов. Больше контекста.'));
  cleanupRu.forEach(fn => fn());

  const hEn = harness(async () => fixture(), {
    navigator: { languages: ['ru-RU'], language: 'ru-RU' },
    localStorage: { 'headroom-monitor:locale': 'en' }
  });
  hEn.render();
  const cleanupEn = hEn.mount();
  await settle();
  const pageEn = hEn.render();
  assert.equal(pageEn.props.lang, 'en');
  assert.ok(text(pageEn).includes('Fewer tokens. More context.'));
  cleanupEn.forEach(fn => fn());

  // Interactive change via selector element
  const hInteractive = harness(async () => fixture(), {
    navigator: { languages: ['en-US'], language: 'en-US' }
  });
  hInteractive.render();
  const cleanupInteractive = hInteractive.mount();
  await settle();
  let page = hInteractive.render();
  assert.equal(page.props.lang, 'en');

  const select = nodes(page, 'select')[0];
  assert.ok(select);
  // Switch to ru
  select.props.onChange({ target: { value: 'ru' } });
  await settle();
  page = hInteractive.render();
  assert.equal(page.props.lang, 'ru');
  assert.equal(hInteractive.storage.get('headroom-monitor:locale'), 'ru');
  assert.ok(text(page).includes('Меньше токенов. Больше контекста.'));

  // Switch to en
  select.props.onChange({ target: { value: 'en' } });
  await settle();
  page = hInteractive.render();
  assert.equal(page.props.lang, 'en');
  assert.equal(hInteractive.storage.get('headroom-monitor:locale'), 'en');

  // Switch to auto
  select.props.onChange({ target: { value: 'auto' } });
  await settle();
  page = hInteractive.render();
  assert.equal(page.props.lang, 'en');
  assert.equal(hInteractive.storage.has('headroom-monitor:locale'), false);
  cleanupInteractive.forEach(fn => fn());
});

test('malformed preference falls back safely to auto resolution', async () => {
  for (const bad of ['unknown_locale', '{"json":true}', '12345', 'null']) {
    const h = harness(async () => fixture(), {
      localStorage: { 'headroom-monitor:locale': bad },
      navigator: { languages: ['en-US'], language: 'en-US' }
    });
    h.render();
    const cleanup = h.mount();
    await settle();
    const page = h.render();
    assert.equal(page.props.lang, 'en');
    assert.ok(text(page).includes('Fewer tokens. More context.'));
    cleanup.forEach(fn => fn());
  }
});

test('blocked localStorage handles security errors safely without crashing', async () => {
  const h = harness(async () => fixture(), {
    throwStorage: true,
    navigator: { languages: ['ru-RU'], language: 'ru-RU' }
  });
  h.render();
  const cleanup = h.mount();
  await settle();
  const page = h.render();
  assert.equal(page.props.lang, 'ru');
  assert.ok(text(page).includes('Меньше токенов. Больше контекста.'));
  cleanup.forEach(fn => fn());
});

test('host dashboard SDK useI18n hook is supported for locale detection', async () => {
  const h = harness(async () => fixture(), {
    navigator: null,
    sdkExtra: {
      useI18n: () => ({ locale: 'ru', setLocale: () => {} })
    }
  });
  h.render();
  const cleanup = h.mount();
  await settle();
  const page = h.render();
  assert.equal(page.props.lang, 'ru');
  assert.ok(text(page).includes('Меньше токенов. Больше контекста.'));
  cleanup.forEach(fn => fn());
});

module.exports = {harness,fixture,text,nodes,settle};
