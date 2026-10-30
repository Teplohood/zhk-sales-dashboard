const Dataset = require('libs/dataset/v2');

// Одна строка датасета = одна квартира ЖК (и проданная, и непроданная)
const rows = Dataset.getDatasetRows({datasetName: 'flats'});

// ---------- Справочники и форматирование ----------

const FLOOR_BANDS = [[2, 3], [4, 6], [7, 10], [11, 15], [16, 20], [21, 999]];
const PRICE_BANDS = [[0, 1.0], [1.0, 1.2], [1.2, 1.4], [1.4, 1.6], [1.6, 99]]; // млн ₽ за м²
const AREA_BANDS = [[0, 60], [60, 80], [80, 100], [100, 130], [130, 9999]]; // м²

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function spaced(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function mln(value, digits) {
    return (value / 1e6).toFixed(digits).replace('.', ',');
}

function formatDate(value) {
    const s = String(value).slice(0, 10);
    const [y, m, d] = s.split('-');
    return d && m && y ? `${d}.${m}.${y}` : s;
}

function bandLabel(band, unit, last) {
    const [from, to] = band;
    const f = (v) => String(v).replace('.', ',');
    if (from === 0) {
        return `до ${f(to)}${unit}`;
    }
    if (last) {
        return `${f(from)}+${unit}`;
    }
    return `${f(from)}–${f(to)}${unit}`;
}

function findBand(bands, value, unit) {
    for (let i = 0; i < bands.length; i++) {
        const [from, to] = bands[i];
        if (value >= from && value < to) {
            return {key: String(i), label: bandLabel(bands[i], unit, i === bands.length - 1), order: i};
        }
    }
    return {key: 'na', label: 'н/д', order: 99};
}

function floorBand(floor) {
    for (let i = 0; i < FLOOR_BANDS.length; i++) {
        const [from, to] = FLOOR_BANDS[i];
        if (floor >= from && floor <= to) {
            const label = to >= 999 ? `${from}+ этаж` : `${from}–${to} этаж`;
            return {key: String(i), label, order: i};
        }
    }
    return {key: 'na', label: 'н/д', order: 99};
}

// ---------- 1. Квартиры (визуальный атом) ----------

const flats = rows.map((row) => {
    const id = String(row['Квартира']);
    const dealDate = row['Дата сделки'];
    const sold = dealDate !== null && dealDate !== undefined && String(dealDate) !== '';
    const area = num(row['Площадь, м²']);
    const pricePerM2 = num(row['Цена за м², руб.']);
    const cost = num(row['Стоимость, руб.']);
    const discount = num(row['Скидка, руб.']);
    const rooms = num(row['Комнат']);
    const floor = num(row['Этаж']);
    const view = row['Вид'] || 'н/д';

    const price = findBand(PRICE_BANDS, pricePerM2 / 1e6, ' млн');
    const areaBand = findBand(AREA_BANDS, area, ' м²');
    const floorB = floorBand(floor);

    return {
        id,
        num: num(id.split('-').pop()),
        building: String(row['Корпус']),
        floor,
        rooms,
        area,
        sold,
        days: sold ? num(row['Дней в работе']) : null,
        discount: sold ? discount : 0,
        // значения измерений для подсветки по клику
        dims: {
            view,
            rooms: String(rooms),
            floor: floorB.key,
            price: price.key,
            area: areaBand.key,
        },
        tip:
            `<b>${id}</b> · корпус ${row['Корпус']}, ${floor} этаж<br/>` +
            `${rooms}-комн., ${String(area).replace('.', ',')} м², вид: ${view}<br/>` +
            `${spaced(pricePerM2)} ₽/м², стоимость ${mln(cost, 1)} млн ₽<br/>` +
            (sold
                ? `<b>Продана</b> ${formatDate(dealDate)} за ${num(row['Дней в работе'])} дн.` +
                  (discount > 0 ? `, скидка ${mln(discount, 2)} млн ₽` : ', без скидки') +
                  `<br/>Сумма сделки ${mln(num(row['Сумма сделки, руб.']), 1)} млн ₽ · ${row['Менеджер'] || ''}`
                : '<b>Не продана</b>'),
        _labels: {view, rooms: `${rooms}-комн.`, floor: floorB.label, price: price.label, area: areaBand.label},
        _orders: {view: 0, rooms, floor: floorB.order, price: price.order, area: areaBand.order},
    };
});

// ---------- 2. Каркас: корпуса → этажи → квартиры по номеру ----------

const buildingMap = {};
flats.forEach((f) => {
    const b = (buildingMap[f.building] = buildingMap[f.building] || {name: f.building, floors: {}, total: 0, sold: 0});
    (b.floors[f.floor] = b.floors[f.floor] || []).push(f);
    b.total += 1;
    b.sold += f.sold ? 1 : 0;
});

let buildings = Object.values(buildingMap).map((b) => {
    let width = 0;
    let maxFloor = 0;
    Object.keys(b.floors).forEach((floor) => {
        b.floors[floor].sort((a, c) => a.num - c.num);
        width = Math.max(width, b.floors[floor].reduce((s, f) => s + f.area, 0));
        maxFloor = Math.max(maxFloor, Number(floor));
    });
    return {...b, width, maxFloor, share: b.total ? b.sold / b.total : 0};
});

// Самый высокий корпус слева, остальные по номеру: над низкими корпусами остаётся место под рейтинг
const tallest = buildings.reduce((a, b) => (b.maxFloor > a.maxFloor ? b : a), buildings[0]);
buildings = [tallest].concat(
    buildings.filter((b) => b !== tallest).sort((a, b) => a.name.localeCompare(b.name, 'ru', {numeric: true})),
);

// ---------- 3. Рейтинги характеристик ----------

function buildGroup(dim, title, sortByShare) {
    const map = {};
    flats.forEach((f) => {
        const key = f.dims[dim];
        const g = (map[key] = map[key] || {
            value: key,
            label: f._labels[dim],
            order: f._orders[dim],
            total: 0,
            sold: 0,
            daysSum: 0,
            discSum: 0,
        });
        g.total += 1;
        if (f.sold) {
            g.sold += 1;
            g.daysSum += f.days;
            g.discSum += f.discount;
        }
    });

    const list = Object.values(map).map((g) => ({
        value: g.value,
        label: g.label,
        order: g.order,
        total: g.total,
        sold: g.sold,
        share: g.total ? g.sold / g.total : 0,
        avgDays: g.sold ? g.daysSum / g.sold : null,
    }));

    list.sort(sortByShare ? (a, b) => b.share - a.share || b.total - a.total : (a, b) => a.order - b.order);

    // лучшая и худшая строки группы (по доле проданных, при равенстве — по сроку)
    const ranked = list.slice().sort((a, b) => b.share - a.share || (a.avgDays || 99) - (b.avgDays || 99));
    if (ranked.length > 1) {
        ranked[0].best = true;
        ranked[ranked.length - 1].worst = true;
    }

    return {dim, title, rows: list};
}

const groups = {
    view: buildGroup('view', 'Вид из окон', true),
    rooms: buildGroup('rooms', 'Комнатность', false),
    floor: buildGroup('floor', 'Этаж', false),
    price: buildGroup('price', 'Цена за м²', false),
    area: buildGroup('area', 'Площадь', false),
};

// ---------- 4. Тултипы ----------

const tips = {};
flats.forEach((f) => {
    tips[`a|${f.id}`] = f.tip;
});
Object.values(groups).forEach((g) => {
    g.rows.forEach((r) => {
        tips[`f|${g.dim}|${r.value}`] =
            `<b>${g.title}: ${r.label}</b><br/>продано ${r.sold} из ${r.total} (${Math.round(r.share * 100)}%)` +
            (r.avgDays !== null ? `<br/>средний срок сделки ${r.avgDays.toFixed(1).replace('.', ',')} дн.` : '') +
            '<br/><i>клик — подсветить квартиры</i>';
    });
});

const totalSold = flats.filter((f) => f.sold).length;

const chartData = {
    buildings: buildings.map((b) => ({
        name: b.name,
        width: b.width,
        maxFloor: b.maxFloor,
        share: b.share,
        floors: Object.keys(b.floors).map((floor) => ({
            floor: Number(floor),
            flats: b.floors[floor].map((f) => ({
                id: f.id,
                area: f.area,
                rooms: f.rooms,
                sold: f.sold,
                days: f.days,
                discount: f.discount,
                dims: f.dims,
            })),
        })),
    })),
    minFloor: Math.min(...flats.map((f) => f.floor)),
    maxFloor: Math.max(...flats.map((f) => f.floor)),
    columns: [[groups.view], [groups.rooms, groups.floor], [groups.price, groups.area]],
    summary: `Продано ${totalSold} из ${flats.length} квартир (${Math.round((totalSold / flats.length) * 100)}%)`,
};

module.exports = {
    render: Editor.wrapFn({
        fn: function (options, data) {
            const W = options.width;
            const H = options.height;

            let state = {};
            try {
                state = (typeof Chart !== 'undefined' && Chart.getState && Chart.getState()) || {};
            } catch (e) {
                state = {};
            }
            const hasHighlight = Boolean(state.dim);

            // Цвет = скорость продажи: быстро (зелёный) → медленно (жёлтый); не продана — красный
            const UNSOLD = '#E5484D';
            const fast = d3.interpolateRgb('#1B9E5A', '#F2C94C');
            const colorByDays = (days) => fast(Math.max(0, Math.min(1, (days - 3) / 27)));

            const svg = d3.create('svg').attr('width', W).attr('height', H);

            const m = {top: 6, right: 6, bottom: 46, left: 26};
            const plotW = W - m.left - m.right;
            const plotH = H - m.top - m.bottom;
            const buildings = data.buildings;
            const nFloors = data.maxFloor - data.minFloor + 1;
            const rowH = plotH / nFloors;
            const GAP = Math.max(8, Math.min(18, plotW * 0.012));
            const totalWidth = buildings.reduce((s, b) => s + b.width, 0);
            const kx = (plotW - GAP * (buildings.length - 1)) / totalWidth;
            const yOf = (floor) => m.top + (data.maxFloor - floor) * rowH;

            // ---------- Фасады корпусов ----------
            let x = m.left;
            buildings.forEach((b) => {
                b.x0 = x;
                b.w = b.width * kx;
                x += b.w + GAP;
            });

            // ось этажей слева
            const floorStep = rowH < 10 ? 5 : rowH < 16 ? 2 : 1;
            for (let f = data.minFloor; f <= data.maxFloor; f++) {
                if (f !== data.minFloor && f % floorStep !== 0) {
                    continue;
                }
                svg.append('text')
                    .attr('x', m.left - 5)
                    .attr('y', yOf(f) + rowH / 2)
                    .attr('text-anchor', 'end')
                    .attr('dominant-baseline', 'middle')
                    .attr('font-size', Math.min(10, Math.max(8, rowH * 0.7)))
                    .attr('fill', 'currentColor')
                    .attr('fill-opacity', 0.55)
                    .text(f);
            }

            const cells = svg.append('g');
            buildings.forEach((b) => {
                b.floors.forEach((fl) => {
                    const floorWidth = fl.flats.reduce((s, f) => s + f.area * kx, 0);
                    let cx = b.x0 + (b.w - floorWidth) / 2;
                    const y = yOf(fl.floor);

                    fl.flats.forEach((f) => {
                        const w = f.area * kx;
                        const dimmed = hasHighlight && f.dims[state.dim] !== state.value;
                        const opacity = dimmed ? 0.12 : 1;
                        const id = `a|${f.id}`;

                        cells.append('rect')
                            .attr('x', cx + 0.75)
                            .attr('y', y + 0.75)
                            .attr('width', Math.max(1, w - 1.5))
                            .attr('height', Math.max(1, rowH - 1.5))
                            .attr('rx', 1.5)
                            .attr('fill', f.sold ? colorByDays(f.days) : UNSOLD)
                            .attr('opacity', opacity)
                            .attr('data-id', id);

                        // скидка — белый уголок
                        if (f.discount > 0 && w > 6 && rowH > 6) {
                            const s = Math.min(6, rowH * 0.45, w * 0.4);
                            const rx = cx + w - 0.75;
                            const ry = y + 0.75;
                            cells.append('path')
                                .attr('d', `M${rx - s},${ry} L${rx},${ry} L${rx},${ry + s} Z`)
                                .attr('fill', '#FFFFFF')
                                .attr('opacity', dimmed ? 0.12 : 0.95)
                                .attr('data-id', id);
                        }

                        // число комнат
                        if (w >= 11 && rowH >= 10) {
                            cells.append('text')
                                .attr('x', cx + w / 2)
                                .attr('y', y + rowH / 2 + 0.5)
                                .attr('text-anchor', 'middle')
                                .attr('dominant-baseline', 'middle')
                                .attr('font-size', Math.min(11, rowH * 0.62))
                                .attr('font-weight', 600)
                                .attr('fill', f.sold ? '#1D2B1F' : '#FFFFFF')
                                .attr('opacity', dimmed ? 0.15 : 0.85)
                                .attr('data-id', id)
                                .text(f.rooms);
                        }
                        cx += w;
                    });
                });

                // подпись корпуса
                svg.append('text')
                    .attr('x', b.x0 + b.w / 2)
                    .attr('y', m.top + plotH + 13)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', 11)
                    .attr('fill', 'currentColor')
                    .text(b.w > 44 ? `${b.name} · ${Math.round(b.share * 100)}%` : b.name);
            });

            // ---------- Легенда ----------
            const legend = svg.append('g').attr('transform', `translate(${m.left},${H - 12})`);
            let lx = 0;
            const legendText = (text, opacity) => {
                legend.append('text')
                    .attr('x', lx)
                    .attr('y', 0)
                    .attr('dominant-baseline', 'middle')
                    .attr('font-size', 11)
                    .attr('fill', 'currentColor')
                    .attr('fill-opacity', opacity || 0.8)
                    .text(text);
                lx += text.length * 6.2 + 6;
            };
            const swatch = (color) => {
                legend.append('rect').attr('x', lx).attr('y', -6).attr('width', 16).attr('height', 12).attr('rx', 1.5).attr('fill', color);
                lx += 18;
            };
            legendText('Продана за: 3 дн.');
            [3, 10, 17, 24, 30].forEach((d) => swatch(colorByDays(d)));
            lx += 4;
            legendText('30+ дн.');
            lx += 8;
            swatch(UNSOLD);
            legendText('не продана');
            lx += 8;
            legend.append('rect').attr('x', lx).attr('y', -6).attr('width', 16).attr('height', 12).attr('rx', 1.5).attr('fill', colorByDays(10));
            legend.append('path').attr('d', `M${lx + 10},-6 L${lx + 16},-6 L${lx + 16},0 Z`).attr('fill', '#FFFFFF');
            lx += 20;
            legendText('со скидкой');
            lx += 8;
            legendText('ширина = площадь, цифра = комнат', 0.6);

            // ---------- Рейтинг характеристик над низкими корпусами ----------
            const others = buildings.slice(1);
            if (others.length) {
                const px0 = others[0].x0;
                const pw = W - m.right - px0;
                const othersTop = yOf(Math.max(...others.map((b) => b.maxFloor)));
                const py0 = m.top;
                const ph = othersTop - py0 - 14;

                if (ph > 120 && pw > 300) {
                    const panel = svg.append('g');
                    panel.append('text')
                        .attr('x', px0)
                        .attr('y', py0 + 10)
                        .attr('font-size', 13)
                        .attr('font-weight', 600)
                        .attr('fill', 'currentColor')
                        .text(`Что продаётся лучше и хуже · ${data.summary}`);
                    panel.append('text')
                        .attr('x', px0)
                        .attr('y', py0 + 26)
                        .attr('font-size', 11)
                        .attr('fill', 'currentColor')
                        .attr('fill-opacity', 0.6)
                        .text('Полоса = доля проданных (цвет — средний срок сделки), красный остаток — непроданные. ▲ лучшая, ▼ худшая. Клик по строке подсвечивает квартиры.');

                    const top = py0 + 40;
                    const colGap = 22;
                    const colW = (pw - colGap * 2) / 3;
                    const units = data.columns.map((col) =>
                        col.reduce((s, g) => s + g.rows.length + 1.4, 0),
                    );
                    const unit = Math.min(22, (ph - 40) / Math.max(...units));
                    const fs = Math.max(9, Math.min(11, unit * 0.62));

                    data.columns.forEach((col, ci) => {
                        const cx0 = px0 + ci * (colW + colGap);
                        const labelW = colW * 0.42;
                        const barMax = Math.max(30, colW - labelW - 74);
                        let cy = top;

                        col.forEach((g) => {
                            panel.append('text')
                                .attr('x', cx0)
                                .attr('y', cy + unit * 0.55)
                                .attr('dominant-baseline', 'middle')
                                .attr('font-size', fs + 1)
                                .attr('font-weight', 600)
                                .attr('fill', 'currentColor')
                                .text(g.title);
                            cy += unit;

                            g.rows.forEach((r) => {
                                const id = `f|${g.dim}|${r.value}`;
                                const selected = state.dim === g.dim && state.value === r.value;
                                const barH = Math.max(4, unit * 0.62);
                                const by = cy + (unit - barH) / 2;
                                const soldW = barMax * r.share;

                                // зона клика на всю строку
                                panel.append('rect')
                                    .attr('x', cx0 - 4)
                                    .attr('y', cy)
                                    .attr('width', colW + 4)
                                    .attr('height', unit)
                                    .attr('rx', 3)
                                    .attr('fill', selected ? '#4DA2F1' : '#808080')
                                    .attr('fill-opacity', selected ? 0.22 : 0.001)
                                    .attr('cursor', 'pointer')
                                    .attr('data-id', id);

                                panel.append('text')
                                    .attr('x', cx0)
                                    .attr('y', cy + unit / 2)
                                    .attr('dominant-baseline', 'middle')
                                    .attr('font-size', fs)
                                    .attr('font-weight', selected ? 600 : 400)
                                    .attr('fill', 'currentColor')
                                    .attr('cursor', 'pointer')
                                    .attr('data-id', id)
                                    .text(r.label);

                                panel.append('rect')
                                    .attr('x', cx0 + labelW)
                                    .attr('y', by)
                                    .attr('width', barMax)
                                    .attr('height', barH)
                                    .attr('rx', 2)
                                    .attr('fill', UNSOLD)
                                    .attr('fill-opacity', 0.35)
                                    .attr('data-id', id);
                                if (soldW > 0) {
                                    panel.append('rect')
                                        .attr('x', cx0 + labelW)
                                        .attr('y', by)
                                        .attr('width', soldW)
                                        .attr('height', barH)
                                        .attr('rx', 2)
                                        .attr('fill', r.avgDays !== null ? colorByDays(r.avgDays) : UNSOLD)
                                        .attr('data-id', id);
                                }

                                const mark = r.best ? ' ▲' : r.worst ? ' ▼' : '';
                                panel.append('text')
                                    .attr('x', cx0 + labelW + barMax + 6)
                                    .attr('y', cy + unit / 2)
                                    .attr('dominant-baseline', 'middle')
                                    .attr('font-size', fs)
                                    .attr('font-weight', mark ? 600 : 400)
                                    .attr('fill', r.best ? '#1B9E5A' : r.worst ? UNSOLD : 'currentColor')
                                    .attr('data-id', id)
                                    .text(
                                        `${Math.round(r.share * 100)}%` +
                                            (r.avgDays !== null ? ` · ${Math.round(r.avgDays)} дн` : '') +
                                            mark,
                                    );
                                cy += unit;
                            });
                            cy += unit * 0.4;
                        });
                    });
                }
            }

            return Editor.generateHtml(svg.node());
        },
        args: [chartData],
        libs: ['d3'],
    }),
    events: {
        click: Editor.wrapFn({
            fn: function (event) {
                const target = event && event.target;
                const id = target && target.getAttribute ? target.getAttribute('data-id') : null;
                const current = Chart.getState() || {};

                if (id && id.indexOf('f|') === 0) {
                    const parts = id.split('|');
                    const dim = parts[1];
                    const value = parts.slice(2).join('|');
                    if (current.dim === dim && current.value === value) {
                        Chart.setState({dim: null, value: null});
                    } else {
                        Chart.setState({dim, value});
                    }
                } else if (current.dim) {
                    Chart.setState({dim: null, value: null});
                }
            },
        }),
    },
    tooltip: {
        renderer: Editor.wrapFn({
            fn: function (event, tips) {
                const id = event.target && event.target.getAttribute('data-id');
                if (!id || !tips[id]) {
                    return null;
                }
                return Editor.generateHtml(`<div style="padding: 8px 12px; line-height: 1.45;">${tips[id]}</div>`);
            },
            args: [tips],
        }),
    },
};
