(function () {
  'use strict';

  // ---------- Справочники ----------
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  const FLOOR_BANDS = [[2, 3], [4, 6], [7, 10], [11, 15], [16, 20], [21, 99]];
  const PRICE_BANDS = [[0, 1.0], [1.0, 1.2], [1.2, 1.4], [1.4, 1.6], [1.6, 99]];
  const AREA_BANDS = [[0, 60], [60, 80], [80, 100], [100, 130], [130, 9999]];

  const APT_DIMS = ['b', 'rooms', 'view', 'floor', 'price', 'area'];
  const DEAL_DIMS = ['week', 'month', 'mgr'];
  const DIM_TITLES = {
    b: 'Корпус', rooms: 'Комнат', view: 'Вид', floor: 'Этаж', price: 'Цена за м²',
    area: 'Площадь', week: 'Неделя', month: 'Месяц', mgr: 'Менеджер',
  };

  // ---------- Форматирование ----------
  const comma = (s) => String(s).replace('.', ',');
  const spaced = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function money(v, digits) {
    const abs = Math.abs(v);
    if (abs >= 1e9) return comma((v / 1e9).toFixed(digits === undefined ? (abs >= 1e10 ? 1 : 2) : digits)) + ' млрд';
    if (abs >= 1e6) return comma((v / 1e6).toFixed(digits === undefined ? 0 : digits)) + ' млн';
    if (abs >= 1e3) return spaced(v / 1e3) + ' тыс';
    return spaced(v);
  }
  const pct = (v, d) => comma((v * 100).toFixed(d || 0)) + '%';
  const dmy = (iso) => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '');
  const dm = (iso) => (iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) : '');
  const plural = (n, one, few, many) => {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  function bandOf(bands, value, unit, isFloor) {
    for (let i = 0; i < bands.length; i++) {
      const [from, to] = bands[i];
      const inside = isFloor ? value >= from && value <= to : value >= from && value < to;
      if (!inside) continue;
      let label;
      if (isFloor) label = to >= 99 ? `${from}+ этаж` : `${from}–${to} этаж`;
      else if (from === 0) label = `до ${comma(to)}${unit}`;
      else if (i === bands.length - 1) label = `${comma(from)}+${unit}`;
      else label = `${comma(from)}–${comma(to)}${unit}`;
      return {key: String(i), label, order: i};
    }
    return {key: 'na', label: 'н/д', order: 99};
  }

  function mondayOf(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    const shift = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - shift);
    return d.toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function weekLabel(monday) {
    const sunday = addDays(monday, 6);
    const m1 = Number(monday.slice(5, 7)) - 1, m2 = Number(sunday.slice(5, 7)) - 1;
    const d1 = Number(monday.slice(8, 10)), d2 = Number(sunday.slice(8, 10));
    return m1 === m2 ? `${d1}–${d2} ${MONTHS_GEN[m1]}` : `${d1} ${MONTHS_GEN[m1]} – ${d2} ${MONTHS_GEN[m2]}`;
  }

  // ---------- Данные ----------
  const VALUE_LABELS = {b: {}, rooms: {}, view: {}, floor: {}, price: {}, area: {}, week: {}, month: {}, mgr: {}};
  const ORDERS = {floor: {}, price: {}, area: {}};

  const flats = window.FLATS.map((r) => {
    const floor = bandOf(FLOOR_BANDS, r.fl, '', true);
    const price = bandOf(PRICE_BANDS, r.ppm / 1e6, ' млн');
    const area = bandOf(AREA_BANDS, r.area, ' м²');
    const sold = Boolean(r.deal);
    const week = sold ? mondayOf(r.deal) : null;
    const month = sold ? r.deal.slice(0, 7) : null;
    const d = {b: r.b, rooms: String(r.rooms), view: r.view, floor: floor.key, price: price.key, area: area.key, week, month, mgr: sold ? r.mgr : null};

    VALUE_LABELS.b[r.b] = r.b;
    VALUE_LABELS.rooms[d.rooms] = `${r.rooms}-комн.`;
    VALUE_LABELS.view[r.view] = r.view;
    VALUE_LABELS.floor[floor.key] = floor.label; ORDERS.floor[floor.key] = floor.order;
    VALUE_LABELS.price[price.key] = price.label; ORDERS.price[price.key] = price.order;
    VALUE_LABELS.area[area.key] = area.label; ORDERS.area[area.key] = area.order;
    if (sold) {
      VALUE_LABELS.week[week] = weekLabel(week);
      VALUE_LABELS.month[month] = MONTHS[Number(month.slice(5, 7)) - 1];
      VALUE_LABELS.mgr[r.mgr] = r.mgr;
    }
    return Object.assign({}, r, {sold, d});
  });

  const deals = flats.filter((f) => f.sold).sort((a, b) => (a.deal < b.deal ? -1 : 1));
  const LAST_DATE = deals[deals.length - 1].deal;
  const ALL_WEEKS = [];
  for (let w = mondayOf(deals[0].deal); w <= mondayOf(LAST_DATE); w = addDays(w, 7)) ALL_WEEKS.push(w);
  const ALL_MONTHS = Array.from(new Set(deals.map((f) => f.d.month))).sort();

  // Фасады: корпуса → этажи → квартиры по номеру
  const buildings = (function () {
    const map = {};
    flats.forEach((f) => {
      const b = (map[f.b] = map[f.b] || {name: f.b, floors: {}});
      (b.floors[f.fl] = b.floors[f.fl] || []).push(f);
    });
    let list = Object.values(map).map((b) => {
      let width = 0, maxFloor = 0;
      const floors = Object.keys(b.floors).map(Number).sort((x, y) => x - y).map((fl) => {
        const items = b.floors[fl].sort((x, y) => x.num - y.num);
        width = Math.max(width, items.reduce((s, f) => s + f.area, 0));
        maxFloor = Math.max(maxFloor, fl);
        return {floor: fl, flats: items};
      });
      return {name: b.name, floors, width, maxFloor};
    });
    const tallest = list.reduce((a, b) => (b.maxFloor > a.maxFloor ? b : a), list[0]);
    return [tallest].concat(list.filter((b) => b !== tallest).sort((a, b) => a.name.localeCompare(b.name, 'ru', {numeric: true})));
  })();
  const MIN_FLOOR = d3.min(flats, (f) => f.fl);
  const MAX_FLOOR = d3.max(flats, (f) => f.fl);

  // Оценки менеджеров считаем по всем данным, чтобы метки не прыгали от фильтров
  const MANAGERS = (function () {
    const totalDisc = d3.sum(deals, (f) => f.disc);
    const rows = d3.groups(deals, (f) => f.mgr).map(([name, list]) => ({
      name,
      n: list.length,
      revenue: d3.sum(list, (f) => f.sum),
      disc: d3.sum(list, (f) => f.disc),
      discPct: d3.sum(list, (f) => f.disc) / d3.sum(list, (f) => f.cost),
      discDeals: list.filter((f) => f.disc > 0).length / list.length,
      days: d3.mean(list, (f) => f.days),
      avgCheck: d3.mean(list, (f) => f.sum),
      last: d3.max(list, (f) => f.deal),
      discShare: d3.sum(list, (f) => f.disc) / totalDisc,
    })).sort((a, b) => b.revenue - a.revenue);

    const medianDisc = d3.median(rows, (r) => r.discPct);
    const fastest = rows.filter((r) => r.n >= 10).reduce((a, b) => (b.days < a.days ? b : a));
    rows.forEach((r) => {
      r.tags = [];
      if (r === fastest && r.discPct <= medianDisc) r.tags.push({good: true, text: 'быстрее всех, почти без скидок'});
      if (r.discShare >= 0.3) r.tags.push({good: false, text: `${pct(r.discShare)} всех скидок`});
      const lastGap = (new Date(LAST_DATE) - new Date(r.last)) / 864e5;
      if (lastGap > 21) r.tags.push({good: false, text: `нет сделок с ${dm(r.last)}`});
      if (r.days > 17) r.tags.push({good: false, text: `долгие сделки, ${comma(r.days.toFixed(1))} дн`});
    });
    return rows;
  })();

  // ---------- Перекрёстная фильтрация ----------
  const filters = {};
  [...APT_DIMS, ...DEAL_DIMS].forEach((k) => (filters[k] = null));

  function passApt(f, except) {
    for (const k of APT_DIMS) {
      if (k !== except && filters[k] !== null && f.d[k] !== filters[k]) return false;
    }
    return true;
  }
  function passDeal(f, except) {
    for (const k of DEAL_DIMS) {
      if (k !== except && filters[k] !== null && (!f.sold || f.d[k] !== filters[k])) return false;
    }
    return true;
  }
  const passAll = (f, except) => passApt(f, except) && passDeal(f, except);
  const dealFilterActive = () => DEAL_DIMS.some((k) => filters[k] !== null);

  function toggle(dim, value) {
    filters[dim] = filters[dim] === value ? null : value;
    renderAll();
  }

  // фильтры живут в адресе страницы: ссылкой можно поделиться конкретным срезом
  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    Object.keys(filters).forEach((k) => {
      const v = params.get(k);
      filters[k] = v !== null && VALUE_LABELS[k][v] !== undefined ? v : null;
    });
  }
  function writeHash() {
    const params = new URLSearchParams();
    Object.keys(filters).forEach((k) => { if (filters[k] !== null) params.set(k, filters[k]); });
    const hash = params.toString();
    try { history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search); } catch (e) { /* file:// */ }
  }

  // ---------- Цвет ----------
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let C = {};
  function readColors() {
    C = {
      text: cssVar('--text-primary'), secondary: cssVar('--text-secondary'), muted: cssVar('--text-muted'),
      surface: cssVar('--surface-1'), surface2: cssVar('--surface-2'), hairline: cssVar('--hairline'),
      accent: cssVar('--accent'), discount: cssVar('--discount'), empty: cssVar('--empty-stroke'),
      select: cssVar('--select'), good: cssVar('--good'), critical: cssVar('--critical'),
      onFast: cssVar('--on-fast'), onSlow: cssVar('--on-slow'),
      speed: [1, 2, 3, 4, 5].map((i) => cssVar('--speed-' + i)),
    };
    C.speedFn = d3.piecewise(d3.interpolateRgb, C.speed);
  }
  const speedT = (days) => Math.max(0, Math.min(1, (days - 3) / 27));
  const speedColor = (days) => C.speedFn(speedT(days));

  // ---------- Тултип ----------
  const tip = document.getElementById('tooltip');
  function showTip(html, event) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = event.clientX + pad, y = event.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function withTip(sel, htmlFn) {
    sel.on('mousemove', (e, d) => showTip(htmlFn(d), e)).on('mouseleave', hideTip);
  }

  function flatTip(f) {
    const head = `<div class="t-title">${esc(f.id)}</div><div class="t-muted">корпус ${esc(f.b)}, ${f.fl} этаж, вид: ${esc(f.view)}</div>`;
    const body = `${f.rooms}-комн., ${comma(f.area)} м², ${spaced(f.ppm)} ₽/м²<br>прайс ${money(f.cost, 1)} ₽`;
    const deal = f.sold
      ? `<br><b>Продана ${dmy(f.deal)}</b> за ${f.days} ${plural(f.days, 'день', 'дня', 'дней')}<br>сумма ${money(f.sum, 1)} ₽` +
        (f.disc > 0 ? `, скидка ${money(f.disc, 2)} ₽` : ', без скидки') + `<br>менеджер: ${esc(f.mgr)}`
      : '<br><b>Не продана</b>';
    return head + body + deal;
  }

  // ---------- Фильтры-чипы ----------
  function renderFilters() {
    const el = document.getElementById('filters');
    const active = Object.keys(filters).filter((k) => filters[k] !== null);
    if (!active.length) {
      el.innerHTML = '<span class="hint">Фильтров нет. Нажмите на корпус, клетку, строку рейтинга, неделю, месяц или менеджера.</span>';
      return;
    }
    el.innerHTML = active.map((k) =>
      `<button class="chip" data-dim="${k}" type="button"><span>${DIM_TITLES[k]}:</span> <b>${esc(VALUE_LABELS[k][filters[k]] || filters[k])}</b> <i aria-hidden="true">×</i></button>`,
    ).join('') + '<button class="reset" id="resetAll" type="button">Сбросить всё</button>';
    el.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { filters[b.dataset.dim] = null; renderAll(); }));
    document.getElementById('resetAll').addEventListener('click', () => { Object.keys(filters).forEach((k) => (filters[k] = null)); renderAll(); });
  }

  // ---------- KPI ----------
  function renderKPIs() {
    const stock = flats.filter((f) => passApt(f));
    const sold = stock.filter((f) => f.sold && passDeal(f));
    const revenue = d3.sum(sold, (f) => f.sum);
    const disc = d3.sum(sold, (f) => f.disc);
    const listPrice = d3.sum(sold, (f) => f.cost);
    const unsold = stock.filter((f) => !f.sold);
    const days = d3.mean(sold, (f) => f.days);
    const items = [
      dealFilterActive()
        ? {label: 'Сделок под фильтром', value: String(sold.length), note: `${pct(sold.length / Math.max(1, stock.filter((f) => f.sold).length))} всех сделок`}
        : {label: 'Продано', value: stock.length ? pct(sold.length / stock.length) : '—', note: `${sold.length} из ${stock.length} квартир`},
      {label: 'Выручка', value: money(revenue) + ' ₽', note: sold.length ? `средний чек ${money(revenue / sold.length)} ₽` : 'нет сделок'},
      {label: 'Потеряно на скидках', value: money(disc) + ' ₽', note: listPrice ? `${pct(disc / listPrice, 1)} от прайса проданных` : '—'},
      {label: 'Ещё в продаже', value: dealFilterActive() ? '—' : `${unsold.length} ${plural(unsold.length, 'квартира', 'квартиры', 'квартир')}`,
        note: dealFilterActive() ? 'не зависит от сделок' : `на ${money(d3.sum(unsold, (f) => f.cost))} ₽ по прайсу`},
      {label: 'Срок сделки', value: days ? `${comma(days.toFixed(1))} дн` : '—', note: 'от обращения до сделки'},
    ];
    document.getElementById('kpis').innerHTML = items.map((k) =>
      `<div class="kpi"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="note">${k.note}</div></div>`,
    ).join('');
  }

  // ---------- Основной график: фасады + рейтинг характеристик ----------
  function groupStats(dim, sortByShare) {
    const pool = flats.filter((f) => passApt(f, dim));
    const rows = d3.groups(pool, (f) => f.d[dim]).map(([value, list]) => {
      const sold = list.filter((f) => f.sold);
      return {
        dim, value, label: VALUE_LABELS[dim][value], order: ORDERS[dim] ? ORDERS[dim][value] : Number(value),
        total: list.length, sold: sold.length, share: sold.length / list.length,
        days: sold.length ? d3.mean(sold, (f) => f.days) : null,
      };
    });
    rows.sort(sortByShare ? (a, b) => b.share - a.share || b.total - a.total : (a, b) => a.order - b.order);
    const ranked = rows.filter((r) => r.total >= 5).sort((a, b) => b.share - a.share || (a.days || 99) - (b.days || 99));
    if (ranked.length > 1) { ranked[0].best = true; ranked[ranked.length - 1].worst = true; }
    return rows;
  }

  function renderMain() {
    const host = document.getElementById('main');
    host.innerHTML = '';
    const W = Math.max(820, host.clientWidth);
    let H = Math.max(600, Math.min(760, W * 0.62));
    // на широком экране тянем шахматку на высоту правой колонки
    const card = host.closest('.card');
    const side = document.querySelector('.side');
    if (window.innerWidth > 1180 && card && side) {
      const chrome = card.offsetHeight - host.offsetHeight;
      H = Math.max(600, Math.min(1100, side.offsetHeight - chrome));
    }
    const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);

    const m = {top: 6, right: 4, bottom: 26, left: 24};
    const plotW = W - m.left - m.right;
    const plotH = H - m.top - m.bottom;
    const rowH = plotH / (MAX_FLOOR - MIN_FLOOR + 1);
    const GAP = 14;
    const kx = (plotW - GAP * (buildings.length - 1)) / d3.sum(buildings, (b) => b.width);
    const yOf = (fl) => m.top + (MAX_FLOOR - fl) * rowH;

    let x = m.left;
    buildings.forEach((b) => { b.x0 = x; b.w = b.width * kx; x += b.w + GAP; });

    // ось этажей
    const step = rowH < 16 ? 2 : 1;
    for (let fl = MIN_FLOOR; fl <= MAX_FLOOR; fl++) {
      if (fl !== MIN_FLOOR && fl % step) continue;
      svg.append('text').attr('class', 'svg-muted').attr('x', m.left - 6).attr('y', yOf(fl) + rowH / 2)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('font-size', 10).text(fl);
    }

    const anyFilter = Object.values(filters).some((v) => v !== null);
    const cells = svg.append('g');
    buildings.forEach((b) => {
      b.floors.forEach((row) => {
        const floorW = d3.sum(row.flats, (f) => f.area * kx);
        let cx = b.x0 + (b.w - floorW) / 2;
        const y = yOf(row.floor);
        row.flats.forEach((f) => {
          const w = f.area * kx;
          const on = !anyFilter || passAll(f);
          const g = cells.append('g').datum(f).attr('class', 'hit').attr('opacity', on ? 1 : 0.13);
          g.append('rect')
            .attr('x', cx + 1).attr('y', y + 1).attr('width', Math.max(1, w - 2)).attr('height', Math.max(1, rowH - 2)).attr('rx', 2)
            .attr('fill', f.sold ? speedColor(f.days) : C.surface)
            .attr('stroke', f.sold ? 'none' : C.empty).attr('stroke-width', f.sold ? 0 : 1);
          if (f.sold && f.disc > 0) {
            const s = Math.min(7, rowH * 0.45, w * 0.4);
            g.append('path').attr('d', `M${cx + w - 1 - s},${y + 1} L${cx + w - 1},${y + 1} L${cx + w - 1},${y + 1 + s} Z`).attr('fill', C.discount);
          }
          if (w >= 12 && rowH >= 11) {
            g.append('text').attr('x', cx + w / 2).attr('y', y + rowH / 2 + 0.5)
              .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
              .attr('font-size', Math.min(11, rowH * 0.6)).attr('font-weight', 600)
              .attr('fill', f.sold ? (speedT(f.days) < 0.5 ? C.onFast : C.onSlow) : C.muted)
              .text(f.rooms);
          }
          cx += w;
        });
      });

      const pool = flats.filter((f) => f.b === b.name && passApt(f, 'b'));
      const share = pool.length ? pool.filter((f) => f.sold).length / pool.length : 0;
      const selected = filters.b === b.name;
      const label = svg.append('text').attr('class', 'svg-text hit')
        .attr('x', b.x0 + b.w / 2).attr('y', H - 8).attr('text-anchor', 'middle')
        .attr('font-size', 12).attr('font-weight', selected ? 700 : 500)
        .text(b.w > 50 ? `${b.name} · ${pct(share)}` : b.name)
        .on('click', () => toggle('b', b.name));
      withTip(label, () => `<div class="t-title">Корпус ${esc(b.name)}</div>продано ${pool.filter((f) => f.sold).length} из ${pool.length} (${pct(share)})<br><span class="t-muted">клик фильтрует по корпусу</span>`);
    });

    withTip(cells.selectAll('g'), flatTip);
    cells.selectAll('g').on('click', (e, f) => toggle('b', f.b));

    // рейтинг характеристик в пустом месте над низкими корпусами
    const others = buildings.slice(1);
    const px0 = others[0].x0;
    const pw = W - m.right - px0;
    const ph = yOf(d3.max(others, (b) => b.maxFloor)) - m.top - 18;
    if (ph < 140) return;

    const panel = svg.append('g');
    panel.append('text').attr('class', 'svg-text').attr('x', px0).attr('y', m.top + 12)
      .attr('font-size', 14).attr('font-weight', 600).text('Какие квартиры продаются лучше и хуже');
    panel.append('text').attr('class', 'svg-secondary').attr('x', px0).attr('y', m.top + 30).attr('font-size', 12)
      .text('Длина полосы = доля проданных, цвет = средний срок сделки. ▲ лучшее и ▼ худшее в группе.');

    const columns = [
      [{dim: 'view', title: 'Вид из окон', share: true}],
      [{dim: 'rooms', title: 'Комнатность'}, {dim: 'floor', title: 'Этаж'}],
      [{dim: 'price', title: 'Цена за м²'}, {dim: 'area', title: 'Площадь'}],
    ].map((col) => col.map((g) => Object.assign(g, {rows: groupStats(g.dim, g.share)})));

    const top = m.top + 44;
    const colGap = 22;
    const colShares = [0.42, 0.29, 0.29];
    const colWs = colShares.map((k) => (pw - colGap * 2) * k);
    const colX = [px0, px0 + colWs[0] + colGap, px0 + colWs[0] + colWs[1] + colGap * 2];
    const units = columns.map((col) => d3.sum(col, (g) => g.rows.length + 1.5));
    const unit = Math.min(26, (ph - 44) / d3.max(units));
    const fs = Math.max(10, Math.min(12.5, unit * 0.55));

    columns.forEach((col, ci) => {
      const cx0 = colX[ci];
      const colW = colWs[ci];
      const maxChars = d3.max(col, (g) => d3.max(g.rows, (r) => r.label.length));
      const labelW = Math.min(colW * 0.56, maxChars * fs * 0.56 + 10);
      const barMax = Math.max(24, colW - labelW - 52);
      let cy = top;
      col.forEach((g) => {
        panel.append('text').attr('class', 'svg-text').attr('x', cx0).attr('y', cy + unit * 0.6)
          .attr('dominant-baseline', 'middle').attr('font-size', fs + 1).attr('font-weight', 600).text(g.title);
        cy += unit;
        g.rows.forEach((r) => {
          const selected = filters[g.dim] === r.value;
          const row = panel.append('g').datum(r).attr('class', 'hit').attr('transform', `translate(${cx0},${cy})`);
          row.append('rect').attr('x', -4).attr('y', 0).attr('width', colW + 4).attr('height', unit).attr('rx', 4)
            .attr('fill', selected ? C.select : 'transparent');
          row.append('text').attr('class', 'svg-text').attr('x', 0).attr('y', unit / 2).attr('dominant-baseline', 'middle')
            .attr('font-size', fs).attr('font-weight', selected ? 600 : 400).text(r.label);
          const barH = Math.max(5, unit * 0.5);
          const by = (unit - barH) / 2;
          row.append('rect').attr('x', labelW).attr('y', by).attr('width', barMax).attr('height', barH).attr('rx', 2).attr('fill', C.surface2);
          if (r.sold) {
            row.append('rect').attr('x', labelW).attr('y', by).attr('width', Math.max(2, barMax * r.share)).attr('height', barH).attr('rx', 2)
              .attr('fill', speedColor(r.days));
          }
          const vx = labelW + barMax + 6;
          const valueText = row.append('text').attr('x', vx).attr('y', unit / 2).attr('dominant-baseline', 'middle').attr('font-size', fs);
          valueText.append('tspan').attr('class', 'svg-text').attr('font-weight', 600).text(pct(r.share));
          if (r.best) valueText.append('tspan').attr('fill', C.good).attr('font-weight', 700).text(' ▲');
          if (r.worst) valueText.append('tspan').attr('fill', C.critical).attr('font-weight', 700).text(' ▼');
          cy += unit;
        });
        cy += unit * 0.5;
      });
    });

    const rows = panel.selectAll('g.hit');
    rows.on('click', (e, r) => toggle(r.dim, r.value));
    withTip(rows, (r) => `<div class="t-title">${DIM_TITLES[r.dim]}: ${esc(r.label)}</div>продано ${r.sold} из ${r.total} (${pct(r.share)})` +
      (r.days !== null ? `<br>средний срок сделки ${comma(r.days.toFixed(1))} дн` : '') + '<br><span class="t-muted">клик подсвечивает эти квартиры</span>');
  }

  function renderMainLegend() {
    const ramp = C.speed.map((c) => `<span class="sw" style="background:${c}"></span>`).join('');
    document.getElementById('mainLegend').innerHTML =
      `<span class="item">Сделка закрыта за 3 дня <span class="ramp">${ramp}</span> 30 дней и дольше</span>` +
      '<span class="item"><span class="sw empty"></span> квартира ещё в продаже</span>' +
      '<span class="item"><span class="sw disc"></span> сделка со скидкой</span>' +
      '<span class="item">ширина клетки — площадь, цифра — число комнат</span>';
  }

  // ---------- Сделки по неделям ----------
  function renderWeeks() {
    const host = document.getElementById('weeks');
    host.innerHTML = '';
    const W = host.clientWidth || 430;
    const H = 236;
    const m = {top: 18, right: 6, bottom: 44, left: 6};
    const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);

    const pool = deals.filter((f) => passAll(f, 'week'));
    const byWeek = d3.group(pool, (f) => f.d.week);
    const allByWeek = d3.group(deals, (f) => f.d.week);
    const maxCount = d3.max(ALL_WEEKS, (w) => (allByWeek.get(w) || []).length);

    const xb = d3.scaleBand().domain(ALL_WEEKS).range([m.left, W - m.right]).paddingInner(0.12);
    const plotH = H - m.top - m.bottom;
    const s = Math.max(3, Math.min(xb.bandwidth(), plotH / maxCount - 1.2));
    const gap = 1.2;
    const baseY = m.top + plotH;

    // средний темп по выбранным сделкам
    let avgLine = null;
    const avg = pool.length / ALL_WEEKS.length;
    if (avg > 0) {
      const ay = baseY - avg * (s + gap);
      avgLine = {ay, text: `линия: в среднем ${comma(avg.toFixed(1))} сделки в неделю`};
    }
    svg.append('line').attr('x1', m.left).attr('x2', W - m.right).attr('y1', baseY + 1).attr('y2', baseY + 1).attr('stroke', C.hairline);

    ALL_WEEKS.forEach((w) => {
      const x0 = xb(w) + (xb.bandwidth() - s) / 2;
      const all = allByWeek.get(w) || [];
      const sel = byWeek.get(w) || [];
      const dim = filters.week !== null && filters.week !== w;
      const col = svg.append('g').attr('opacity', dim ? 0.3 : 1);
      // контур: все сделки недели, заливка: сделки под текущими фильтрами
      all.forEach((f, i) => {
        col.append('rect').attr('x', x0).attr('y', baseY - (i + 1) * (s + gap)).attr('width', s).attr('height', s).attr('rx', 1)
          .attr('fill', 'none').attr('stroke', C.empty).attr('stroke-width', 0.8);
      });
      sel.forEach((f, i) => {
        const y = baseY - (i + 1) * (s + gap);
        col.append('rect').attr('x', x0).attr('y', y).attr('width', s).attr('height', s).attr('rx', 1).attr('fill', C.accent);
        if (f.disc > 0 && s >= 6) {
          const t = Math.max(3, s * 0.45);
          col.append('path').attr('d', `M${x0 + s - t},${y} L${x0 + s},${y} L${x0 + s},${y + t} Z`).attr('fill', C.discount);
        }
      });
      const hit = svg.append('rect').datum(w).attr('class', 'hit').attr('x', xb(w) - 1).attr('y', m.top - 10)
        .attr('width', xb.bandwidth() + 2).attr('height', plotH + 12).attr('fill', 'transparent');
      hit.on('click', () => toggle('week', w));
      withTip(hit, () => {
        const rev = d3.sum(sel, (f) => f.sum);
        return `<div class="t-title">${weekLabel(w)}</div>${sel.length} ${plural(sel.length, 'сделка', 'сделки', 'сделок')}` +
          (sel.length ? `, ${money(rev)} ₽<br>средний чек ${money(rev / sel.length)} ₽` : '') +
          (sel.length !== all.length ? `<br><span class="t-muted">всего за неделю: ${all.length}</span>` : '') +
          (w === mondayOf(LAST_DATE) ? '<br><span class="t-muted">неделя неполная</span>' : '');
      });
    });

    // линия среднего темпа поверх квадратов, подпись в шапке графика
    if (avgLine) {
      svg.append('line').attr('x1', m.left).attr('x2', W - m.right).attr('y1', avgLine.ay).attr('y2', avgLine.ay)
        .attr('stroke', C.text).attr('stroke-opacity', 0.55).attr('stroke-width', 1).attr('pointer-events', 'none');
      svg.append('text').attr('class', 'svg-secondary').attr('x', W - m.right).attr('y', 10).attr('text-anchor', 'end').attr('font-size', 11)
        .text(avgLine.text);
    }

    // месяцы и средний чек под осью
    ALL_MONTHS.forEach((mo) => {
      const first = ALL_WEEKS.find((w) => addDays(w, 6).slice(0, 7) === mo) || ALL_WEEKS[0];
      const mx = xb(first);
      const list = pool.filter((f) => f.d.month === mo);
      svg.append('text').attr('class', 'svg-text').attr('x', mx).attr('y', baseY + 16).attr('font-size', 11).text(MONTHS_SHORT[Number(mo.slice(5, 7)) - 1]);
      svg.append('text').attr('class', 'svg-secondary').attr('x', mx).attr('y', baseY + 31).attr('font-size', 11)
        .text(list.length ? money(d3.mean(list, (f) => f.sum)) : '—');
    });
  }

  // ---------- Деньги по месяцам ----------
  function renderMoney() {
    const host = document.getElementById('money');
    host.innerHTML = '';
    const W = host.clientWidth || 430;
    const rowH = 26;
    const headH = 34;
    const H = headH + rowH * ALL_MONTHS.length + 4;
    const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);

    const pool = deals.filter((f) => passAll(f, 'month'));
    const stats = ALL_MONTHS.map((mo) => {
      const list = pool.filter((f) => f.d.month === mo);
      const all = deals.filter((f) => f.d.month === mo);
      return {
        month: mo, rev: d3.sum(list, (f) => f.sum), disc: d3.sum(list, (f) => f.disc), cost: d3.sum(list, (f) => f.cost), n: list.length,
        revAll: d3.sum(all, (f) => f.sum), discAll: d3.sum(all, (f) => f.disc),
      };
    });

    const labelW = 70;
    const colGap = 18;
    const colW = (W - labelW - colGap) / 2;
    const valueW = 62;
    const revX = d3.scaleLinear().domain([0, d3.max(stats, (s) => s.revAll)]).range([0, colW - valueW]);
    const discX = d3.scaleLinear().domain([0, d3.max(stats, (s) => s.discAll)]).range([0, colW - valueW]);
    const totRev = d3.sum(stats, (s) => s.rev), totDisc = d3.sum(stats, (s) => s.disc), totCost = d3.sum(stats, (s) => s.cost);

    const head = (x, title, value) => {
      svg.append('text').attr('class', 'svg-secondary').attr('x', x).attr('y', 12).attr('font-size', 12).text(title);
      svg.append('text').attr('class', 'svg-text').attr('x', x).attr('y', 28).attr('font-size', 13).attr('font-weight', 600).text(value);
    };
    head(labelW, 'Выручка, ₽', money(totRev));
    head(labelW + colW + colGap, 'Скидки, ₽', `${money(totDisc)} · ${totCost ? pct(totDisc / totCost, 1) : '—'} прайса`);

    stats.forEach((s, i) => {
      const y = headH + i * rowH;
      const selected = filters.month === s.month;
      const dim = filters.month !== null && !selected;
      const g = svg.append('g').datum(s).attr('class', 'hit').attr('opacity', dim ? 0.35 : 1);
      g.append('rect').attr('x', 0).attr('y', y).attr('width', W).attr('height', rowH).attr('rx', 4).attr('fill', selected ? C.select : 'transparent');
      g.append('text').attr('class', 'svg-text').attr('x', 4).attr('y', y + rowH / 2).attr('dominant-baseline', 'middle')
        .attr('font-size', 12).attr('font-weight', selected ? 600 : 400).text(MONTHS[Number(s.month.slice(5, 7)) - 1]);
      const bh = 12, by = y + (rowH - bh) / 2;
      [[labelW, revX, s.revAll, s.rev, C.accent, money(s.rev)], [labelW + colW + colGap, discX, s.discAll, s.disc, C.discount, money(s.disc)]]
        .forEach(([x0, sc, all, val, color, text]) => {
          g.append('rect').attr('x', x0).attr('y', by).attr('width', Math.max(1, sc(all))).attr('height', bh).attr('rx', 2).attr('fill', C.surface2);
          if (val > 0) g.append('rect').attr('x', x0).attr('y', by).attr('width', Math.max(2, sc(val))).attr('height', bh).attr('rx', 2).attr('fill', color);
          g.append('text').attr('class', 'svg-secondary').attr('x', x0 + Math.max(sc(all), sc(val)) + 5).attr('y', y + rowH / 2)
            .attr('dominant-baseline', 'middle').attr('font-size', 11).text(text);
        });
    });

    const rows = svg.selectAll('g.hit');
    rows.on('click', (e, s) => toggle('month', s.month));
    withTip(rows, (s) => `<div class="t-title">${MONTHS[Number(s.month.slice(5, 7)) - 1]} 2026</div>` +
      `${s.n} ${plural(s.n, 'сделка', 'сделки', 'сделок')}, выручка ${money(s.rev, 2)} ₽` +
      (s.n ? `<br>средний чек ${money(s.rev / s.n)} ₽<br>скидки ${money(s.disc, 1)} ₽ (${pct(s.cost ? s.disc / s.cost : 0, 1)} прайса)` : ''));
  }

  // ---------- Менеджеры ----------
  function renderManagers() {
    const host = document.getElementById('managers');
    host.innerHTML = '';
    const W = host.clientWidth || 430;
    const sq = 6, sgap = 1.5;
    const perRow = Math.floor((W - 4) / (sq + sgap));
    const pool = deals.filter((f) => passAll(f, 'mgr'));

    const layout = MANAGERS.map((mg) => {
      const all = deals.filter((f) => f.mgr === mg.name);
      const sel = pool.filter((f) => f.mgr === mg.name);
      const lines = Math.max(1, Math.ceil(all.length / perRow));
      return {mg, all, sel, h: 20 + (mg.tags.length ? 16 : 0) + lines * (sq + sgap) + 12};
    });
    const H = d3.sum(layout, (l) => l.h);
    const svg = d3.select(host).append('svg').attr('width', W).attr('height', H);

    let y = 0;
    layout.forEach(({mg, all, sel, h}) => {
      const selected = filters.mgr === mg.name;
      const dim = filters.mgr !== null && !selected;
      const g = svg.append('g').datum(mg).attr('class', 'hit').attr('transform', `translate(0,${y})`).attr('opacity', dim ? 0.35 : 1);
      g.append('rect').attr('x', -4).attr('y', 0).attr('width', W + 4).attr('height', h - 4).attr('rx', 4).attr('fill', selected ? C.select : 'transparent');

      const revenue = d3.sum(sel, (f) => f.sum);
      const discSum = d3.sum(sel, (f) => f.disc), costSum = d3.sum(sel, (f) => f.cost);
      const days = d3.mean(sel, (f) => f.days);
      g.append('text').attr('class', 'svg-text').attr('x', 0).attr('y', 13).attr('font-size', 13).attr('font-weight', 600).text(mg.name);
      g.append('text').attr('class', 'svg-secondary').attr('x', W).attr('y', 13).attr('text-anchor', 'end').attr('font-size', 11.5)
        .text(sel.length
          ? `${sel.length} сд. · ${money(revenue)} · ${comma(days.toFixed(1))} дн · скидка ${pct(costSum ? discSum / costSum : 0, 1)}`
          : 'нет сделок под фильтрами');

      let ty = 20;
      if (mg.tags.length) {
        const t = g.append('text').attr('x', 0).attr('y', ty + 10).attr('font-size', 11.5);
        mg.tags.forEach((tag, i) => {
          if (i) t.append('tspan').attr('class', 'svg-muted').text('   ');
          t.append('tspan').attr('fill', tag.good ? C.good : C.critical).attr('font-weight', 700).text(tag.good ? '▲ ' : '▼ ');
          t.append('tspan').attr('class', 'svg-secondary').text(tag.text);
        });
        ty += 16;
      }

      const selIds = new Set(sel.map((f) => f.id));
      all.forEach((f, i) => {
        const cx = (i % perRow) * (sq + sgap);
        const cy = ty + 4 + Math.floor(i / perRow) * (sq + sgap);
        if (selIds.has(f.id)) {
          g.append('rect').attr('x', cx).attr('y', cy).attr('width', sq).attr('height', sq).attr('rx', 1).attr('fill', C.accent);
          if (f.disc > 0) g.append('path').attr('d', `M${cx + sq - 3.5},${cy} L${cx + sq},${cy} L${cx + sq},${cy + 3.5} Z`).attr('fill', C.discount);
        } else {
          g.append('rect').attr('x', cx + 0.4).attr('y', cy + 0.4).attr('width', sq - 0.8).attr('height', sq - 0.8).attr('rx', 1)
            .attr('fill', 'none').attr('stroke', C.empty).attr('stroke-width', 0.8);
        }
      });
      y += h;
    });

    const rows = svg.selectAll('g.hit');
    rows.on('click', (e, mg) => toggle('mgr', mg.name));
    withTip(rows, (mg) => `<div class="t-title">${esc(mg.name)}</div>` +
      `${mg.n} сделок, выручка ${money(mg.revenue, 2)} ₽<br>средний чек ${money(mg.avgCheck)} ₽, срок ${comma(mg.days.toFixed(1))} дн<br>` +
      `скидки ${money(mg.disc)} ₽ (${pct(mg.discPct, 1)} прайса), со скидкой ${pct(mg.discDeals)} сделок<br>` +
      `последняя сделка ${dmy(mg.last)}<br><span class="t-muted">за весь период; клик фильтрует дашборд</span>`);
  }

  // ---------- Таблицы ----------
  function renderTables() {
    const mgr = `<table><caption>Менеджеры</caption><thead><tr><th>Менеджер</th><th>Сделок</th><th>Выручка, ₽</th><th>Срок, дн</th><th>Скидки, % прайса</th></tr></thead><tbody>` +
      MANAGERS.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.n}</td><td>${money(r.revenue, 2)}</td><td>${comma(r.days.toFixed(1))}</td><td>${pct(r.discPct, 1)}</td></tr>`).join('') +
      '</tbody></table>';
    const group = (dim, title, byShare) => {
      const saved = Object.assign({}, filters);
      Object.keys(filters).forEach((k) => (filters[k] = null));
      const rows = groupStats(dim, byShare);
      Object.assign(filters, saved);
      return `<table><caption>${title}</caption><thead><tr><th>${DIM_TITLES[dim]}</th><th>Квартир</th><th>Продано</th><th>Доля</th><th>Срок, дн</th></tr></thead><tbody>` +
        rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.total}</td><td>${r.sold}</td><td>${pct(r.share)}</td><td>${r.days ? comma(r.days.toFixed(1)) : '—'}</td></tr>`).join('') +
        '</tbody></table>';
    };
    document.getElementById('tables').innerHTML = `<div class="tables">${mgr}${group('b', 'Корпуса')}${group('rooms', 'Комнатность')}${group('view', 'Вид из окон', true)}</div>`;
  }

  // ---------- Сборка ----------
  function renderAll() {
    hideTip();
    writeHash();
    readColors();
    renderFilters();
    renderKPIs();
    renderMainLegend();
    renderWeeks();
    renderMoney();
    renderManagers();
    renderMain();
  }

  // тема
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('zhk-theme');
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  } catch (e) { /* хранилище недоступно */ }
  document.getElementById('themeToggle').addEventListener('click', () => {
    const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('zhk-theme', root.dataset.theme); } catch (e) { /* ничего */ }
    renderAll();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!root.dataset.theme) renderAll(); });

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderAll, 120); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { Object.keys(filters).forEach((k) => (filters[k] = null)); renderAll(); }
  });

  window.addEventListener('hashchange', () => { readHash(); renderAll(); });

  readHash();
  renderTables();
  renderAll();

  // служебный режим для скриншотов: ?rects выводит координаты карточек
  if (new URLSearchParams(location.search).has('rects')) {
    const out = {};
    document.querySelectorAll('.kpis, .card, .head').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      out[(el.id || el.querySelector('.chart') && el.querySelector('.chart').id || el.className.split(' ')[0]) + '_' + i] =
        [Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)];
    });
    const pre = document.createElement('pre');
    pre.id = 'rects';
    pre.textContent = JSON.stringify(out);
    pre.hidden = true;
    document.body.appendChild(pre);
  }
})();
