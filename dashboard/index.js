(function () {
  'use strict';
  const SDK = window.__HERMES_PLUGIN_SDK__;
  const registry = window.__HERMES_PLUGINS__;
  if (!SDK || !registry) return;
  const h = SDK.React.createElement;
  const { useState, useEffect } = SDK.hooks;
  const ENDPOINT = '/api/plugins/headroom-monitor/snapshot';
  const POLL_MS = 5000;
  const STALE_MS = 15000;
  const STORAGE_KEY = 'headroom-monitor:locale';

  const I18N = {
    en: {
      lang: 'en',
      eyebrow: 'HEADROOM / COMPRESSION MONITOR',
      title: 'Fewer tokens. More context.',
      subtitle: 'Global proxy · all agents and requests, not current chat.',
      sidebarScope: 'Global proxy · not current chat',
      sidebarAria: 'Headroom: global proxy',
      pageAria: 'Headroom Monitor',
      widgetTitle: 'Headroom · global proxy, not current chat',
      loading: 'Loading…',
      loadingStats: 'Loading proxy statistics…',
      unavailableStats: 'Statistics unavailable.',
      proxyOnline: 'Proxy online',
      staleData: 'Stale data',
      offlineCached: 'Offline · cached data',
      offline: 'Offline',
      errUnavailable: 'Headroom is unavailable. Retrying in 5s.',
      errNetwork: 'Cannot reach Headroom. Retrying in 5s.',
      noticeLastGood: ' Showing last good snapshot, not fresh metrics.',
      noticeNoZeroes: ' Metrics are not replaced with zeroes.',
      staleNotice: 'Stale data: snapshot older than 15s. Awaiting update.',
      mode: 'Mode: ',
      primaryModel: ' · Primary model: ',
      snapshot: ' · Snapshot: ',
      polling: ' · Polling every 5s',
      beforeCompression: 'Before compression',
      beforeHint: 'Accounting base: input + tracked savings',
      afterCompression: 'After compression',
      afterHint: 'Cumulative input tokens; not unique context',
      tokensSaved: 'Tokens saved',
      savedHint: 'Tracked savings / tokens before optimization: ',
      compressedRequests: 'Compressed requests',
      compressedHint: 'Total API requests: ',
      historyTitle: 'Accounting share history',
      historyEmpty: 'History is empty. Data will appear after polling the proxy.',
      historyAria: ceiling => 'Accounting share history: savings / tokens before optimization, from 0 to ' + ceiling + ' percent',
      historySamples: count => 'Accounting share · last ' + count + ' samples',
      samplesCount: count => count + ' samples',
      compressionQuality: 'Compression quality',
      average: 'Average',
      avgHint: 'Weighted average across compressed requests',
      bestResult: 'Best result',
      toolSchemas: 'Tool schemas',
      wsTokens: 'Responses: chunk compression (HTTP/WS)',
      wsHint: 'Reprocessed stream chunks, not unique tokens: do not add to total.',
      costTitle: 'Cost · estimate, not provider bill',
      costWithout: 'Without compression',
      costWith: 'With compression',
      costSavings: 'Estimated compression savings',
      cacheDiscount: 'Provider cache discount',
      cacheHint: 'Separate from compression savings',
      costFootnote: 'Estimated using API rates — not charges or ChatGPT/Copilot subscription savings. Compression and cache are shown separately; do not sum.',
      whyUncompressed: 'Why requests were uncompressed',
      noReasons: 'Proxy did not report uncompressed request reasons.',
      dataScope: 'Data scope',
      dataScopeDesc: 'Tracked savings are attributed across conversations, while agent rows reflect wire context reductions and must not be added to the global total. Percentages above 100% are flagged as upstream accounting anomalies. Counters may reset when the proxy restarts. History holds up to 120 in-memory snapshots; "—" denotes missing metric.',
      recentRequests: 'Recent requests: wire context reduction',
      tableAria: 'Agent statistics, horizontally scrollable table',
      tableCaption: 'Agents across proxy',
      tableCols: ['Agent', 'Requests', 'Before', 'After', 'Saved', 'Compression', 'Models / providers'],
      noAgents: 'No agent breakdown available yet.',
      unlabeled: 'Unlabeled',
      sidebarCachedErr: 'Cached data / offline',
      accountingAnomaly: ' · accounting anomaly',
      selectLabel: 'Language / Язык',
      reasons: {
        prefix_frozen: 'Cacheable prefix preserved',
        size_floor: 'Below minimum size',
        compressor_noop: 'No change after processing',
        below_threshold: 'Below threshold',
        too_small: 'Too few tokens',
        disabled: 'Compression disabled',
        compression_disabled: 'Compression disabled',
        no_compressible_content: 'No compressible content',
        ratio_too_high: 'Compression ratio too high',
        no_content: 'No content',
        skipped: 'Compression skipped',
        error: 'Compression error',
        cache_hit: 'Cache hit',
        unsupported_model: 'Unsupported model',
        no_savings: 'No savings',
        passthrough: 'Passthrough'
      }
    },
    ru: {
      lang: 'ru',
      eyebrow: 'HEADROOM / МОНИТОР СЖАТИЯ',
      title: 'Меньше токенов. Больше контекста.',
      subtitle: 'Глобальный прокси · все агенты и запросы, не текущий чат.',
      sidebarScope: 'Глобальный прокси · не текущий чат',
      sidebarAria: 'Headroom: глобальный прокси',
      pageAria: 'Монитор Headroom',
      widgetTitle: 'Headroom · глобальный прокси, не текущий чат',
      loading: 'Загрузка…',
      loadingStats: 'Загрузка статистики прокси…',
      unavailableStats: 'Статистика пока недоступна.',
      proxyOnline: 'Прокси доступен',
      staleData: 'Данные устарели',
      offlineCached: 'Нет связи · последние данные',
      offline: 'Не в сети',
      errUnavailable: 'Headroom недоступен. Повторная проверка через 5 с.',
      errNetwork: 'Нет связи с Headroom. Повторная проверка через 5 с.',
      noticeLastGood: ' Показан последний успешный снимок, не новые значения.',
      noticeNoZeroes: ' Метрики не заменяются нулями.',
      staleNotice: 'Данные устарели: снимок старше 15 с. Ожидаем обновление.',
      mode: 'Режим: ',
      primaryModel: ' · Основная модель: ',
      snapshot: ' · Снимок: ',
      polling: ' · Опрос каждые 5 с',
      beforeCompression: 'До сжатия',
      beforeHint: 'Учётная база: вход + учтённая экономия',
      afterCompression: 'После сжатия',
      afterHint: 'Накопленные входные токены; не уникальный контекст',
      tokensSaved: 'Сэкономлено токенов',
      savedHint: 'Учтённая экономия / база до оптимизации: ',
      compressedRequests: 'Сжатые запросы',
      compressedHint: 'Всего API-запросов: ',
      historyTitle: 'История учётной доли',
      historyEmpty: 'История пока пуста. Данные появятся после опроса прокси.',
      historyAria: ceiling => 'История учётной доли: экономия / база до оптимизации, от 0 до ' + ceiling + ' процентов',
      historySamples: count => 'Учётная доля · последние ' + count + ' замеров',
      samplesCount: count => count + ' замеров',
      compressionQuality: 'Качество сжатия',
      average: 'Среднее',
      avgHint: 'Среднее взвешенное по сжатым запросам',
      bestResult: 'Лучший результат',
      toolSchemas: 'Схемы инструментов',
      wsTokens: 'Responses: блоки сжатия (HTTP/WS)',
      wsHint: 'Повторная обработка блоков, не уникальные токены: не прибавлять к общему итогу.',
      costTitle: 'Стоимость · оценка, не счёт провайдера',
      costWithout: 'Без сжатия',
      costWith: 'Со сжатием',
      costSavings: 'Оценка экономии от сжатия',
      cacheDiscount: 'Скидка кэша провайдера',
      cacheHint: 'Отдельно от экономии сжатия',
      costFootnote: 'Оценка по API-тарифам — не списания и не экономия подписки ChatGPT/Copilot. Сжатие и кэш показаны отдельно; не складываются.',
      whyUncompressed: 'Почему запросы не сжаты',
      noReasons: 'Прокси не сообщил причины несжатых запросов.',
      dataScope: 'Область данных',
      dataScopeDesc: 'Учтённая экономия атрибутирована по диалогам, а строки агентов отражают сокращения переданного контекста и не складываются с глобальным итогом. Проценты выше 100% отмечены как аномалия исходного учёта. Счётчики могут сбрасываться при перезапуске прокси. История — до 120 снимков в памяти сервера; «—» означает отсутствие метрики.',
      recentRequests: 'Недавние запросы: сокращение переданного контекста',
      tableAria: 'Статистика агентов, таблица с горизонтальной прокруткой',
      tableCaption: 'Агенты во всём прокси',
      tableCols: ['Агент', 'Запросы', 'До', 'После', 'Сэкономлено', 'Сжатие', 'Модели / провайдеры'],
      noAgents: 'Разбивка по агентам пока отсутствует.',
      unlabeled: 'Без метки',
      sidebarCachedErr: 'Последние данные / нет связи',
      accountingAnomaly: ' · аномалия учёта',
      selectLabel: 'Language / Язык',
      reasons: {
        prefix_frozen: 'Сохранён кешируемый префикс',
        size_floor: 'Ниже минимального размера',
        compressor_noop: 'Без изменений после обработки',
        below_threshold: 'Ниже порога',
        too_small: 'Слишком мало токенов',
        disabled: 'Сжатие отключено',
        compression_disabled: 'Сжатие отключено',
        no_compressible_content: 'Нет содержимого для сжатия',
        ratio_too_high: 'Слишком высокий коэффициент сжатия',
        no_content: 'Нет содержимого',
        skipped: 'Сжатие пропущено',
        error: 'Ошибка сжатия',
        cache_hit: 'Попадание в кэш',
        unsupported_model: 'Модель не поддерживается',
        no_savings: 'Нет выигрыша',
        passthrough: 'Без обработки'
      }
    }
  };

  const listeners = new Set();
  let state = { data: null, loading: true, error: null, now: Date.now() };
  let timer = null, controller = null, generation = 0;

  function emit(patch) {
    state = Object.assign({}, state, patch, { now: Date.now() });
    listeners.forEach(fn => fn(state));
  }

  function getStoredPreference() {
    try {
      const store = (typeof window !== 'undefined' && window.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (store) {
        const val = store.getItem(STORAGE_KEY);
        if (val === 'auto' || val === 'en' || val === 'ru') return val;
      }
    } catch (_) {}
    return 'auto';
  }

  let currentPref = getStoredPreference();

  function setStoredPreference(pref) {
    currentPref = (pref === 'en' || pref === 'ru') ? pref : 'auto';
    try {
      const store = (typeof window !== 'undefined' && window.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (store) {
        if (currentPref === 'auto') {
          store.removeItem(STORAGE_KEY);
        } else {
          store.setItem(STORAGE_KEY, currentPref);
        }
      }
    } catch (_) {}
    emit({});
  }

  function detectSystemLocale() {
    try {
      const nav = (typeof window !== 'undefined' && window.navigator) || (typeof navigator !== 'undefined' ? navigator : null);
      if (nav) {
        if (Array.isArray(nav.languages) && nav.languages.length > 0 && typeof nav.languages[0] === 'string' && nav.languages[0].trim()) {
          return nav.languages[0].trim();
        }
        if (typeof nav.language === 'string' && nav.language.trim()) {
          return nav.language.trim();
        }
      }
    } catch (_) {}
    if (typeof SDK?.useI18n === 'function') {
      try {
        const host = SDK.useI18n();
        if (host && typeof host.locale === 'string') return host.locale.trim();
      } catch (_) {}
    }
    return null;
  }

  function resolveLocale(pref) {
    if (pref === 'en') return 'en';
    if (pref === 'ru') return 'ru';
    const sys = detectSystemLocale();
    if (sys && /^ru([-_].*)?$/i.test(sys)) {
      return 'ru';
    }
    return 'en';
  }

  function useLocale() {
    const activeLocale = resolveLocale(currentPref);
    return {
      pref: currentPref,
      setPref: setStoredPreference,
      locale: activeLocale,
      t: I18N[activeLocale],
      fmt: createFormatters(activeLocale)
    };
  }

  function valid(data) {
    return data && typeof data.available === 'boolean' && data.scope === 'proxy' &&
      Number.isFinite(Date.parse(data.sampled_at)) && data.summary && typeof data.summary === 'object' &&
      !Array.isArray(data.summary) && Array.isArray(data.agents) && Array.isArray(data.history);
  }

  async function poll(epoch) {
    controller = new AbortController();
    const requestController = controller;
    let deadline;
    try {
      const data = await Promise.race([
        SDK.fetchJSON(ENDPOINT, { signal: requestController.signal }),
        new Promise((_, reject) => {
          requestController.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          deadline = setTimeout(() => requestController.abort(), 10000);
        })
      ]);
      if (epoch !== generation) return;
      if (!valid(data)) throw new Error('invalid snapshot');
      if (data.available) emit({ data, loading: false, error: null });
      else emit({ loading: false, error: 'unavailable' });
    } catch (_) {
      if (epoch === generation) emit({ loading: false, error: 'network' });
    } finally {
      clearTimeout(deadline);
      if (epoch === generation && listeners.size) {
        controller = null;
        timer = setTimeout(() => poll(epoch), POLL_MS);
      }
    }
  }

  function useSnapshot() {
    const [current, setCurrent] = useState(state);
    useEffect(() => {
      listeners.add(setCurrent);
      setCurrent(state);
      if (listeners.size === 1) poll(++generation);
      return () => {
        listeners.delete(setCurrent);
        if (!listeners.size) {
          generation++;
          clearTimeout(timer);
          timer = null;
          if (controller) controller.abort();
          controller = null;
        }
      };
    }, []);
    return current;
  }

  const number = v => typeof v === 'number' && Number.isFinite(v);

  function createFormatters(loc) {
    const intlTag = loc === 'ru' ? 'ru-RU' : 'en-US';
    const numFmt = new Intl.NumberFormat(intlTag, { maximumFractionDigits: 0 });
    const pctFmt = new Intl.NumberFormat(intlTag, { maximumFractionDigits: 1 });
    const currFmt = new Intl.NumberFormat(intlTag, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const t = I18N[loc];
    return {
      fmt: v => number(v) ? numFmt.format(v) : '—',
      pct: v => number(v) ? pctFmt.format(v) + '%' + (v > 100 ? t.accountingAnomaly : '') : '—',
      money: v => number(v) ? currFmt.format(v) : '—',
      time: d => {
        const dt = d instanceof Date ? d : new Date(d);
        return Number.isFinite(dt.getTime()) ? dt.toLocaleTimeString(intlTag) : '—';
      },
      dateTime: d => {
        const dt = d instanceof Date ? d : new Date(d);
        return Number.isFinite(dt.getTime()) ? dt.toLocaleString(intlTag) : '—';
      }
    };
  }

  const items = v => Array.isArray(v) ? v.map(x => String(x)).join(', ') : v && typeof v === 'object' ? Object.keys(v).join(', ') : typeof v === 'string' ? v : '—';

  function status(current, t) {
    if (current.loading && !current.data) return t.loading;
    if (current.error) return current.data ? t.offlineCached : t.offline;
    if (current.data && current.now - Date.parse(current.data.sampled_at) > STALE_MS) return t.staleData;
    return t.proxyOnline;
  }

  function badge(current, t) {
    const label = status(current, t);
    const isWarn = Boolean(current.error || (current.data && current.now - Date.parse(current.data.sampled_at) > STALE_MS));
    return h('span', { className: 'hrm-status' + (isWarn ? ' hrm-status-warn' : ''), role: 'status' },
      h('span', { 'aria-hidden': true }, '●'), ' ', label
    );
  }

  function metric(label, value, hint, accent) {
    return h('div', { className: 'hrm-metric' + (accent ? ' hrm-metric-accent' : ''), key: label },
      h('div', { className: 'hrm-label' }, label),
      h('strong', { className: 'hrm-value' }, value),
      hint ? h('p', { className: 'hrm-muted' }, hint) : null
    );
  }

  function section(title, children) {
    return h('section', { className: 'hrm-panel' }, h('h2', null, title), children);
  }

  function Trend({ history, t, fmt }) {
    const samples = history.filter(x => x && number(x.compression_pct_overall)).slice(-60);
    if (!samples.length) return h('p', { className: 'hrm-muted' }, t.historyEmpty);
    const ceiling = Math.max(1, Math.min(100, Math.ceil(Math.max(...samples.map(x => x.compression_pct_overall)) * 1.1)));
    const points = samples.map((x, i) => {
      const xpos = samples.length === 1 ? 320 : 24 + i * 592 / (samples.length - 1);
      return xpos + ',' + (146 - Math.min(ceiling, Math.max(0, x.compression_pct_overall)) / ceiling * 120);
    }).join(' ');

    return h('div', { className: 'hrm-trend' },
      h('svg', { viewBox: '0 0 640 180', role: 'img', 'aria-label': t.historyAria(ceiling) },
        h('title', null, t.historySamples(samples.length)),
        [26, 86, 146].map((y, i) => h('g', { key: y },
          h('line', { x1: 24, x2: 616, y1: y, y2: y, className: 'hrm-gridline' }),
          h('text', { x: 24, y: y - 5 }, fmt.pct([ceiling, ceiling / 2, 0][i]))
        )),
        h('polyline', { points, fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' }),
        samples.length === 1 ? h('circle', {
          cx: 320,
          cy: 146 - Math.min(ceiling, Math.max(0, samples[0].compression_pct_overall)) / ceiling * 120,
          r: 4,
          fill: 'currentColor'
        }) : null
      ),
      h('div', { className: 'hrm-trend-caption hrm-muted' },
        h('span', null, fmt.time(samples[0].sampled_at)),
        h('span', null, t.samplesCount(samples.length)),
        h('span', null, fmt.time(samples[samples.length - 1].sampled_at))
      )
    );
  }

  function Reasons({ reasons, t, fmt }) {
    if (!reasons || typeof reasons !== 'object' || !Object.keys(reasons).length) {
      return h('p', { className: 'hrm-muted' }, t.noReasons);
    }
    return h('dl', { className: 'hrm-reasons' }, Object.entries(reasons).slice(0, 50).map(([key, value]) => {
      const label = t.reasons[key] || key;
      return h('div', { key },
        h('dt', null, label, t.reasons[key] ? h('small', { className: 'hrm-muted' }, ' · ' + key) : null),
        h('dd', null, fmt.fmt(number(value) ? value : value && value.count))
      );
    }));
  }

  function Agents({ agents, t, fmt }) {
    if (!agents.length) return h('p', { className: 'hrm-muted' }, t.noAgents);
    return h('div', { className: 'hrm-table-wrap', tabIndex: 0, role: 'region', 'aria-label': t.tableAria },
      h('table', null,
        h('caption', { className: 'hrm-sr-only' }, t.tableCaption),
        h('thead', null, h('tr', null, t.tableCols.map(label => h('th', { key: label, scope: 'col' }, label)))),
        h('tbody', null, agents.map((a, i) => h('tr', { key: String(a.agent || i) },
          h('td', null, h('strong', null, a.label || a.agent || t.unlabeled), h('small', { className: 'hrm-muted' }, a.agent || '—')),
          h('td', null, fmt.fmt(a.requests)),
          h('td', null, fmt.fmt(a.before_tokens)),
          h('td', null, fmt.fmt(a.after_tokens)),
          h('td', null, fmt.fmt(a.tokens_saved)),
          h('td', null, fmt.pct(a.savings_percent)),
          h('td', null, items(a.models), h('small', { className: 'hrm-muted' }, items(a.providers)))
        )))
      )
    );
  }

  function Page() {
    const current = useSnapshot();
    const { pref, setPref, locale, t, fmt } = useLocale();
    const data = current.data;
    const s = data ? data.summary : {};

    const errorMsg = current.error === 'unavailable' ? t.errUnavailable :
                     current.error === 'network' ? t.errNetwork :
                     current.error;

    return h('section', { className: 'hrm', lang: locale, 'aria-label': t.pageAria },
      h('header', { className: 'hrm-heading' },
        h('div', null,
          h('p', { className: 'hrm-eyebrow' }, t.eyebrow),
          h('h1', null, t.title),
          h('p', { className: 'hrm-muted' }, t.subtitle)
        ),
        h('div', { className: 'hrm-controls' },
          h('label', { className: 'hrm-sr-only', htmlFor: 'hrm-locale-select' }, t.selectLabel),
          h('select', {
            id: 'hrm-locale-select',
            className: 'hrm-select',
            'aria-label': t.selectLabel,
            value: pref,
            onChange: e => setPref(e.target.value)
          },
            h('option', { value: 'auto' }, 'Auto'),
            h('option', { value: 'en' }, 'English'),
            h('option', { value: 'ru' }, 'Русский')
          ),
          badge(current, t)
        )
      ),
      errorMsg ? h('div', { className: 'hrm-notice', role: 'alert' },
        errorMsg,
        data ? t.noticeLastGood : t.noticeNoZeroes
      ) : null,
      status(current, t) === t.staleData ? h('div', { className: 'hrm-notice', role: 'status' }, t.staleNotice) : null,
      !data ? h('div', { className: 'hrm-panel', role: 'status' }, current.loading ? t.loadingStats : t.unavailableStats) :
        h('div', { className: 'hrm-body' },
          h('div', { className: 'hrm-meta hrm-muted' },
            t.mode, s.mode || '—',
            t.primaryModel, s.primary_model || '—',
            t.snapshot, h('time', { dateTime: data.sampled_at }, fmt.dateTime(data.sampled_at)),
            t.polling
          ),
          h('div', { className: 'hrm-metrics' },
            metric(t.beforeCompression, fmt.fmt(s.tokens_before), t.beforeHint),
            metric(t.afterCompression, fmt.fmt(s.tokens_after), t.afterHint),
            metric(t.tokensSaved, fmt.fmt(s.tokens_saved), t.savedHint + fmt.pct(s.compression_pct_overall), true),
            metric(t.compressedRequests, fmt.fmt(s.requests_compressed), t.compressedHint + fmt.fmt(s.api_requests))
          ),
          h('div', { className: 'hrm-columns' },
            section(t.historyTitle, h(Trend, { history: data.history, t, fmt })),
            section(t.compressionQuality, h('div', { className: 'hrm-small-metrics' },
              metric(t.average, fmt.pct(s.avg_compression_pct), t.avgHint),
              metric(t.bestResult, fmt.pct(s.best_compression_pct)),
              metric(t.toolSchemas, fmt.fmt(s.tool_schema_tokens_saved), t.tokensSaved),
              metric(t.wsTokens, fmt.fmt(s.codex_ws_tokens_saved), t.wsHint)
            ))
          ),
          section(t.costTitle, h('div', null,
            h('div', { className: 'hrm-metrics' },
              metric(t.costWithout, fmt.money(s.cost_without_usd)),
              metric(t.costWith, fmt.money(s.cost_with_usd)),
              metric(t.costSavings, fmt.money(s.compression_saved_usd), null, true),
              metric(t.cacheDiscount, fmt.money(s.provider_cache_discount_usd), t.cacheHint)
            ),
            h('p', { className: 'hrm-muted' }, t.costFootnote)
          )),
          h('div', { className: 'hrm-columns hrm-bottom' },
            section(t.whyUncompressed, h(Reasons, { reasons: s.uncompressed_requests, t, fmt })),
            section(t.dataScope, h('p', { className: 'hrm-muted' }, t.dataScopeDesc))
          ),
          section(t.recentRequests, h(Agents, { agents: data.agents.filter(a => a && typeof a === 'object'), t, fmt }))
        )
    );
  }

  function Sidebar() {
    const current = useSnapshot();
    const { locale, t, fmt } = useLocale();
    const s = current.data ? current.data.summary : {};
    return h('aside', { className: 'hrm hrm-sidebar', lang: locale, 'aria-label': t.sidebarAria },
      h('h2', null, 'Headroom'),
      badge(current, t),
      h('p', { className: 'hrm-muted' }, t.sidebarScope),
      metric(t.tokensSaved, fmt.fmt(s.tokens_saved), fmt.pct(s.compression_pct_overall), true),
      metric(t.compressedRequests, fmt.fmt(s.requests_compressed)),
      current.error ? h('p', { className: 'hrm-muted' }, t.sidebarCachedErr) : null
    );
  }

  function StatusWidget() {
    const current = useSnapshot();
    const { locale, t } = useLocale();
    return h('div', { className: 'hrm hrm-widget', lang: locale, title: t.widgetTitle },
      h('span', null, 'Headroom'),
      badge(current, t)
    );
  }

  registry.register('headroom-monitor', Page);
  if (registry.registerSlot) {
    registry.registerSlot('headroom-monitor', 'sidebar', Sidebar);
    registry.registerSlot('headroom-monitor', 'header-right', StatusWidget);
  }
})();
