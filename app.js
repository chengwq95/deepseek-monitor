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
  let language = 'zh';
  const en = () => language === 'en';
  const tr = (zh, english) => en() ? english : zh;
  const shortWeekday = day => en() ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day] : '周' + WEEKDAYS[day];

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
    return (days ? days + (en() ? (days === 1 ? ' day ' : ' days ') : '天 ') : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function relative(ms) {
    const min = Math.round(ms / 60000), h = Math.floor(min / 60), days = Math.floor(h / 24);
    if (en()) {
      if (min < 60) return 'in ' + min + ' min';
      if (h < 24) return 'in ' + h + ' hr' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
      return 'in ' + days + (days === 1 ? ' day' : ' days') + (h % 24 ? ' ' + (h % 24) + ' hr' : '');
    }
    if (min < 60) return min + ' 分钟后';
    if (h < 24) return h + ' 小时' + (min % 60 ? ' ' + (min % 60) + ' 分' : '') + '后';
    return days + ' 天' + (h % 24 ? ' ' + (h % 24) + ' 小时' : '') + '后';
  }
  function hm(t) { const d = new Date(t + OFFSET); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
  function formatTarget(t) {
    const d = new Date(t + OFFSET);
    return en() ? (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + shortWeekday(d.getUTCDay()) + ' ' + hm(t)
      : (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日 ' + shortWeekday(d.getUTCDay()) + ' ' + hm(t);
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
    grid.replaceChildren();
    for (const model of CONFIG.models) {
      const card = el('article', 'price-card card');
      const title = el('div', 'model-title');
      title.append(el('div', 'model-icon ' + model.key, model.icon));
      const names = el('div'); names.append(el('h3', '', model.name), el('code', '', model.id));
      title.append(names);
      const table = el('table');
      table.innerHTML = '<thead><tr><th scope="col">' + tr('计费项目','Category') + '</th><th scope="col" class="col-off">' + tr('空闲','Off-peak') + '</th><th scope="col" class="col-peak">' + tr('高峰','Peak') + '</th></tr></thead>';
      const body = el('tbody');
      for (const [index, [label, off, peak]] of model.rows.entries()) {
        const tr = el('tr');
        const th = el('th', '', en() ? ['Input · cache hit','Input · cache miss','Output'][index] : label); th.scope = 'row';
        tr.append(th, el('td', 'col-off', money(off)), el('td', 'col-peak', money(peak)));
        body.append(tr);
      }
      table.append(body);
      card.append(title, table);
      grid.append(card);
    }
    $('price-checked').textContent = en() ? 'Off-peak prices are half of peak prices. Checked against the official page on ' + CONFIG.priceCheckedOn + '; prices may change.' : '空闲价格为高峰的一半。价格于 ' + CONFIG.priceCheckedOn + ' 对照官方说明核对，可能随时调整，请以官方为准。';
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
      label.append(el('strong', '', d === 0 ? tr('今天','Today') : d === 1 ? tr('明天','Tomorrow') : shortWeekday(info.dow)),
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
        bar.append(el('em', 'day-tag', tr('周末 · 全天空闲','Weekend · off-peak')));
      }
      if (d === 0) {
        const marker = el('i', 'now-marker');
        marker.style.left = (state.hour / 24 * 100) + '%';
        bar.append(marker);
      }
      const desc = info.hasPeak ? tr('高峰 09:00–12:00、14:00–18:00','Peak 09:00–12:00 and 14:00–18:00') : tr('周末，全天空闲','Weekend, off-peak all day');
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
      li.append(left, el('strong', 'tag', toPeak ? tr('进入高峰','Peak begins') : tr('进入空闲','Off-peak begins')));
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
    $('top-mode').textContent = live ? tr('实时','Live') : tr('模拟','Simulated');
    $('status-label').textContent = live ? tr('现在是','Current period') : tr('模拟时间是','Simulated period');
    $('status').textContent = peak ? tr('高峰时段','Peak hours') : tr('空闲时段','Off-peak hours');
    $('saving-pill').hidden = peak;
    $('status-note').textContent = peak
      ? (en() ? 'Weekly rule: peak rates. Off-peak begins at ' + (state.next ? hm(state.next) : 'a later time') + '.' : '每周规则参考高峰价。非紧急的批量任务可以等到 ' + (state.next ? hm(state.next) : '稍后') + ' 之后。')
      : tr('每周规则参考空闲价，适合跑批量任务。','Weekly rule: off-peak rates.');

    // 当前时段进度
    if (state.prev !== null && state.next !== null) {
      const pct = Math.min(100, Math.max(0, (now - state.prev) / (state.next - state.prev) * 100));
      $('segment-fill').style.width = pct + '%';
      $('segment-start').textContent = (bjMidnight(state.prev) === state.midnight ? '' : formatTarget(state.prev).split(' ').slice(0, 2).join(' ') + ' ') + hm(state.prev);
      $('segment-end').textContent = (bjMidnight(state.next) === state.midnight ? '' : formatTarget(state.next).split(' ').slice(0, 2).join(' ') + ' ') + hm(state.next);
    }

    $('quick-flash').textContent = quickPrice(CONFIG.models[0], peak);
    $('quick-pro').textContent = quickPrice(CONFIG.models[1], peak);

    $('next-label').textContent = peak ? tr('距离进入空闲','Time until off-peak') : tr('距离进入高峰','Time until peak');
    $('countdown').textContent = state.next ? duration(state.next - now) : '—';
    $('next-time').textContent = state.next ? formatTarget(state.next) : tr('暂无','Unavailable');
    $('clock').textContent = pad(t.getUTCHours()) + ':' + pad(t.getUTCMinutes()) + ':' + pad(t.getUTCSeconds());
    $('date').textContent = en() ? shortWeekday(t.getUTCDay()) + ', ' + (t.getUTCMonth()+1) + '/' + t.getUTCDate() + '/' + t.getUTCFullYear() : t.getUTCFullYear() + '年' + (t.getUTCMonth() + 1) + '月' + t.getUTCDate() + '日 星期' + WEEKDAYS[t.getUTCDay()];
    $('price-caption').textContent = live ? tr('当前适用列已高亮','Current column highlighted') : tr('模拟时间适用列已高亮','Simulated column highlighted');
    document.title = (peak ? tr('● 高峰','● Peak') : tr('○ 空闲','○ Off-peak')) + ' · ' + (state.next ? duration(state.next - now) : '') + ' | ' + tr('DeepSeek 时段观察','DeepSeek Price Monitor');

    renderStatic(state);

    if (shouldNotify(state, now, Number($('reminder-minutes').value), remindersEnabled, !live,
      typeof Notification === 'undefined' ? 'unsupported' : Notification.permission, notifiedFor)) {
      notifiedFor = state.next;
      try { new Notification(tr('即将进入高峰时段','Peak hours are approaching'), { body: en() ? 'The weekly rule switches to peak at ' + formatTarget(state.next) + ' Beijing time. Public holiday billing may differ.' : '北京时间 ' + formatTarget(state.next) + ' 起为每周规则的高峰时段，请留意法定节假日可能不同。', icon: 'favicon.svg' }); }
      catch (_) { setReminderMessage('error'); }
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
    btn.setAttribute('aria-label', theme === 'light' ? tr('切换深色主题','Switch to dark theme') : tr('切换浅色主题','Switch to light theme')); 
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f4f3f9' : '#0b0c12';
    storage.set('monitor-theme', theme);
  }

  const translations = {
    brand:['时段观察','Price Monitor'], viewingSimulation:['正在查看模拟时间','Viewing simulated time:'], returnLive:['返回实时','Return to live'], saveHalf:['省 50%','Save 50%'], quickLabels:['输入命中 / 未命中 / 输出 · 每百万 tokens','Input hit / miss / output · per 1M tokens'], beijingTime:['北京时间','Beijing time'], weekHeading:['未来 7 天时段','Next 7 days'], legendOff:['空闲（半价）','Off-peak (half price)'], legendPeak:['高峰','Peak'], scheduleNote:['周一至周五 09:00–12:00、14:00–18:00 为高峰；其余时间及周末为空闲。不识别法定节假日，','Mon–Fri 09:00–12:00 and 14:00–18:00 are peak; other hours and weekends are off-peak. Public holidays are not included. '], learnMore:['了解详情','Learn more'], period:['。','.'], pricesHeading:['模型价格','Model prices'], priceUnit:['人民币 · 每 100 万 tokens · ','CNY · per 1M tokens · '], official:['官方价格说明 ↗','Official pricing ↗'], newWindow:['（在新窗口打开）',' (opens in a new window)'], upcomingHeading:['接下来的切换','Upcoming transitions'], toolsHeading:['规划与提醒','Planning & reminders'], viewTime:['查看指定时间','View a specific time'], inBeijing:['按北京时间','Beijing time'], year:['年','Year'], month:['月','Month'], day:['日','Day'], hour:['时','Hour'], minute:['分','Minute'], viewPeriod:['查看时段','View period'], reminderHeading:['高峰前提醒','Peak reminder'], before5:['提前 5 分钟','5 min before'], before15:['提前 15 分钟','15 min before'], before30:['提前 30 分钟','30 min before'], holidayHeading:['关于节假日','About public holidays'], holidayText:['本页只按星期计算，不识别中国法定节假日或调休。DeepSeek 官方规定法定节假日全天为空闲，所以节假日如落在周一至周五，页面会显示高峰，但实际按空闲价计费。','This page uses weekdays only and does not recognize Chinese statutory holidays or make-up workdays. DeepSeek treats statutory holidays as off-peak all day, so a weekday holiday may be shown as peak here even though actual billing is off-peak.'], footerBrand:['✦ DEEPSEEK 时段观察','✦ DEEPSEEK PRICE MONITOR'], footerPrivacy:['本地计算 · 不连接账户 · 不需要 API 密钥','Calculated locally · No account or API key required']
  };
  let reminderMessage = 'default';
  function setReminderMessage(key) {
    reminderMessage = key;
    const messages = {default:['需允许通知并保持页面打开；仅实时模式提醒。','Allow notifications and keep this page open. Live mode only.'], off:['提醒已关闭。','Reminder disabled.'], on:['提醒已开启：请保持页面打开，仅实时模式生效。','Reminder enabled. Keep this page open; live mode only.'], unsupported:['当前环境不支持通知，请通过 HTTPS 网址打开（如 GitHub Pages）。','Notifications are unavailable here. Open the site over HTTPS.'], denied:['通知未获允许，请在浏览器设置中允许后重试。','Notifications were not allowed. Check browser settings and retry.'], error:['无法显示通知，请检查浏览器通知设置。','Could not display the notification. Check browser settings.']};
    $('reminder-message').textContent = messages[key][en() ? 1 : 0];
  }
  function setLanguage(value) {
    language = value; document.documentElement.lang = en() ? 'en' : 'zh-CN';
    storage.set('monitor-language', value);
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = translations[node.dataset.i18n][en() ? 1 : 0]; });
    const toggle = $('language-toggle'); toggle.textContent = en() ? '中文' : 'EN'; toggle.setAttribute('aria-label', en() ? '切换到中文' : 'Switch to English');
    $('reminder-toggle').textContent = remindersEnabled ? tr('关闭提醒','Disable reminder') : tr('开启提醒','Enable reminder');
    setReminderMessage(reminderMessage); setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    ['simulation-month','simulation-day','simulation-hour','simulation-minute'].forEach(id => {
      const select = $(id); Array.from(select.options).forEach(option => { const suffix = {'simulation-month':'月','simulation-day':'日','simulation-hour':'时','simulation-minute':'分'}[id]; option.textContent = pad(option.value) + (en() ? '' : suffix); });
    });
    $('simulation-label').textContent = simulatedTime === null ? '' : formatTarget(simulatedTime);
    buildPriceTables(); lastStaticKey = ''; render();
  }

  function init() {
    language = storage.get('monitor-language') === 'en' ? 'en' : 'zh';
    setLanguage(language);
    $('language-toggle').addEventListener('click', () => setLanguage(en() ? 'zh' : 'en'));
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    $('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));

    function fillOptions(id, start, end, selected, suffix) {
      const field = $(id); field.replaceChildren();
      for (let n = start; n <= end; n++) {
        const option = document.createElement('option');
        option.value = String(n); option.textContent = pad(n) + (en() ? '' : suffix); field.append(option);
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
        remindersEnabled = false; btn.textContent = tr('开启提醒','Enable reminder'); btn.setAttribute('aria-pressed', 'false');
        setReminderMessage('off'); return;
      }
      if (!('Notification' in window) || !window.isSecureContext) { setReminderMessage('unsupported'); return; }
      let permission; try { permission = await Notification.requestPermission(); } catch (_) { permission = 'denied'; }
      if (permission !== 'granted') { setReminderMessage('denied'); return; }
      remindersEnabled = true; notifiedFor = null; btn.textContent = tr('关闭提醒','Disable reminder'); btn.setAttribute('aria-pressed', 'true');
      setReminderMessage('on'); render();
    });
    $('reminder-minutes').addEventListener('change', () => { notifiedFor = null; render(); });

    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    tick();
  }
  init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
