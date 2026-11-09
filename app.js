/* DeepSeek 时段观察
 * 所有计算固定使用北京时间（UTC+8），与设备所在时区无关。
 * 只按每周规则计算，不识别中国法定节假日或调休。
 * 价格集中在下面的 CONFIG，需要更新时只改这里。
 */
(function (root) {
  'use strict';

  // ---------- 配置（单一数据源） ----------
  const CONFIG = {
    priceCheckedOn: '2026-11-09',
    peakHours: [[9, 12], [14, 18]],
    models: [
      { key: 'flash', name: 'DeepSeek Flash', id: 'deepseek-flash', icon: '✳',
        rows: [['输入 · 缓存命中', 0.02, 0.04], ['输入 · 缓存未命中', 1, 2], ['输出', 4, 8]] },
      { key: 'pro', name: 'DeepSeek Pro', id: 'deepseek-v4-pro', icon: '◆',
        rows: [['输入 · 缓存命中', 0.15, 0.30], ['输入 · 缓存未命中', 4.5, 9], ['输出', 13.5, 27]] }
    ]
  };

  const OFFSET = 8 * 3600000;
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const pad = n => String(n).padStart(2, '0');

  // 北京时间当天 00:00 对应的 UTC 毫秒
  function bjMidnight(now) {
    const s = new Date(now + OFFSET);
    return Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - OFFSET;
  }

  // 某个北京日的信息：周一至周五有高峰，周末全天空闲
  function dayInfo(midnight) {
    const dow = new Date(midnight + OFFSET).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    return { dow, weekend, hasPeak: !weekend };
  }

  // 当天所有切换点（UTC 毫秒）
  function dayBoundaries(midnight) {
    if (!dayInfo(midnight).hasPeak) return [];
    const out = [];
    for (const [a, b] of CONFIG.peakHours) out.push(midnight + a * HOUR, midnight + b * HOUR);
    return out;
  }

  function isPeakAt(now) {
    const m = bjMidnight(now);
    if (!dayInfo(m).hasPeak) return false;
    const h = (now - m) / HOUR;
    return CONFIG.peakHours.some(([a, b]) => h >= a && h < b);
  }

  // 下一个切换点（严格大于 now）。周末最多跳过 2 天，查 8 天足够。
  function nextSwitch(now) {
    const m = bjMidnight(now);
    for (let d = 0; d < 8; d++) {
      for (const t of dayBoundaries(m + d * DAY)) if (t > now) return t;
    }
    return null;
  }
  function prevSwitch(now) {
    const m = bjMidnight(now);
    for (let d = 0; d < 8; d++) {
      const list = dayBoundaries(m - d * DAY);
      for (let i = list.length - 1; i >= 0; i--) if (list[i] <= now) return list[i];
    }
    return null;
  }

  function getState(now) {
    const midnight = bjMidnight(now);
    return { now, midnight, shifted: new Date(now + OFFSET), info: dayInfo(midnight),
      hour: (now - midnight) / HOUR, peak: isPeakAt(now), next: nextSwitch(now), prev: prevSwitch(now) };
  }

  function duration(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(total / 86400), h = Math.floor(total % 86400 / 3600);
    const m = Math.floor(total % 3600 / 60), s = total % 60;
    return (days ? days + '天 ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function relative(ms) {
    const min = Math.round(ms / 60000);
    if (min < 60) return min + ' 分钟后';
    const h = Math.floor(min / 60);
    if (h < 24) return h + ' 小时' + (min % 60 ? ' ' + (min % 60) + ' 分' : '') + '后';
    return Math.floor(h / 24) + ' 天' + (h % 24 ? ' ' + (h % 24) + ' 小时' : '') + '后';
  }
  function hm(t) { const d = new Date(t + OFFSET); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function formatTarget(t) {
    const d = new Date(t + OFFSET);
    return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日 周' + WEEKDAYS[d.getUTCDay()] + ' ' + hm(t);
  }
  function money(v) { return '¥' + (v < 1 ? v.toFixed(2) : String(v)); }

  function shouldNotify(state, now, minutes, enabled, simulated, permission, last) {
    return enabled && !simulated && !state.peak && state.next !== null && state.next - now > 0 &&
      state.next - now <= minutes * 60000 && last !== state.next && permission === 'granted';
  }

  const api = { CONFIG, getState, isPeakAt, nextSwitch, prevSwitch, dayInfo, bjMidnight, duration, shouldNotify };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // ---------- 页面 ----------
  const $ = id => document.getElementById(id);
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };
  let simulatedTime = null, remindersEnabled = false, notifiedFor = null;
  let lastStaticKey = '';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function buildPriceTables() {
    const grid = $('price-grid');
    for (const model of CONFIG.models) {
      const card = el('article', 'price-card card');
      const title = el('div', 'model-title');
      title.append(el('div', 'model-icon ' + model.key, model.icon));
      const names = el('div'); names.append(el('h3', '', model.name), el('code', '', model.id));
      title.append(names);
      const table = el('table');
      table.innerHTML = '<thead><tr><th scope="col">计费项目</th><th scope="col" class="col-off">空闲</th><th scope="col" class="col-peak">高峰</th></tr></thead>';
      const body = el('tbody');
      for (const [label, off, peak] of model.rows) {
        const tr = el('tr');
        const th = el('th', '', label); th.scope = 'row';
        tr.append(th, el('td', 'col-off', money(off)), el('td', 'col-peak', money(peak)));
        body.append(tr);
      }
      table.append(body);
      card.append(title, table);
      grid.append(card);
    }
    $('price-checked').textContent = '空闲价格为高峰的一半。价格于 ' + CONFIG.priceCheckedOn + ' 对照官方说明核对，可能随时调整，请以官方为准。';
  }

  function quickPrice(model, peak) {
    return model.rows.map(r => money(peak ? r[2] : r[1])).join(' / ');
  }

  // 每分钟（或切换点变化时）才需要重建的部分
  function renderStatic(state) {
    const key = state.midnight + ':' + state.next + ':' + Math.floor(state.now / 60000);
    if (key === lastStaticKey) return;
    lastStaticKey = key;

    // 未来 7 天
    const grid = $('week-grid');
    grid.replaceChildren();
    for (let d = 0; d < 7; d++) {
      const m = state.midnight + d * DAY, info = dayInfo(m), date = new Date(m + OFFSET);
      const row = el('div', 'week-row' + (d === 0 ? ' today' : '') + (info.hasPeak ? '' : ' all-off'));
      row.setAttribute('role', 'listitem');
      const label = el('div', 'week-label');
      label.append(el('strong', '', d === 0 ? '今天' : d === 1 ? '明天' : '周' + WEEKDAYS[info.dow]),
        el('span', '', (date.getUTCMonth() + 1) + '/' + date.getUTCDate()));
      const bar = el('div', 'week-bar');
      if (info.hasPeak) {
        for (const [a, b] of CONFIG.peakHours) {
          const seg = el('span', 'seg');
          seg.style.left = (a / 24 * 100) + '%';
          seg.style.width = ((b - a) / 24 * 100) + '%';
          bar.append(seg);
        }
      } else {
        bar.append(el('em', 'day-tag', '周末 · 全天空闲'));
      }
      if (d === 0) {
        const marker = el('i', 'now-marker');
        marker.style.left = (state.hour / 24 * 100) + '%';
        bar.append(marker);
      }
      const desc = info.hasPeak ? '高峰 09:00–12:00、14:00–18:00' : '周末，全天空闲';
      row.setAttribute('aria-label', label.textContent + '：' + desc);
      row.append(label, bar);
      grid.append(row);
    }

    // 接下来的切换
    const list = $('upcoming-list');
    list.replaceChildren();
    let t = state.next;
    for (let i = 0; i < 5 && t !== null; i++) {
      const toPeak = isPeakAt(t);
      const li = el('li', toPeak ? 'to-peak' : 'to-off');
      const left = el('div');
      left.append(el('span', 'when', formatTarget(t)), el('small', '', relative(t - state.now)));
      li.append(left, el('strong', 'tag', toPeak ? '进入高峰' : '进入空闲'));
      list.append(li);
      t = nextSwitch(t);
    }

  }

  function render() {
    const live = simulatedTime === null;
    const now = live ? Date.now() : simulatedTime;
    const state = getState(now), t = state.shifted;
    const peak = state.peak;

    $('hero').dataset.state = peak ? 'peak' : 'off';
    document.body.dataset.price = peak ? 'peak' : 'off';
    document.body.classList.toggle('simulating', !live);
    $('simulation-banner').hidden = live;
    $('top-mode').textContent = live ? '实时' : '模拟';
    $('status-label').textContent = live ? '现在是' : '模拟时间是';
    $('status').textContent = peak ? '高峰时段' : '空闲时段';
    $('saving-pill').hidden = peak;
    $('status-note').textContent = peak
      ? '每周规则参考高峰价。非紧急的批量任务可以等到 ' + (state.next ? hm(state.next) : '稍后') + ' 之后。'
      : '每周规则参考空闲价，适合跑批量任务。';

    // 当前时段进度
    if (state.prev !== null && state.next !== null) {
      const pct = Math.min(100, Math.max(0, (now - state.prev) / (state.next - state.prev) * 100));
      $('segment-fill').style.width = pct + '%';
      $('segment-start').textContent = (bjMidnight(state.prev) === state.midnight ? '' : formatTarget(state.prev).split(' ').slice(0, 2).join(' ') + ' ') + hm(state.prev);
      $('segment-end').textContent = (bjMidnight(state.next) === state.midnight ? '' : formatTarget(state.next).split(' ').slice(0, 2).join(' ') + ' ') + hm(state.next);
    }

    $('quick-flash').textContent = quickPrice(CONFIG.models[0], peak);
    $('quick-pro').textContent = quickPrice(CONFIG.models[1], peak);

    $('next-label').textContent = '距离进入' + (peak ? '空闲' : '高峰');
    $('countdown').textContent = state.next ? duration(state.next - now) : '—';
    $('next-time').textContent = state.next ? formatTarget(state.next) : '暂无';
    $('clock').textContent = pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()) + ':' + pad(t.getUTCSeconds());
    $('date').textContent = t.getUTCFullYear() + '年' + (t.getUTCMonth() + 1) + '月' + t.getUTCDate() + '日 星期' + WEEKDAYS[t.getUTCDay()];
    $('price-caption').textContent = (live ? '当前' : '模拟时间') + '适用列已高亮';
    document.title = (peak ? '● 高峰' : '○ 空闲') + ' · ' + (state.next ? duration(state.next - now) : '') + ' | DeepSeek 时段观察';

    renderStatic(state);

    if (shouldNotify(state, now, Number($('reminder-minutes').value), remindersEnabled, !live,
      typeof Notification === 'undefined' ? 'unsupported' : Notification.permission, notifiedFor)) {
      notifiedFor = state.next;
      try { new Notification('即将进入高峰时段', { body: '北京时间 ' + formatTarget(state.next) + ' 起为每周规则的高峰时段，请留意法定节假日可能不同。', icon: 'favicon.svg' }); }
      catch (_) { $('reminder-message').textContent = '无法显示通知，请检查浏览器通知设置。'; }
    }
  }

  // 每秒在整秒边界刷新，避免 250ms 轮询带来的无谓重绘
  let timer = null;
  function tick() {
    render();
    clearTimeout(timer);
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = $('theme-toggle');
    btn.textContent = theme === 'light' ? '☾' : '☼';
    btn.setAttribute('aria-label', theme === 'light' ? '切换深色主题' : '切换浅色主题');
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f4f3f9' : '#0b0c12';
    storage.set('monitor-theme', theme);
  }

  function init() {
    buildPriceTables();
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    $('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));

    function fillOptions(id, start, end, selected, suffix) {
      const field = $(id); field.replaceChildren();
      for (let n = start; n <= end; n++) {
        const option = document.createElement('option');
        option.value = String(n); option.textContent = pad(n) + suffix; field.append(option);
      }
      field.value = String(Math.min(Math.max(selected, start), end));
    }
    function updateDays() {
      const year = Number($('simulation-year').value), month = Number($('simulation-month').value);
      if (!Number.isInteger(year) || year < 1900 || year > 9998 || !month) return;
      const selected = Number($('simulation-day').value) || 1;
      fillOptions('simulation-day', 1, new Date(Date.UTC(year, month, 0)).getUTCDate(), selected, '日');
    }
    const initial = new Date(Date.now() + OFFSET);
    $('simulation-year').value = String(initial.getUTCFullYear());
    fillOptions('simulation-month', 1, 12, initial.getUTCMonth() + 1, '月');
    fillOptions('simulation-day', 1, 31, initial.getUTCDate(), '日'); updateDays();
    fillOptions('simulation-hour', 0, 23, initial.getUTCHours(), '时');
    fillOptions('simulation-minute', 0, 59, initial.getUTCMinutes(), '分');
    $('simulation-year').addEventListener('input', updateDays);
    $('simulation-month').addEventListener('change', updateDays);
    $('simulation-form').addEventListener('submit', e => {
      e.preventDefault(); updateDays();
      const t = Date.UTC(Number($('simulation-year').value), Number($('simulation-month').value) - 1,
        Number($('simulation-day').value), Number($('simulation-hour').value), Number($('simulation-minute').value)) - OFFSET;
      simulatedTime = t;
      $('simulation-label').textContent = formatTarget(t);
      lastStaticKey = '';
      render();
    });
    $('return-live').addEventListener('click', () => { simulatedTime = null; lastStaticKey = ''; render(); });

    $('reminder-toggle').addEventListener('click', async () => {
      const btn = $('reminder-toggle'), msg = $('reminder-message');
      if (remindersEnabled) {
        remindersEnabled = false; btn.textContent = '开启提醒'; btn.setAttribute('aria-pressed', 'false');
        msg.textContent = '提醒已关闭。'; return;
      }
      if (!('Notification' in window) || !window.isSecureContext) { msg.textContent = '当前环境不支持通知，请通过 HTTPS 网址打开（如 GitHub Pages）。'; return; }
      let permission; try { permission = await Notification.requestPermission(); } catch (_) { permission = 'denied'; }
      if (permission !== 'granted') { msg.textContent = '通知未获允许，请在浏览器设置中允许后重试。'; return; }
      remindersEnabled = true; notifiedFor = null; btn.textContent = '关闭提醒'; btn.setAttribute('aria-pressed', 'true');
      msg.textContent = '提醒已开启：请保持页面打开，仅实时模式生效。'; render();
    });
    $('reminder-minutes').addEventListener('change', () => { notifiedFor = null; render(); });

    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    tick();
  }
  init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
