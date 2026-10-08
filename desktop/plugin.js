// Plain ESM. Read-only proxy telemetry; no provider/compression configuration writes.
import { host, useValue, useQuery, Button, Tip, PANES_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, STATUSBAR_AREAS, PALETTE_AREA } from '@hermes/plugin-sdk';
import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';

const ID = 'headroom-monitor';
const PATH = '/headroom-monitor';
const POLL_MS = 5000;
const STALE_MS = 20000;
const STORAGE_KEY = 'headroom-monitor:locale';

let inMemoryPreference = 'auto';
const listeners = new Set();

function getStoredPreference(ctx) {
  try {
    if (ctx?.storage && typeof ctx.storage.get === 'function') {
      const val = ctx.storage.get('locale');
      if (val !== undefined && val !== null) return val;
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const val = localStorage.getItem(STORAGE_KEY);
      if (val !== null && val !== undefined) return val;
    }
  } catch {}
  return inMemoryPreference;
}

function setStoredPreference(pref, ctx) {
  inMemoryPreference = pref;
  try {
    if (ctx?.storage && typeof ctx.storage.set === 'function') {
      ctx.storage.set('locale', pref);
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(STORAGE_KEY, pref);
    }
  } catch {}
  for (const l of listeners) {
    try { l(); } catch {}
  }
}

function detectSystemLocale() {
  try {
    if (typeof navigator !== 'undefined') {
      if (typeof navigator.language === 'string' && navigator.language) {
        return navigator.language;
      }
      if (Array.isArray(navigator.languages) && typeof navigator.languages[0] === 'string' && navigator.languages[0]) {
        return navigator.languages[0];
      }
    }
  } catch {}
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const loc = Intl.DateTimeFormat().resolvedOptions()?.locale;
      if (typeof loc === 'string' && loc) return loc;
    }
  } catch {}
  return 'en';
}

function resolveLocale(preference) {
  if (preference === 'ru') return 'ru';
  if (preference === 'en') return 'en';
  if (preference === 'auto' || !preference) {
    const sys = detectSystemLocale();
    if (typeof sys === 'string' && /^ru(?:-|$)/i.test(sys)) {
      return 'ru';
    }
  }
  return 'en';
}

function useLocale(ctx) {
  const [pref, setPref] = useState(() => getStoredPreference(ctx));
  useEffect(() => {
    const onUpdate = () => {
      setPref(getStoredPreference(ctx));
    };
    listeners.add(onUpdate);
    return () => listeners.delete(onUpdate);
  }, [ctx]);

  const currentPref = getStoredPreference(ctx);
  const effectivePref = pref || currentPref;
  const locale = resolveLocale(effectivePref);

  const changePref = (newPref) => {
    setStoredPreference(newPref, ctx);
    setPref(newPref);
  };

  return { preference: effectivePref, locale, setPreference: changePref };
}

const MESSAGES = {
  en: {
    name: 'Headroom · Proxy Monitor',
    open_label: 'Headroom: proxy compression overview',
    open_keywords: ['headroom', 'tokens', 'savings', 'compression', 'proxy'],
    kicker: 'Entire proxy · Headroom',
    title: 'Context Efficiency',
    refresh_tip: 'Request fresh snapshot',
    refresh_aria: 'Refresh Headroom',
    lang_selector_aria: 'Language',
    opt_auto: 'Auto',
    opt_en: 'English',
    opt_ru: 'Русский',
    status_different_source: 'Different source',
    status_disconnected: 'Disconnected',
    status_update_failed: 'Update failed',
    status_stale: 'Stale snapshot',
    status_updates_5s: 'Updates every 5s',
    status_awaiting_data: 'Awaiting data',
    notice_focus_different: 'Focus is on a different host or profile. Switch to the matching connection: scoped REST SDK reads active backend only. Data from other sources is not shown.',
    notice_no_conn: 'No backend connection. Reconnect Hermes Desktop.',
    notice_loading: 'Loading Headroom snapshot…',
    notice_unavailable: 'Snapshot not yet available. Enable headroom-monitor backend plugin in the required profile and reconnect Desktop. Financial estimates are not shown.',
    notice_stale_no_conn: 'No connection. Showing last snapshot, not current data.',
    notice_stale_delayed: 'Stale snapshot. Updates delayed; displayed values may be outdated.',
    hero_aria: 'Attributed input token savings',
    hero_label: 'Attributed input token savings',
    hero_explanation: 'Attributed savings with dialogue-level accounting. Re-compressing the same context may not increase this counter; this is not the sum of reductions across all requests.',
    metric_input_plus_savings: 'Input + attributed savings',
    metric_accumulated_input: 'Accumulated input',
    metric_savings_share: 'Savings / attributed input',
    hero_footer: 'Input tokens · entire proxy, not current session',
    row_compressed_all: 'Compressed / total requests',
    row_avg_compressed: 'Average for compressed',
    row_avg_explanation: 'Average weighted reduction of transmitted context for compressed requests only; not the global attributed savings share.',
    row_best_compression: 'Best compression',
    summary_why_uncompressed: 'Why requests were not compressed',
    section_trend: 'Attributed share trend',
    section_recent: 'Recent requests: wire context reduction',
    card_cost: 'Cost estimate · USD',
    row_compression_savings: 'Compression savings',
    row_compression_savings_exp: 'Backend estimate at input token rates. Not a provider invoice; cache discount is tracked separately.',
    row_provider_cache: 'Provider cache',
    row_provider_cache_exp: 'Separate estimate of provider discount on cached tokens. Not Headroom compression savings.',
    cost_note: 'Estimated from API rates — not billed charges or subscription savings. Independent counters are not summed.',
    summary_backend_calc: 'Backend calculation',
    row_cost_without: 'Without optimization',
    row_cost_with: 'With optimization',
    row_cost_savings_pct: 'Cost savings share',
    row_cost_savings_pct_exp: 'Backend cost metric; differs from saved token share and compressed request average.',
    card_additional: 'Additional counters',
    row_tool_schemas: 'Tool schemas',
    row_tool_schemas_exp: 'Tool schema tokens saved as reported by backend. Not added again to overall savings.',
    row_responses_ws: 'Responses · HTTP/WS',
    row_responses_ws_exp: 'Processing counter for Responses blocks (HTTP/WS), including repeated compression. Not requests or unique tokens; not added to global savings.',
    responses_note: 'Responses blocks and agent rows do not sum into global savings.',
    card_route: 'Proxy route',
    label_provider: 'Provider',
    not_provided: 'Not provided',
    label_mode: 'Mode',
    read_only_notice: 'Observation only. Provider and compression settings are not modified.',
    footer_snapshot: (time) => `Snapshot: ${time} · proxy-wide process; not session totals`,
    open_full_overview: 'Open full overview →',
    chip_live: (tokens) => `${tokens} tokens`,
    chip_different_source: 'Different source',
    chip_disconnected: 'Disconnected',
    chip_stale: 'Snapshot stale',
    chip_loading: 'Loading',
    chip_unavailable: 'Unavailable',
    chip_tip: 'Headroom · overall input token savings across entire proxy, not current session. Open overview.',
    chip_aria: (label) => `Headroom: ${label}. Entire proxy. Open overview`,
    trend_empty: 'Waiting for first two snapshots to graph.',
    trend_aria: (p0, pN, ceiling) => `Attributed savings / accumulated input: from ${p0} to ${pN}; scale from 0 to ${ceiling} percent`,
    trend_point_title: (time, pct, reqs, before, saved) => `${time} · ${pct} · ${reqs} requests · before ${before} · saved ${saved}`,
    trend_share_scale: (ceiling) => `Attributed share · 0–${ceiling}%`,
    reasons_empty_count: (c) => `${c} uncompressed requests; no reasons provided.`,
    reasons_empty_none: 'No bypass reasons provided yet.',
    agents_empty: 'Waiting for first agent requests.',
    agents_summary: (reqs, saved) => `${reqs} requests · saved ${saved} tokens`,
    agents_details: 'Tokens and identifier',
    agents_before_after: 'Before → after',
    reasons: {
      prefix_frozen: 'Cacheable prefix preserved',
      size_floor: 'Below minimum size',
      compressor_noop: 'No change after compression',
      below_threshold: 'Below compression threshold',
      small_request: 'Small request',
      cache_hit: 'Cache hit',
      disabled: 'Compression disabled',
      no_savings: 'No savings',
      unsupported: 'Unsupported',
      passthrough: 'Passthrough',
      error: 'Compression error'
    }
  },
  ru: {
    name: 'Headroom · монитор прокси',
    open_label: 'Headroom: обзор сжатия прокси',
    open_keywords: ['headroom', 'токены', 'экономия', 'прокси'],
    kicker: 'Весь прокси · Headroom',
    title: 'Эффективность контекста',
    refresh_tip: 'Запросить свежий снимок',
    refresh_aria: 'Обновить Headroom',
    lang_selector_aria: 'Язык',
    opt_auto: 'Auto',
    opt_en: 'English',
    opt_ru: 'Русский',
    status_different_source: 'Другой источник',
    status_disconnected: 'Нет связи',
    status_update_failed: 'Нет обновления',
    status_stale: 'Устаревший снимок',
    status_updates_5s: 'Обновляется каждые 5 с',
    status_awaiting_data: 'Ожидание данных',
    notice_focus_different: 'Фокус на другом хосте или профиле. Активируйте соответствующее подключение: scoped REST SDK читает только активный backend. Данные другого источника не показаны.',
    notice_no_conn: 'Нет соединения с backend. Переподключите Hermes Desktop.',
    notice_loading: 'Загрузка снимка Headroom…',
    notice_unavailable: 'Снимок пока недоступен. Включите backend-плагин headroom-monitor в нужном профиле и переподключите Desktop. Денежные оценки не показаны.',
    notice_stale_no_conn: 'Нет соединения. Показан последний снимок, а не текущие данные.',
    notice_stale_delayed: 'Устаревший снимок. Обновления задерживаются; показанные значения могут быть неактуальны.',
    hero_aria: 'Учтённая экономия входных токенов',
    hero_label: 'Учтённая экономия входных токенов',
    hero_explanation: 'Учтённая экономия с атрибуцией по диалогу. Повторное сжатие одного контекста может не увеличивать этот счётчик; это не сумма сокращений всех запросов.',
    metric_input_plus_savings: 'Вход + учтённая экономия',
    metric_accumulated_input: 'Накопленный вход',
    metric_savings_share: 'Экономия / учётный вход',
    hero_footer: 'Входные токены · весь прокси, не текущая сессия',
    row_compressed_all: 'Сжатые / все запросы',
    row_avg_compressed: 'Среднее по сжатым',
    row_avg_explanation: 'Среднее взвешенное сокращение переданного контекста только сжатых запросов; не доля глобальной учтённой экономии.',
    row_best_compression: 'Лучшее сжатие',
    summary_why_uncompressed: 'Почему запросы не сжаты',
    section_trend: 'Динамика учётной доли',
    section_recent: 'Недавние запросы: сокращение переданного контекста',
    card_cost: 'Оценка стоимости · USD',
    row_compression_savings: 'Экономия от сжатия',
    row_compression_savings_exp: 'Оценка backend по тарифам входных токенов. Не счёт провайдера; скидка кэша учитывается отдельно.',
    row_provider_cache: 'Кэш провайдера',
    row_provider_cache_exp: 'Отдельная оценка скидки провайдера на кэшированные токены. Это не экономия Headroom от сжатия.',
    cost_note: 'Оценка по API-тарифам — не списания и не экономия подписки. Не складываем независимые счётчики.',
    summary_backend_calc: 'Расчёт backend',
    row_cost_without: 'Без оптимизации',
    row_cost_with: 'После оптимизации',
    row_cost_savings_pct: 'Доля экономии стоимости',
    row_cost_savings_pct_exp: 'Метрика стоимости backend; отличается от доли сэкономленных токенов и среднего по сжатым запросам.',
    card_additional: 'Дополнительные счётчики',
    row_tool_schemas: 'Схемы инструментов',
    row_tool_schemas_exp: 'Сохранённые токены схем инструментов, как сообщает backend. Не прибавляем повторно к общей экономии.',
    row_responses_ws: 'Responses · HTTP/WS',
    row_responses_ws_exp: 'Счётчик обработки блоков Responses (HTTP/WS), включая повторное сжатие. Не запросы и не уникальные токены; не прибавляется к глобальной экономии.',
    responses_note: 'Блоки Responses и строки агентов не складываются с глобальной экономией.',
    card_route: 'Маршрут прокси',
    label_provider: 'Провайдер',
    not_provided: 'Не предоставлен',
    label_mode: 'Режим',
    read_only_notice: 'Только наблюдение. Настройки провайдера и сжатия не изменяются.',
    footer_snapshot: (time) => `Снимок: ${time} · общий процесс прокси; не итоги сессии`,
    open_full_overview: 'Открыть полный обзор →',
    chip_live: (tokens) => `${tokens} ток.`,
    chip_different_source: 'Другой источник',
    chip_disconnected: 'Нет связи',
    chip_stale: 'Снимок устарел',
    chip_loading: 'Загрузка',
    chip_unavailable: 'Недоступно',
    chip_tip: 'Headroom · общая экономия входных токенов всего прокси, не текущей сессии. Открыть обзор.',
    chip_aria: (label) => `Headroom: ${label}. Весь прокси. Открыть обзор`,
    trend_empty: 'Ждём первых двух снимков для графика.',
    trend_aria: (p0, pN, ceiling) => `Учтённая экономия / накопленный вход: от ${p0} до ${pN}; шкала от 0 до ${ceiling} процентов`,
    trend_point_title: (time, pct, reqs, before, saved) => `${time} · ${pct} · ${reqs} запросов · до ${before} · сохранено ${saved}`,
    trend_share_scale: (ceiling) => `Учётная доля · 0–${ceiling}%`,
    reasons_empty_count: (c) => `${c} запросов без сжатия; причины не предоставлены.`,
    reasons_empty_none: 'Причины пропуска пока не предоставлены.',
    agents_empty: 'Ждём первых запросов агентов.',
    agents_summary: (reqs, saved) => `${reqs} запросов · сохранено ${saved} токенов`,
    agents_details: 'Токены и идентификатор',
    agents_before_after: 'До → после',
    reasons: {
      prefix_frozen: 'Сохранён кешируемый префикс',
      size_floor: 'Ниже минимального размера',
      compressor_noop: 'Без изменений после обработки',
      below_threshold: 'Ниже порога сжатия',
      small_request: 'Небольшой запрос',
      cache_hit: 'Попадание в кэш',
      disabled: 'Сжатие отключено',
      no_savings: 'Без выигрыша',
      unsupported: 'Не поддерживается',
      passthrough: 'Без преобразования',
      error: 'Ошибка сжатия'
    }
  }
};

const valid = n => typeof n === 'number' && Number.isFinite(n);
const text = value => typeof value === 'string' && value.trim() ? value : '—';
const identifiers = value => Array.isArray(value) ? value.filter(v => typeof v === 'string') : value && typeof value === 'object' ? Object.keys(value) : typeof value === 'string' ? [value] : [];
const list = value => identifiers(value).join(' · ') || '—';
const timestamp = value => typeof value === 'number' && Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : Date.parse(value);

function createFormatters(loc) {
  const isRu = loc === 'ru';
  const intlLocale = isRu ? 'ru-RU' : 'en-US';

  let integer, decimal, dollars;
  try {
    integer = typeof Intl !== 'undefined' ? new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }) : null;
    decimal = typeof Intl !== 'undefined' ? new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1 }) : null;
    dollars = typeof Intl !== 'undefined' ? new Intl.NumberFormat(intlLocale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }) : null;
  } catch {}

  const count = n => {
    if (!valid(n)) return '—';
    if (integer) return integer.format(n);
    return String(Math.round(n));
  };

  const percent = n => {
    if (!valid(n)) return '—';
    const num = decimal ? decimal.format(n) : String(n);
    const anomaly = n > 100 ? (isRu ? ' · аномалия учёта' : ' · accounting anomaly') : '';
    return `${num}%${anomaly}`;
  };

  const money = n => {
    if (!valid(n)) return '—';
    if (dollars) return dollars.format(n);
    return `$${n.toFixed(2)}`;
  };

  const dateLabel = value => {
    const n = timestamp(value);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Date(n).toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return new Date(n).toISOString().slice(11, 19);
    }
  };

  return { count, percent, money, dateLabel };
}

const CSS = `
.hrm-monitor{height:100%;min-height:0;overflow:auto;color:var(--ui-text-primary);font:inherit;font-size:12px;line-height:1.5;container-type:inline-size}
.hrm-monitor *{box-sizing:border-box}
.hrm-monitor .hrm-body{padding:18px;display:grid;gap:18px;max-width:1120px;margin:auto}
.hrm-monitor .hrm-header{display:flex;justify-content:space-between;align-items:center;gap:12px}
.hrm-monitor .hrm-header-controls{display:flex;align-items:center;gap:8px}
.hrm-monitor select{background:transparent;color:var(--ui-text-secondary);border:1px solid var(--ui-stroke-secondary);border-radius:6px;font:inherit;font-size:11px;padding:3px 8px;cursor:pointer}
.hrm-monitor select:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
.hrm-monitor h1,.hrm-monitor h2,.hrm-monitor p{margin:0}
.hrm-monitor h1{font-size:18px;font-weight:650;letter-spacing:-.025em}
.hrm-monitor h2{font-size:12px;font-weight:650}
.hrm-monitor .hrm-muted{color:var(--ui-text-tertiary)}
.hrm-monitor .hrm-small{font-size:11px}
.hrm-monitor .hrm-kicker{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ui-text-tertiary)}
.hrm-monitor .hrm-card{padding:14px;border:1px solid var(--ui-stroke-secondary);border-radius:12px;min-width:0}
.hrm-monitor .hrm-hero{background:linear-gradient(135deg,color-mix(in srgb,var(--ui-accent) 9%,var(--ui-bg-editor)),var(--ui-bg-editor));display:grid;gap:14px}
.hrm-monitor .hrm-hero-value{font-size:46px;font-weight:650;letter-spacing:-.045em;line-height:1.1;color:var(--ui-accent);font-variant-numeric:tabular-nums}
.hrm-monitor .hrm-row{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.hrm-monitor .hrm-stack{display:grid;gap:10px}
.hrm-monitor .hrm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.hrm-monitor .hrm-value{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.hrm-monitor .hrm-label{color:var(--ui-text-tertiary);font-size:10px}
.hrm-monitor .hrm-section{display:grid;gap:10px;min-width:0}
.hrm-monitor .hrm-columns{display:grid;gap:18px}
.hrm-monitor .hrm-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ui-stroke-secondary);border-radius:99px;padding:3px 8px;font-size:10px;color:var(--ui-text-secondary)}
.hrm-monitor .hrm-dot{width:5px;height:5px;border-radius:50%;background:var(--ui-accent)}
.hrm-monitor .hrm-track{height:5px;border-radius:99px;background:var(--ui-stroke-secondary);overflow:hidden}
.hrm-monitor .hrm-fill{height:100%;border-radius:inherit;background:var(--ui-accent)}
.hrm-monitor .hrm-agent{border-top:1px solid var(--ui-stroke-secondary);padding-top:10px;min-width:0}
.hrm-monitor .hrm-wrap{overflow-wrap:anywhere}
.hrm-monitor details{border-top:1px solid var(--ui-stroke-secondary);padding-top:10px}
.hrm-monitor summary{cursor:pointer;color:var(--ui-text-secondary);padding:4px 0}
.hrm-monitor summary:focus-visible,.hrm-monitor button:focus-visible{outline:2px solid var(--ui-accent);outline-offset:3px}
.hrm-monitor .hrm-notice{padding:12px;border:1px dashed var(--ui-stroke-secondary);border-radius:10px;color:var(--ui-text-secondary)}
.hrm-monitor svg{display:block;width:100%;height:100px;overflow:visible}
.hrm-monitor .hrm-help{cursor:help;border-bottom:1px dotted var(--ui-stroke-secondary)}
@container (min-width:640px){.hrm-monitor .hrm-body{padding:28px;gap:24px}.hrm-monitor .hrm-columns{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)}.hrm-monitor .hrm-hero-value{font-size:64px}.hrm-monitor h1{font-size:24px}}
`;

function readScope() {
  const connection = host.state.connectionId?.get() ?? 'legacy';
  const profile = host.state.profile.get();
  const owner = host.state.focusedSessionOwner?.get();
  const focusedProfile = owner?.profile ?? host.state.focusedSessionProfile?.get() ?? profile;
  const focusedConnection = owner?.connectionId ?? connection;
  return { connection, profile, focusedProfile, focusedConnection, compatible: connection === focusedConnection && profile === focusedProfile };
}

function sameScope(a, b) {
  return a.connection === b.connection && a.profile === b.profile && a.focusedConnection === b.focusedConnection && a.focusedProfile === b.focusedProfile && b.compatible;
}

function useSnapshot(ctx) {
  useValue(host.state.gateway);
  useValue(host.state.profile);
  if (host.state.connectionId) useValue(host.state.connectionId);
  if (host.state.focusedSessionProfile) useValue(host.state.focusedSessionProfile);
  if (host.state.focusedSessionOwner) useValue(host.state.focusedSessionOwner);
  const scope = readScope();
  const connected = host.state.gateway.get() === 'open';
  const query = useQuery({
    queryKey: [ID, 'snapshot', scope.connection, scope.profile, scope.focusedConnection, scope.focusedProfile],
    queryFn: async () => {
      if (!sameScope(scope, readScope())) throw new Error('Headroom scope changed');
      const result = await ctx.rest('/snapshot', { timeoutMs: 4500 });
      if (!sameScope(scope, readScope())) throw new Error('Headroom scope changed');
      if (!result || typeof result.available !== 'boolean' || result.scope !== 'proxy') throw new Error('Unexpected Headroom snapshot');
      return result;
    },
    enabled: connected && scope.compatible,
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
    gcTime: 60000,
    retry: false,
    refetchOnWindowFocus: true
  });
  const sampled = timestamp(query.data?.sampled_at);
  const stale = !!query.data && (!connected || query.isError || !!query.data.error || !Number.isFinite(sampled) || Date.now() - sampled > STALE_MS);
  return { query, scope, connected, stale };
}

function Help({ label, explanation }) {
  return jsx(Tip, { label: explanation, children: jsx('span', { className: 'hrm-help', tabIndex: 0, title: explanation, children: label }) });
}
function Metric({ label, value, explanation }) {
  return jsxs('div', { children: [jsx('div', { className: 'hrm-label', children: explanation ? jsx(Help, { label, explanation }) : label }), jsx('div', { className: 'hrm-value', children: value })] });
}
function Row({ label, value, explanation }) {
  return jsxs('div', { className: 'hrm-row', children: [jsx('span', { className: 'hrm-muted', children: explanation ? jsx(Help, { label, explanation }) : label }), jsx('strong', { style: { fontVariantNumeric: 'tabular-nums', flexShrink: 0 }, children: value })] });
}
function Empty({ children }) { return jsx('p', { className: 'hrm-muted hrm-small', children }); }
function Notice({ children }) { return jsx('div', { className: 'hrm-notice', role: 'status', children }); }

function Trend({ history, m, fmt }) {
  const points = (Array.isArray(history) ? history : []).filter(p => Number.isFinite(timestamp(p.sampled_at)) && valid(p.compression_pct_overall)).slice().sort((a, b) => timestamp(a.sampled_at) - timestamp(b.sampled_at)).slice(-60);
  if (points.length < 2) return jsx(Empty, { children: m.trend_empty });
  const ceiling = Math.max(1, Math.min(100, Math.ceil(Math.max(...points.map(p => p.compression_pct_overall)) * 1.1)));
  const start = timestamp(points[0].sampled_at);
  const range = timestamp(points[points.length - 1].sampled_at) - start;
  const coords = points.map((p, i) => [8 + (range ? (timestamp(p.sampled_at) - start) / range : i / (points.length - 1)) * 304, 92 - Math.min(ceiling, Math.max(0, p.compression_pct_overall)) / ceiling * 80]);
  const line = coords.map(p => p.join(',')).join(' ');
  return jsxs('div', { children: [jsxs('svg', { viewBox: '0 0 320 100', role: 'img', 'aria-label': m.trend_aria(fmt.percent(points[0].compression_pct_overall), fmt.percent(points[points.length - 1].compression_pct_overall), ceiling), children: [jsx('line', { x1: 8, y1: 92, x2: 312, y2: 92, stroke: 'var(--ui-stroke-secondary)' }), jsx('polygon', { points: `8,92 ${line} 312,92`, fill: 'var(--ui-accent)', opacity: .09 }), jsx('polyline', { points: line, fill: 'none', stroke: 'var(--ui-accent)', strokeWidth: 2, strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }), ...coords.map(([cx, cy], i) => jsxs('circle', { cx, cy, r: i === coords.length - 1 ? 3 : 2, fill: 'var(--ui-accent)', children: [jsx('title', { children: m.trend_point_title(fmt.dateLabel(points[i].sampled_at), fmt.percent(points[i].compression_pct_overall), fmt.count(points[i].api_requests), fmt.count(points[i].tokens_before), fmt.count(points[i].tokens_saved)) })] }, `${i}`))] }), jsxs('div', { className: 'hrm-row hrm-muted hrm-small', children: [jsx('span', { children: fmt.dateLabel(points[0].sampled_at) }), jsx('span', { children: m.trend_share_scale(ceiling) }), jsx('span', { children: fmt.dateLabel(points[points.length - 1].sampled_at) })] })] });
}

function Reasons({ value, m, fmt }) {
  const entries = Array.isArray(value) ? value.map(v => typeof v === 'string' ? [v, null] : [v?.reason ?? v?.label, v?.count ?? v?.requests]) : value && typeof value === 'object' ? Object.entries(value) : [];
  return entries.length ? jsx('div', { className: 'hrm-stack hrm-small', children: entries.map(([reason, n], i) => jsx(Row, { label: m.reasons[reason] ?? text(reason), value: fmt.count(n) }, `${i}`)) }) : jsx(Empty, { children: valid(value) ? m.reasons_empty_count(fmt.count(value)) : m.reasons_empty_none });
}

function Agents({ agents, m, fmt }) {
  const rows = Array.isArray(agents) ? agents : [];
  return rows.length ? jsx('div', { className: 'hrm-stack', children: rows.filter(a => a && typeof a === 'object').map((a, i) => jsxs('div', { className: 'hrm-agent', children: [jsxs('div', { className: 'hrm-row', children: [jsx('strong', { className: 'hrm-wrap', children: text(a.label || a.agent) }), jsx('strong', { style: { color: 'var(--ui-accent)' }, children: fmt.percent(a.savings_percent) })] }), jsx('div', { className: 'hrm-small hrm-muted hrm-wrap', children: `${list(a.providers)} · ${list(a.models)}` }), jsx('div', { className: 'hrm-small hrm-muted', children: m.agents_summary(fmt.count(a.requests), fmt.count(a.tokens_saved)) }), jsxs('details', { children: [jsx('summary', { children: m.agents_details }), jsx(Row, { label: m.agents_before_after, value: `${fmt.count(a.before_tokens)} → ${fmt.count(a.after_tokens)}` }), jsx('p', { className: 'hrm-small hrm-muted hrm-wrap', children: text(a.agent) })] })] }, `${a.agent ?? 'agent'}:${i}`)) }) : jsx(Empty, { children: m.agents_empty });
}

function Report({ data, m, fmt }) {
  const s = data.summary && typeof data.summary === 'object' ? data.summary : {};
  const agents = Array.isArray(data.agents) ? data.agents : [];
  const providers = [...new Set(agents.flatMap(a => identifiers(a?.providers)))].join(' · ') || m.not_provided;
  return jsxs('div', { className: 'hrm-columns', children: [jsxs('div', { className: 'hrm-stack', children: [jsxs('section', { className: 'hrm-card hrm-hero', 'aria-label': m.hero_aria, children: [jsx('div', { className: 'hrm-kicker', children: jsx(Help, { label: m.hero_label, explanation: m.hero_explanation }) }), jsx('div', { className: 'hrm-hero-value', children: fmt.count(s.tokens_saved) }), jsx('div', { className: 'hrm-track', 'aria-hidden': true, children: jsx('div', { className: 'hrm-fill', style: { width: `${valid(s.compression_pct_overall) ? Math.min(100, Math.max(0, s.compression_pct_overall)) : 0}%` } }) }), jsxs('div', { className: 'hrm-grid', children: [jsx(Metric, { label: m.metric_input_plus_savings, value: fmt.count(s.tokens_before) }), jsx(Metric, { label: m.metric_accumulated_input, value: fmt.count(s.tokens_after) }), jsx(Metric, { label: m.metric_savings_share, value: fmt.percent(s.compression_pct_overall) })] }), jsx('div', { className: 'hrm-small hrm-muted', children: m.hero_footer })] }), jsxs('section', { className: 'hrm-card hrm-stack', children: [jsx(Row, { label: m.row_compressed_all, value: `${fmt.count(s.requests_compressed)} / ${fmt.count(s.api_requests)}` }), jsx(Row, { label: m.row_avg_compressed, value: fmt.percent(s.avg_compression_pct), explanation: m.row_avg_explanation }), jsx(Row, { label: m.row_best_compression, value: fmt.percent(s.best_compression_pct) }), jsxs('details', { children: [jsx('summary', { children: m.summary_why_uncompressed }), jsx(Reasons, { value: s.uncompressed_requests, m, fmt })] })] }), jsxs('section', { className: 'hrm-section', children: [jsx('h2', { children: m.section_trend }), jsx(Trend, { history: data.history, m, fmt })] }), jsxs('section', { className: 'hrm-section', children: [jsx('h2', { children: m.section_recent }), jsx(Agents, { agents, m, fmt })] })] }), jsxs('div', { className: 'hrm-stack', children: [jsxs('section', { className: 'hrm-card hrm-stack', children: [jsx('h2', { children: m.card_cost }), jsx(Row, { label: m.row_compression_savings, value: fmt.money(s.compression_saved_usd), explanation: m.row_compression_savings_exp }), jsx(Row, { label: m.row_provider_cache, value: fmt.money(s.provider_cache_discount_usd), explanation: m.row_provider_cache_exp }), jsx('p', { className: 'hrm-small hrm-muted', children: m.cost_note }), jsxs('details', { children: [jsx('summary', { children: m.summary_backend_calc }), jsx(Row, { label: m.row_cost_without, value: fmt.money(s.cost_without_usd) }), jsx(Row, { label: m.row_cost_with, value: fmt.money(s.cost_with_usd) }), jsx(Row, { label: m.row_cost_savings_pct, value: fmt.percent(s.cost_savings_pct), explanation: m.row_cost_savings_pct_exp })] })] }), jsxs('section', { className: 'hrm-card hrm-stack', children: [jsx('h2', { children: m.card_additional }), jsx(Row, { label: m.row_tool_schemas, value: fmt.count(s.tool_schema_tokens_saved), explanation: m.row_tool_schemas_exp }), jsx(Row, { label: m.row_responses_ws, value: fmt.count(s.codex_ws_tokens_saved), explanation: m.row_responses_ws_exp }), jsx('p', { className: 'hrm-small hrm-muted', children: m.responses_note })] }), jsxs('section', { className: 'hrm-card hrm-stack', children: [jsx('h2', { children: m.card_route }), jsx('div', { className: 'hrm-wrap', children: text(s.primary_model) }), jsx('p', { className: 'hrm-small hrm-muted hrm-wrap', children: `${m.label_provider}: ${providers}` }), jsx('p', { className: 'hrm-small hrm-muted hrm-wrap', children: `${m.label_mode}: ${text(s.mode)}` }), jsx('p', { className: 'hrm-small hrm-muted', children: m.read_only_notice })] })] })] });
}

function Monitor({ ctx, page = false }) {
  const { preference, locale, setPreference } = useLocale(ctx);
  const m = MESSAGES[locale] || MESSAGES.en;
  const fmt = createFormatters(locale);
  const { query, scope, connected, stale } = useSnapshot(ctx);
  const ready = scope.compatible && query.data?.available === true;
  const status = !scope.compatible ? m.status_different_source : !connected ? m.status_disconnected : query.isError ? m.status_update_failed : stale ? m.status_stale : ready ? m.status_updates_5s : m.status_awaiting_data;

  return jsxs('div', { className: 'hrm-monitor', lang: locale, children: [jsx('style', { children: CSS }), jsxs('main', { className: 'hrm-body', 'aria-label': m.title, children: [jsxs('header', { className: 'hrm-header', children: [jsxs('div', { children: [jsx('div', { className: 'hrm-kicker', children: m.kicker }), jsx('h1', { children: m.title })] }), jsxs('div', { className: 'hrm-header-controls', children: [jsx('select', { value: preference, 'aria-label': m.lang_selector_aria, onChange: e => setPreference(e.target.value), children: [jsx('option', { value: 'auto', children: m.opt_auto }, 'auto'), jsx('option', { value: 'en', children: m.opt_en }, 'en'), jsx('option', { value: 'ru', children: m.opt_ru }, 'ru')] }), jsx(Tip, { label: m.refresh_tip, children: jsx(Button, { variant: 'ghost', size: 'sm', disabled: !connected || !scope.compatible || query.isFetching, onClick: () => void query.refetch(), 'aria-label': m.refresh_aria, children: '↻' }) })] })] }), jsxs('div', { className: 'hrm-row hrm-small', children: [jsxs('span', { className: 'hrm-pill', role: 'status', children: [ready && !stale && connected ? jsx('span', { className: 'hrm-dot', 'aria-hidden': true }) : null, status] }), jsx('span', { className: 'hrm-muted hrm-wrap', children: `${scope.focusedConnection} · ${scope.focusedProfile}` })] }), !scope.compatible ? jsx(Notice, { children: m.notice_focus_different }) : !ready ? jsx(Notice, { children: !connected ? m.notice_no_conn : query.isPending && !query.isError ? m.notice_loading : m.notice_unavailable }) : jsxs('div', { className: 'hrm-stack', children: [stale ? jsx(Notice, { children: !connected ? m.notice_stale_no_conn : m.notice_stale_delayed }) : null, jsx(Report, { data: query.data, m, fmt }), jsx('footer', { className: 'hrm-small hrm-muted', children: m.footer_snapshot(fmt.dateLabel(query.data.sampled_at)) })] }), !page ? jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => host.navigate(PATH), children: m.open_full_overview }) : null] })] });
}

function Chip({ ctx }) {
  const { locale } = useLocale(ctx);
  const m = MESSAGES[locale] || MESSAGES.en;
  const fmt = createFormatters(locale);
  const { query, scope, connected, stale } = useSnapshot(ctx);
  const live = connected && scope.compatible && query.data?.available && !stale;
  const label = live ? m.chip_live(fmt.count(query.data.summary?.tokens_saved)) : !scope.compatible ? m.chip_different_source : !connected ? m.chip_disconnected : stale ? m.chip_stale : query.isPending && !query.isError ? m.chip_loading : m.chip_unavailable;
  return jsx(Tip, { label: m.chip_tip, children: jsx('button', { type: 'button', onClick: () => host.navigate(PATH), 'aria-label': m.chip_aria(label), style: { font: 'inherit', color: live ? 'var(--ui-accent)' : 'var(--ui-text-tertiary)', padding: '0 8px', cursor: 'pointer' }, children: `Headroom · ${label}` }) });
}

export default {
  id: ID,
  get name() {
    const loc = resolveLocale(getStoredPreference());
    return MESSAGES[loc]?.name || MESSAGES.en.name;
  },
  defaultEnabled: false,
  register(ctx) {
    ctx.registerMany([
      { id: 'pane', area: PANES_AREA, title: 'Headroom', data: { placement: 'right', dock: { pane: 'workspace', pos: 'right' }, width: '350px' }, render: () => jsx(Monitor, { ctx }) },
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => jsx(Monitor, { ctx, page: true }) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: 'Headroom', codicon: 'pulse' } },
      { id: 'chip', area: STATUSBAR_AREAS.right, order: 130, render: () => jsx(Chip, { ctx }) },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: `${ID}.open`,
          get label() {
            const loc = resolveLocale(getStoredPreference(ctx));
            return MESSAGES[loc]?.open_label || MESSAGES.en.open_label;
          },
          get keywords() {
            const loc = resolveLocale(getStoredPreference(ctx));
            return MESSAGES[loc]?.open_keywords || MESSAGES.en.open_keywords;
          },
          run: () => host.navigate(PATH)
        }
      }
    ]);
  }
};
