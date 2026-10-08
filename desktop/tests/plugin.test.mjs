import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(`${process.env.HERMES_TEST_DEPS || '/config/.hermes/cache/scratch/headroom-ui-deps'}/package.json`);
const React = require('react');
const runtime = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');
const rq = require('@tanstack/react-query');
const source = await readFile(new URL('../plugin.js', import.meta.url), 'utf8');
const atom = value => ({ get: () => value });
const state = { gateway: atom('open'), connectionId: atom('haos'), profile: atom('default'), focusedSessionProfile: atom('default'), focusedSessionOwner: atom({ connectionId: 'haos', profile: 'default' }) };
let options, currentClient, navigation;
const host = { state, navigate: path => { navigation = path; } };
const sdk = { host, useValue: a => a.get(), useQuery: opts => { options = opts; return rq.useQuery(opts); }, Button: ({ children, variant, size, ...p }) => React.createElement('button', p, children), Tip: ({ children }) => children, PANES_AREA: 'panes', ROUTES_AREA: 'routes', SIDEBAR_NAV_AREA: 'sidebar', STATUSBAR_AREAS: { right: 'status.right' }, PALETTE_AREA: 'palette' };

const storageMap = new Map();
let storageBlocked = false;
const localStorageMock = {
  getItem: k => { if (storageBlocked) throw new Error('Blocked storage'); return storageMap.get(k) ?? null; },
  setItem: (k, v) => { if (storageBlocked) throw new Error('Blocked storage'); storageMap.set(k, String(v)); },
  removeItem: k => { if (storageBlocked) throw new Error('Blocked storage'); storageMap.delete(k); }
};

const context = vm.createContext({
  console, Date, Intl, Number, Math, Object, Array, String, Error, setTimeout, clearTimeout,
  localStorage: localStorageMock
});
const module = new vm.SourceTextModule(source, { context });
await module.link(spec => {
  const exports = spec === '@hermes/plugin-sdk' ? sdk : spec === 'react/jsx-runtime' ? runtime : spec === 'react' ? React : null;
  assert.ok(exports, `Forbidden import ${spec}`);
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
});
await module.evaluate();
const contributions = [];
const calls = [];
const ctx = {
  source: 'plugin:headroom-monitor',
  storage: {
    get: k => { if (storageBlocked) throw new Error('Blocked storage'); return storageMap.get(k); },
    set: (k, v) => { if (storageBlocked) throw new Error('Blocked storage'); storageMap.set(k, v); },
    remove: k => { if (storageBlocked) throw new Error('Blocked storage'); storageMap.delete(k); }
  },
  register: c => { contributions.push(c); return () => {}; },
  registerMany: cs => { contributions.push(...cs); return () => {}; },
  rest: async (...args) => { calls.push(args); return snapshot; }
};
module.namespace.default.register(ctx);
const summary = { mode: 'active', primary_model: 'gpt-test', api_requests: 10, requests_compressed: 4, avg_compression_pct: 60, best_compression_pct: 80, tokens_before: 10000, tokens_saved: 2400, tokens_after: 7600, compression_pct_overall: 24, tool_schema_tokens_saved: 50, codex_ws_tokens_saved: 800, cost_without_usd: 1, cost_with_usd: .7, compression_saved_usd: .24, provider_cache_discount_usd: .06, cost_savings_pct: 30, uncompressed_requests: { below_threshold: 6 } };
let snapshot = { available: true, scope: 'proxy', sampled_at: new Date().toISOString(), summary, agents: [{ agent: 'main', label: 'Основной', requests: 10, before_tokens: 10000, after_tokens: 7600, tokens_saved: 2400, savings_percent: 24, models: ['gpt-test'], providers: ['openai'] }], history: [{ sampled_at: new Date(Date.now() - 5000).toISOString(), api_requests: 9, tokens_before: 9000, tokens_saved: 2160, compression_pct_overall: 24 }, { sampled_at: new Date().toISOString(), api_requests: 10, tokens_before: 10000, tokens_saved: 2400, compression_pct_overall: 24 }] };

function resetLocaleState() {
  storageMap.clear();
  storageBlocked = false;
  delete context.navigator;
}

function render(id = 'pane', data = snapshot) {
  currentClient = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
  const contribution = contributions.find(c => c.id === id);
  renderToStaticMarkup(React.createElement(rq.QueryClientProvider, { client: currentClient }, contribution.render()));
  if (data) currentClient.setQueryData(options.queryKey, data);
  const html = renderToStaticMarkup(React.createElement(rq.QueryClientProvider, { client: currentClient }, contribution.render()));
  currentClient.clear();
  return html;
}

test('contract and supported five surfaces with localized metadata', () => {
  resetLocaleState();
  assert.equal(module.namespace.default.id, 'headroom-monitor');
  assert.equal(module.namespace.default.defaultEnabled, false);
  assert.equal(contributions.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(contributions.find(c => c.id === 'pane').data)), { placement: 'right', dock: { pane: 'workspace', pos: 'right' }, width: '350px' });
  assert.ok(module.namespace.default.name.includes('Headroom'));
});

test('EN default renders English metrics, headers and scoped global label', () => {
  resetLocaleState();
  const html = render();
  for (const value of ['Entire proxy', '24', '60', 'Основной', 'openai', 'gpt-test', 'Responses', 'Provider cache', 'svg', 'details', '$0.24', 'Context Efficiency', 'Attributed input token savings']) {
    assert.ok(html.includes(value), `Expected EN html to include: ${value}`);
  }
  assert.ok(!html.includes('NaN'));
});

test('accounting labels distinguish attributed savings, wire reductions and subscription prices in EN and RU', () => {
  resetLocaleState();
  const htmlEn = render();
  for (const value of ['Attributed savings', 'HTTP/WS', 'subscription', 'wire context', 'weighted']) {
    assert.ok(htmlEn.includes(value), `Expected EN accounting label: ${value}`);
  }
  ctx.storage.set('locale', 'ru');
  const htmlRu = render();
  for (const value of ['Учтённая экономия', 'HTTP/WS', 'подписки', 'переданного контекста', 'взвешенное']) {
    assert.ok(htmlRu.includes(value), `Expected RU accounting label: ${value}`);
  }
  resetLocaleState();
});

test('visible selector Auto/English/Русский is rendered and accessible', () => {
  resetLocaleState();
  const html = render();
  assert.ok(html.includes('<select'), 'Select element present');
  assert.ok(html.includes('Auto'), 'Auto option present');
  assert.ok(html.includes('English'), 'English option present');
  assert.ok(html.includes('Русский'), 'Русский option present');
});

test('automatic Russian detection when system locale is ru-RU', () => {
  resetLocaleState();
  context.navigator = { language: 'ru-RU', languages: ['ru-RU', 'ru'] };
  const html = render();
  for (const value of ['Весь прокси', 'Эффективность контекста', 'Кэш провайдера', 'Учтённая экономия']) {
    assert.ok(html.includes(value), `Expected auto ru-RU to include: ${value}`);
  }
  resetLocaleState();
});

test('manual override to Russian via storage renders Russian even on EN system', () => {
  resetLocaleState();
  context.navigator = { language: 'en-US', languages: ['en-US'] };
  ctx.storage.set('locale', 'ru');
  const html = render();
  assert.ok(html.includes('Весь прокси'), 'Expected Russian override');
  assert.ok(html.includes('Эффективность контекста'), 'Expected Russian header');
  resetLocaleState();
});

test('manual override to English via storage renders English even on RU system', () => {
  resetLocaleState();
  context.navigator = { language: 'ru-RU', languages: ['ru-RU'] };
  ctx.storage.set('locale', 'en');
  const html = render();
  assert.ok(html.includes('Entire proxy'), 'Expected English override');
  assert.ok(html.includes('Context Efficiency'), 'Expected English header');
  resetLocaleState();
});

test('Russian detection does not match unrelated ru-prefixed language codes', () => {
  resetLocaleState();
  context.navigator = { language: 'rum', languages: ['rum'] };
  assert.ok(render().includes('Entire proxy'));
  resetLocaleState();
});

test('unsupported locale falls back to English', () => {
  resetLocaleState();
  context.navigator = { language: 'de-DE', languages: ['de-DE'] };
  const htmlAuto = render();
  assert.ok(htmlAuto.includes('Entire proxy'), 'Expected de-DE to fallback to English');
  ctx.storage.set('locale', 'fr');
  const htmlOverride = render();
  assert.ok(htmlOverride.includes('Entire proxy'), 'Expected unsupported fr to fallback to English');
  resetLocaleState();
});

test('missing globals and blocked storage handle gracefully without crashing', () => {
  resetLocaleState();
  delete context.navigator;
  storageBlocked = true;
  const html = render();
  assert.ok(html.includes('Entire proxy'), 'Expected clean English render despite blocked storage');
  storageBlocked = false;
  resetLocaleState();
});

test('backend count maps render provider and model identifiers', () => {
  resetLocaleState();
  const html = render('pane', { ...snapshot, agents: [{ ...snapshot.agents[0], models: { 'map-model': 10 }, providers: { 'map-provider': 10 } }] });
  assert.ok(html.includes('map-model'));
  assert.ok(html.includes('map-provider'));
});

test('small history ratios remain visible and impossible upstream percentages are explicit in EN and RU', () => {
  resetLocaleState();
  const htmlEn = render('pane', { ...snapshot, summary: { ...summary, best_compression_pct: 282.4 }, history: snapshot.history.map(p=>({...p,compression_pct_overall:.9})) });
  assert.ok(htmlEn.includes('accounting anomaly'), 'Expected English anomaly');
  assert.ok(!htmlEn.includes('0–100%'));

  ctx.storage.set('locale', 'ru');
  const htmlRu = render('pane', { ...snapshot, summary: { ...summary, best_compression_pct: 282.4 }, history: snapshot.history.map(p=>({...p,compression_pct_overall:.9})) });
  assert.ok(htmlRu.includes('аномалия учёта'), 'Expected Russian anomaly');
  resetLocaleState();
});

test('page and live chip render with localized labels', () => {
  resetLocaleState();
  assert.ok(render('page').includes('Headroom'));
  assert.ok(render('chip').includes('Headroom'));
  assert.ok(render('chip').includes('tokens'), 'Chip should show "tokens" in English');
  ctx.storage.set('locale', 'ru');
  assert.ok(render('chip').includes('ток.'), 'Chip should show "ток." in Russian');
  resetLocaleState();
});

test('polling uses only scoped snapshot and 5 seconds', async () => {
  resetLocaleState();
  render();
  assert.equal(options.refetchInterval, 5000);
  assert.equal(options.retry, false);
  await options.queryFn();
  assert.equal(calls.at(-1)[0], '/snapshot');
});

test('key includes host and focused profile', () => {
  resetLocaleState();
  render();
  assert.ok(options.queryKey.includes('haos'));
  assert.ok(options.queryKey.includes('default'));
});

test('foreign focused host is fail-closed and hides financial data', () => {
  resetLocaleState();
  state.focusedSessionOwner = atom({ connectionId: 'foreign', profile: 'default' });
  const html = render();
  assert.equal(options.enabled, false);
  assert.ok(!html.includes('$'));
  state.focusedSessionOwner = atom({ connectionId: 'haos', profile: 'default' });
});

test('foreign focused profile is fail-closed', () => {
  resetLocaleState();
  state.focusedSessionProfile = atom('research');
  state.focusedSessionOwner = atom({ connectionId: 'haos', profile: 'research' });
  render();
  assert.equal(options.enabled, false);
  state.focusedSessionProfile = atom('default');
  state.focusedSessionOwner = atom({ connectionId: 'haos', profile: 'default' });
});

test('late query cannot leak switched-host data into old cache', async () => {
  resetLocaleState();
  render();
  const fn = options.queryFn;
  state.connectionId = atom('other');
  await assert.rejects(fn);
  state.connectionId = atom('haos');
});

test('unavailable backend is calm and does not advertise savings', () => {
  resetLocaleState();
  const html = render('pane', { available: false, scope: 'proxy', sampled_at: null, summary: null, agents: [], history: [], error: 'not enabled' });
  assert.ok(html.includes('backend'));
  assert.ok(!html.includes('$'));
});

test('loading state has no invented totals in EN and RU', () => {
  resetLocaleState();
  const htmlEn = render('pane', null);
  assert.ok(htmlEn.includes('Loading'), 'Expected Loading in EN');
  assert.ok(!htmlEn.includes('$'));
  ctx.storage.set('locale', 'ru');
  const htmlRu = render('pane', null);
  assert.ok(htmlRu.includes('Загрузка'), 'Expected Загрузка in RU');
  resetLocaleState();
});

test('offline hides live chip claim and marks snapshot stale in EN and RU', () => {
  resetLocaleState();
  state.gateway = atom('closed');
  const htmlEn = render();
  assert.equal(options.enabled, false);
  assert.ok(htmlEn.includes('connection'));
  assert.ok(render('chip').includes('Disconnected'));

  ctx.storage.set('locale', 'ru');
  const htmlRu = render();
  assert.ok(htmlRu.includes('соединения'));
  assert.ok(render('chip').includes('Нет связи'));

  state.gateway = atom('open');
  resetLocaleState();
});

test('old sample is explicitly stale in EN and RU', () => {
  resetLocaleState();
  assert.ok(render('pane', { ...snapshot, sampled_at: '2020-01-01T00:00:00Z' }).includes('Stale'));
  ctx.storage.set('locale', 'ru');
  assert.ok(render('pane', { ...snapshot, sampled_at: '2020-01-01T00:00:00Z' }).includes('Устаревший'));
  resetLocaleState();
});

test('missing numeric values stay unknown, never zero financial claim', () => {
  resetLocaleState();
  const html = render('pane', { ...snapshot, summary: { ...summary, compression_saved_usd: null, provider_cache_discount_usd: null } });
  assert.ok(!html.includes('NaN'));
  assert.ok(html.includes('—'));
});

test('empty history and agents render meaningful empty states in EN and RU', () => {
  resetLocaleState();
  assert.ok(render('pane', { ...snapshot, agents: [], history: [] }).includes('Waiting for first'));
  ctx.storage.set('locale', 'ru');
  assert.ok(render('pane', { ...snapshot, agents: [], history: [] }).includes('первых'));
  resetLocaleState();
});

test('palette navigates to registered full page', () => {
  resetLocaleState();
  contributions.find(c => c.id === 'open').data.run();
  assert.equal(navigation, contributions.find(c => c.id === 'page').data.path);
});

test('renderer has no raw fetch, unsafe HTML, hardcoded colors or fonts', () => {
  assert.ok(!/\bfetch\s*\(|localhost|dangerouslySetInnerHTML|#[0-9a-f]{3,8}\b|fontFamily\s*:/i.test(source));
});

test('invalid endpoint contract is rejected', async () => {
  resetLocaleState();
  render();
  const original = snapshot;
  snapshot = { available: true, scope: 'session' };
  try { await assert.rejects(options.queryFn); } finally { snapshot = original; }
});

test('backend warning makes data explicitly stale', () => {
  resetLocaleState();
  assert.ok(render('pane', { ...snapshot, error: 'collector stale' }).includes('Stale'));
  ctx.storage.set('locale', 'ru');
  assert.ok(render('pane', { ...snapshot, error: 'collector stale' }).includes('Устаревший'));
  resetLocaleState();
});

test('query result after source switch is rejected', async () => {
  resetLocaleState();
  render();
  const original = ctx.rest;
  ctx.rest = async () => { state.connectionId = atom('new-host'); return snapshot; };
  try { await assert.rejects(options.queryFn); } finally { ctx.rest = original; state.connectionId = atom('haos'); }
});

test('real React DOM mounts, loads snapshot, renders language selector, and refreshes on click', async () => {
  resetLocaleState();
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const client = new rq.QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await React.act(async () => {
      root.render(React.createElement(rq.QueryClientProvider, { client }, contributions.find(c => c.id === 'pane').render()));
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    assert.ok(document.querySelector('svg'));
    assert.ok(document.body.textContent.includes('Entire proxy') || document.body.textContent.includes('Context Efficiency'));
    const select = document.querySelector('select');
    assert.ok(select, 'Language selector should be in DOM');
    assert.ok(select.querySelector('option[value="auto"]'));
    assert.ok(select.querySelector('option[value="en"]'));
    assert.ok(select.querySelector('option[value="ru"]'));

    const before = calls.length;
    await React.act(async () => {
      const refreshBtn = document.querySelector('[aria-label="Refresh Headroom"]') || document.querySelector('[aria-label="Обновить Headroom"]');
      assert.ok(refreshBtn, 'Refresh button found');
      refreshBtn.click();
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    assert.ok(calls.length > before, 'refresh made a real scoped request');
    assert.ok(document.querySelector('details summary'));
  } finally {
    await React.act(async () => root.unmount());
    client.clear();
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
