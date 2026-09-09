/* ==========================================================================
   app.js — สถานะร่วม การกำหนดเส้นทาง (routing) และการเรนเดอร์ทุกหน้า

   เว็บนี้เป็น static site ล้วน ๆ ไม่มี backend และไม่มี build step
   เส้นทางใช้ hash (#/overview) จึงเปิดตรงจาก GitHub Pages ได้โดยไม่ต้องตั้ง rewrite
   ========================================================================== */

(() => {
  'use strict';

  const ROUTES = ['overview', 'sla', 'meteorology', 'models', 'report'];
  const ROUTE_TITLE = {
    overview: 'ภาพรวมพื้นที่ศึกษา',
    sla: 'การวิเคราะห์ SLA',
    meteorology: 'ตัวแปรอุตุนิยมวิทยา',
    models: 'ผลการพยากรณ์',
    report: 'รายงานอัตโนมัติ',
  };
  const SIDEBAR_KEY = 'sla-webmap-sidebar';
  const THEME_KEY = 'sla-webmap-theme';

  const ui = {
    route: 'overview',
    station: null,
    activeModels: [...SLAData.MODELS],
    metVars: SLAData.MET_VARS.map((v) => v.key),
    fiMetric: 'mdi',
    showSplits: true,
    mapReady: false,
  };

  // ------------------------------------------------------------- formatting

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function num(value, digits = 4, { sign = false } = {}) {
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
    const s = Number(value).toFixed(digits);
    return sign && Number(value) >= 0 ? `+${s}` : s;
  }

  function esc(text) {
    return String(text ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function modelTag(model) {
    const style = SLAData.MODEL_STYLE[model];
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue(style.cssVar).trim();
    return `<span class="model-tag"><span class="model-tag__swatch" style="background:${color}"></span>${esc(style.label)}</span>`;
  }

  function table(el, { caption, head, rows }) {
    el.innerHTML =
      (caption ? `<caption>${caption}</caption>` : '') +
      `<thead><tr>${head.map((h) => `<th${h.text ? ' class="text"' : ''} scope="col">${h.label ?? h}</th>`).join('')}</tr></thead>` +
      `<tbody>${rows.map((r) => `<tr class="${r.cls || ''}">${r.cells.join('')}</tr>`).join('')}</tbody>`;
  }

  // ----------------------------------------------------------------- shared

  function setStation(name, { fly = false } = {}) {
    if (!name || name === ui.station) {
      if (ui.mapReady) SLAMap.setSelected(ui.station, { fly });
      return;
    }
    ui.station = name;
    $$('[data-station-select]').forEach((sel) => { sel.value = name; });
    if (ui.mapReady) SLAMap.setSelected(name, { fly });
    renderCurrentPage();
  }

  function stationLabel(name) {
    const s = SLAData.station(name);
    return `${s.index}. ${s.station} (${s.station_th})`;
  }

  // ================================================================== //
  // หน้า 1 — Overview                                                   //
  // ================================================================== //

  function renderStationList() {
    const list = $('#stationList');
    list.innerHTML = SLAData.state.stations.map((s) => `
      <button class="station-item" type="button" data-station="${esc(s.station)}"
              aria-pressed="${s.station === ui.station}">
        <span class="station-item__no" aria-hidden="true">${s.index}</span>
        <span class="station-item__name">${esc(s.station)}</span>
        <span class="station-item__val">
          <b>${num(s.sla_last_m, 3, { sign: true })} m</b>
          <span>SLA ${esc(s.sla_last_date)}</span>
        </span>
        <span class="station-item__meta">
          ${esc(s.station_th)} · ${s.lat.toFixed(4)}°N ${s.lon.toFixed(4)}°E
        </span>
      </button>`).join('');

    list.onclick = (e) => {
      const btn = e.target.closest('.station-item');
      if (btn) setStation(btn.dataset.station, { fly: true });
    };
  }

  function renderStationDetail() {
    const s = SLAData.station(ui.station);
    const best = SLAData.bestModel(ui.station);
    $('#stationDetail').innerHTML = `
      <div class="section">
        <div class="section__head"><h2>${esc(s.station)}</h2></div>
        <div class="tiles">
          <div class="tile">
            <div class="tile__label">SLA ล่าสุดในชุดข้อมูล</div>
            <div class="tile__value">${num(s.sla_last_m, 4, { sign: true })}<span class="tile__unit">m</span></div>
            <div class="tile__note">เดือน ${esc(s.sla_last_date)}</div>
          </div>
          <div class="tile">
            <div class="tile__label">แนวโน้ม SLA</div>
            <div class="tile__value">${num(s.trend_mm_per_year, 2, { sign: true })}<span class="tile__unit">mm/ปี</span></div>
            <div class="tile__note">${esc(s.record_start)} – ${esc(s.record_end)}</div>
          </div>
          <div class="tile">
            <div class="tile__label">แบบจำลองที่ดีที่สุด</div>
            <div class="tile__value" style="font-size:18px">${modelTag(best.model)}</div>
            <div class="tile__note">RMSE ${num(best.rmse, 4)} m · R² ${num(best.r2, 4)}</div>
          </div>
        </div>
      </div>`;
  }

  function renderOverviewTable() {
    const rows = SLAData.state.stations.map((s) => {
      const best = SLAData.bestModel(s.station);
      return {
        cls: s.station === ui.station ? 'is-best' : '',
        cells: [
          `<td class="text">${s.index}. ${esc(s.station)}<br><span style="color:var(--ink-3)">${esc(s.station_th)}</span></td>`,
          `<td>${s.lat.toFixed(6)}</td>`,
          `<td>${s.lon.toFixed(6)}</td>`,
          `<td>±${s.buffer_deg}°</td>`,
          `<td>${num(s.sla_last_m, 4, { sign: true })}</td>`,
          `<td>${esc(s.sla_last_date)}</td>`,
          `<td>${num(s.sla_mean_m, 4, { sign: true })}</td>`,
          `<td>${num(s.trend_mm_per_year, 2, { sign: true })}</td>`,
          `<td class="text">${modelTag(best.model)}</td>`,
          `<td>${num(best.rmse, 4)}</td>`,
        ],
      };
    });

    table($('#overviewTable'), {
      caption: 'ค่า SLA ล่าสุด แนวโน้ม และแบบจำลองที่ดีที่สุดของแต่ละสถานี (แถวที่เน้น = สถานีที่เลือกอยู่)',
      head: [
        { label: 'สถานี', text: true }, 'Lat (°N)', 'Lon (°E)', 'Study box',
        'SLA ล่าสุด (m)', 'เดือน', 'SLA เฉลี่ย (m)', 'แนวโน้ม (mm/ปี)',
        { label: 'Best model', text: true }, 'RMSE (m)',
      ],
      rows,
    });
  }

  /** อ่านสีเน้นจาก CSS — การ์ดตัวเลขใช้สีต่างกันเพื่อให้จำแยกได้ */
  function themeColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /**
   * การ์ดตัวเลขหลักของสถานีที่เลือก
   * ทุกค่าอ่านจากไฟล์ผลการศึกษา ไม่มีการคำนวณค่าทางวิทยาศาสตร์ใหม่
   * sparkline ใช้อนุกรม SLA จริงของสถานีนั้น
   */
  function renderStatCards() {
    const s = SLAData.station(ui.station);
    const info = SLAData.metaStation(ui.station);
    const best = SLAData.bestModel(ui.station);
    const series = SLAData.state.slaByStation[ui.station].map((r) => r.value);
    const last24 = series.slice(-24);

    const ICONS = {
      wave: '<path d="M2 12c2.5 0 2.5-4 5-4s2.5 4 5 4 2.5-4 5-4 2.5 4 5 4"/><path d="M2 18c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"/>',
      trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
      calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    };
    const ico = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

    const cards = [
      {
        key: 'last',
        cvar: '--c-blue',
        label: 'SLA ล่าสุดในชุดข้อมูล',
        value: num(info.last_m, 4, { sign: true }),
        unit: 'm',
        icon: 'wave',
        pill: `เดือน ${esc(info.last_date)}`,
        meta: 'ค่าเดือนสุดท้ายที่มีข้อมูล ไม่ใช่ค่าปัจจุบัน',
        spark: last24,
      },
      {
        key: 'trend',
        cvar: '--c-emerald',
        label: 'แนวโน้มเชิงเส้น',
        value: num(info.trend_mm_per_year, 2, { sign: true }),
        unit: 'mm/ปี',
        icon: 'trend',
        pill: `${esc(info.start)} – ${esc(info.end)}`,
        meta: 'สถิติเชิงพรรณนาของอนุกรม ไม่ใช่ผลของแบบจำลอง',
        spark: series,
      },
      {
        key: 'best',
        cvar: '--c-violet',
        label: 'แบบจำลองที่ดีที่สุด',
        value: SLAData.MODEL_STYLE[best.model].label,
        unit: '',
        icon: 'target',
        pill: `RMSE ${num(best.rmse, 4)} m`,
        meta: `R² ${num(best.r2, 4)} · MAE ${num(best.mae, 4)} m บนชุด Test`,
        spark: (SLAData.state.predByStation[ui.station][best.model] || [])
          .map((r) => r.predicted),
        textValue: true,
      },
      {
        key: 'span',
        cvar: '--c-amber',
        label: 'ช่วงข้อมูลที่ใช้',
        value: String(info.n_months),
        unit: 'เดือน',
        icon: 'calendar',
        pill: `±${SLAData.state.meta.experiment.buffer_deg}° box mean`,
        meta: `SD ${num(info.sd_m, 4)} m · เฉลี่ย ${num(info.mean_m, 4, { sign: true })} m`,
        spark: (SLAData.state.climatology[ui.station] || [])
          .slice().sort((a, b) => a.month - b.month).map((r) => r.mean_m),
      },
    ];

    $('#statCards').innerHTML = cards.map((c) => `
      <article class="stat" style="--c: var(${c.cvar})" data-spark="${c.key}">
        <div class="stat__top">
          <div>
            <div class="stat__label">${esc(c.label)}</div>
            <div class="stat__value${c.textValue ? ' stat__value--text' : ''}">
              ${c.textValue ? esc(c.value) : esc(c.value)}
              ${c.unit ? `<span class="stat__unit">${esc(c.unit)}</span>` : ''}
            </div>
          </div>
          <div class="stat__ico" aria-hidden="true">${ico(c.icon)}</div>
        </div>
        <div class="stat__meta">
          <span class="stat__pill">${c.pill}</span>
          <span>${esc(c.meta)}</span>
        </div>
        ${c.spark ? `<div class="stat__spark plot" id="spark-${c.key}"></div>` : ''}
      </article>`).join('');

    for (const c of cards) {
      if (!c.spark) continue;
      SLACharts.sparkline($(`#spark-${c.key}`), c.spark, themeColor(c.cvar));
    }
  }

  /** โดนัทสัดส่วนความสำคัญของตัวแปรตามกลุ่ม — ใช้ตัวเลขชุดเดียวกับหน้ารายงาน */
  function renderGroupShare() {
    const groups = SLAReport.compute().featureGroups;
    const legend = $('#groupLegend');
    const plot = $('#plotGroupDonut');

    if (!groups.length) {
      plot.innerHTML = '';
      legend.innerHTML = '<p class="legend-note">N/A — ไม่มีข้อมูล feature importance ในชุดข้อมูล</p>';
      return;
    }

    // กลุ่มตัวแปรเป็นหมวดของ "ที่มาของข้อมูล" จึงใช้สีของหน้าเว็บ ไม่ใช่สีประจำแบบจำลอง
    const cvars = ['--c-blue', '--c-emerald', '--c-amber', '--c-violet', '--c-rose'];
    const colors = groups.map((_, i) => themeColor(cvars[i % cvars.length]));

    SLACharts.groupDonut(plot, groups, colors);

    legend.innerHTML = groups.map((g, i) => `
      <div class="legend-list__row">
        <span class="legend-list__dot" style="background:${colors[i]}"></span>
        <span class="legend-list__name">${esc(g.group)}
          <span>${g.nFeatures} ตัวแปร</span></span>
        <span class="legend-list__val">${(g.share * 100).toFixed(1)}%</span>
      </div>`).join('');
  }

  /**
   * แถบ R² ของแต่ละแบบจำลอง
   * R² เป็นสัดส่วน 0–1 อยู่แล้ว จึงแสดงเป็นแถบได้ตรง ๆ โดยไม่ต้องตั้งเป้าใด ๆ
   * ค่าติดลบเป็นไปได้ในทางทฤษฎี จึงตัดความกว้างไม่ให้ต่ำกว่า 0
   */
  function renderR2Meters() {
    const rows = SLAData.MODELS.map((m) => SLAData.state.metricsIndex[ui.station][m]);
    const best = SLAData.bestModel(ui.station);

    $$('[data-bind="r2StationLabel"]').forEach((el) => {
      el.textContent = `· ${SLAData.station(ui.station).station}`;
    });

    $('#r2Meters').innerHTML = rows.map((r) => {
      const style = SLAData.MODEL_STYLE[r.model];
      const pct = Number.isFinite(r.r2) ? Math.max(0, Math.min(1, r.r2)) * 100 : 0;
      const isBest = r.model === best.model;
      return `
        <div class="meter" style="--c: var(${style.cssVar})">
          <div class="meter__top">
            <span class="meter__name">${modelTag(r.model)}${isBest ? ' <span class="badge">ดีที่สุด</span>' : ''}</span>
            <span class="meter__val">${num(r.r2, 4)}</span>
          </div>
          <div class="meter__track">
            <div class="meter__fill" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="meter__foot">
            <span>RMSE ${num(r.rmse, 4)} m</span>
            <span>MAE ${num(r.mae, 4)} m</span>
          </div>
        </div>`;
    }).join('');

    $('#r2Note').textContent =
      'R² = 1 คือทำนายตรงทุกจุด · ค่าทั้งหมดอ่านจาก model_metrics.csv '
      + `บนชุด Test ${SLAData.splits()[2].start} ถึง ${SLAData.splits()[2].end}`;
  }

  function renderOverview() {
    renderStatCards();
    renderStationList();
    renderStationDetail();
    renderOverviewTable();
    SLACharts.bestRmseBar($('#plotBestRmse'));
    SLACharts.trendBar($('#plotTrend'));
    renderGroupShare();
    renderR2Meters();
    if (ui.mapReady) {
      SLAMap.invalidate();
      SLAMap.setSelected(ui.station);
    }
  }

  // ================================================================== //
  // หน้า 2 — SLA Analysis                                               //
  // ================================================================== //

  function renderSla() {
    const info = SLAData.metaStation(ui.station);
    const series = SLAData.state.slaByStation[ui.station];

    $$('[data-bind="slaStationLabel"]').forEach((el) => {
      el.textContent = `· ${stationLabel(ui.station)}`;
    });
    $('#slaRangeNote').textContent =
      `${info.start} – ${info.end} · ${info.n_months} เดือน`;

    $('#slaTiles').innerHTML = `
      <div class="tile"><div class="tile__label">Mean</div>
        <div class="tile__value">${num(info.mean_m, 4, { sign: true })}<span class="tile__unit">m</span></div>
        <div class="tile__note">ค่าเฉลี่ยตลอดช่วงข้อมูล</div></div>
      <div class="tile"><div class="tile__label">Minimum</div>
        <div class="tile__value">${num(info.min_m, 4, { sign: true })}<span class="tile__unit">m</span></div>
        <div class="tile__note">เดือน ${esc(info.min_date)}</div></div>
      <div class="tile"><div class="tile__label">Maximum</div>
        <div class="tile__value">${num(info.max_m, 4, { sign: true })}<span class="tile__unit">m</span></div>
        <div class="tile__note">เดือน ${esc(info.max_date)}</div></div>
      <div class="tile"><div class="tile__label">Standard deviation</div>
        <div class="tile__value">${num(info.sd_m, 4)}<span class="tile__unit">m</span></div>
        <div class="tile__note">ส่วนเบี่ยงเบนมาตรฐาน (n−1)</div></div>
      <div class="tile"><div class="tile__label">Linear trend</div>
        <div class="tile__value">${num(info.trend_mm_per_year, 2, { sign: true })}<span class="tile__unit">mm/ปี</span></div>
        <div class="tile__note">${num(info.trend_slope_m_per_month * 1000, 4, { sign: true })} mm/เดือน</div></div>
      <div class="tile"><div class="tile__label">จำนวนข้อมูล</div>
        <div class="tile__value">${info.n_months}<span class="tile__unit">เดือน</span></div>
        <div class="tile__note">${esc(info.start)} – ${esc(info.end)}</div></div>`;

    $('#slaTrendNote').innerHTML =
      `แนวโน้มเชิงเส้นคำนวณจากอนุกรมที่แสดงบนกราฟด้วยการถดถอยเชิงเส้น (least squares) `
      + `ซึ่งเป็นวิธีเดียวกับ <code>detrend_linear()</code> ในโน้ตบุ๊ก `
      + `เป็นสถิติเชิงพรรณนาของข้อมูล CMEMS ไม่ใช่ผลลัพธ์ของแบบจำลองใด`;

    SLACharts.slaSeries($('#plotSlaSeries'), ui.station, ui.showSplits);
    SLACharts.climatology($('#plotClimatology'), ui.station);

    table($('#slaTable'), {
      head: [{ label: 'เดือน', text: true }, 'SLA (m)'],
      rows: series.map((d) => ({
        cells: [`<td class="text">${esc(d.iso.slice(0, 7))}</td>`, `<td>${num(d.value, 4, { sign: true })}</td>`],
      })),
    });
  }

  // ================================================================== //
  // หน้า 3 — Meteorological Variables                                   //
  // ================================================================== //

  function renderMetChips() {
    $('#metVarChips').innerHTML = SLAData.MET_VARS.map((v) => `
      <button class="chip" type="button" data-var="${v.key}"
              aria-pressed="${ui.metVars.includes(v.key)}">
        ${esc(v.code)} <span style="color:var(--ink-3)">${esc(v.unit)}</span>
      </button>`).join('');

    $('#metVarChips').onclick = (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      const key = btn.dataset.var;
      const next = ui.metVars.includes(key)
        ? ui.metVars.filter((k) => k !== key)
        : [...ui.metVars, key];
      if (!next.length) return;                 // ต้องเหลืออย่างน้อย 1 ตัวแปร
      ui.metVars = next;
      renderMeteorology();
    };
  }

  function renderMeteorology() {
    renderMetChips();
    const shown = SLAData.MET_VARS.filter((v) => ui.metVars.includes(v.key));
    const panels = $('#metPanels');
    panels.className = shown.length > 1 ? 'grid grid--2' : 'grid';

    panels.innerHTML = shown.map((v) => `
      <div class="card">
        <div class="card__head">
          <h3>${esc(v.code)} — ${esc(v.label)}</h3>
          <span class="sub spacer">${esc(v.unit)}</span>
        </div>
        <div class="card__body card__body--flush">
          <div class="plot plot--mid" id="plotMet-${v.key}"></div>
        </div>
      </div>`).join('');

    for (const v of shown) {
      SLACharts.metPanel($(`#plotMet-${v.key}`), ui.station, v);
    }
  }

  // ================================================================== //
  // หน้า 4 — Model Results & Forecast                                   //
  // ================================================================== //

  function renderModelChips() {
    $('#modelChips').innerHTML = SLAData.MODELS.map((m) => {
      const style = SLAData.MODEL_STYLE[m];
      const color = getComputedStyle(document.documentElement)
        .getPropertyValue(style.cssVar).trim();
      return `<button class="chip" type="button" data-model="${m}"
                aria-pressed="${ui.activeModels.includes(m)}">
                <span class="chip__swatch" style="background:${color}"></span>${esc(style.label)}
              </button>`;
    }).join('');

    $('#modelChips').onclick = (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      const m = btn.dataset.model;
      const next = ui.activeModels.includes(m)
        ? ui.activeModels.filter((x) => x !== m)
        : [...ui.activeModels, m];
      if (!next.length) return;                 // ต้องเหลืออย่างน้อย 1 แบบจำลอง
      ui.activeModels = next;
      renderModels();
    };
  }

  function renderMetricsTable() {
    const rows = [];
    SLAData.state.stations.forEach((s, si) => {
      SLAData.MODELS.forEach((m, mi) => {
        const r = SLAData.state.metricsIndex[s.station][m];
        const best = r.is_best === 1 || r.is_best === true;
        const cls = [best ? 'is-best' : '', mi === 0 && si > 0 ? 'station-start' : '']
          .filter(Boolean).join(' ');
        rows.push({
          cls,
          cells: [
            `<td class="text">${mi === 0 ? `${s.index}. ${esc(s.station)}` : ''}</td>`,
            `<td class="text">${modelTag(m)}${best ? '<span class="badge">BEST</span>' : ''}</td>`,
            `<td>${num(r.mse, 6)}</td>`,
            `<td>${num(r.mae, 4)}</td>`,
            `<td>${num(r.rmse, 4)}</td>`,
            `<td>${num(r.r2, 4)}</td>`,
          ],
        });
      });
    });

    table($('#metricsTable'), {
      caption: 'ตัวชี้วัดบนชุด Test (2020-01 – 2024-12) สเกลจริง หน่วยเมตร · ตัวชี้วัดหลักในการเปรียบเทียบคือ RMSE',
      head: [
        { label: 'สถานี', text: true }, { label: 'แบบจำลอง', text: true },
        'MSE (m²)', 'MAE (m)', 'RMSE (m)', 'R²',
      ],
      rows,
    });
  }

  function renderSettingsTable() {
    const rows = SLAData.state.settings.map((r, i, arr) => ({
      cls: i > 0 && arr[i - 1].station !== r.station ? 'station-start' : '',
      cells: [
        `<td class="text">${i === 0 || arr[i - 1].station !== r.station ? esc(r.station) : ''}</td>`,
        `<td class="text">${modelTag(r.model)}</td>`,
        `<td class="text">${esc(r.input_dimension)}</td>`,
        `<td class="text" style="white-space:normal;min-width:340px">${esc(r.main_parameters)}</td>`,
      ],
    }));

    table($('#settingsTable'), {
      head: [
        { label: 'สถานี', text: true }, { label: 'แบบจำลอง', text: true },
        { label: 'มิติข้อมูลนำเข้า', text: true }, { label: 'พารามิเตอร์หลัก', text: true },
      ],
      rows,
    });
  }

  function renderFeatureImportance() {
    const rows = SLAData.state.featureImportance[ui.station] || [];
    const rf = SLAData.state.metricsIndex[ui.station].RF;

    $('#fiMetricChips').innerHTML = [
      { key: 'mdi', label: 'MDI (Mean Decrease in Impurity)' },
      { key: 'perm', label: 'Permutation ΔRMSE (ชุด Test)' },
    ].map((o) => `<button class="chip" type="button" data-fi="${o.key}"
                    aria-pressed="${ui.fiMetric === o.key}">${esc(o.label)}</button>`).join('');

    $('#fiMetricChips').onclick = (e) => {
      const btn = e.target.closest('.chip');
      if (!btn || btn.dataset.fi === ui.fiMetric) return;
      ui.fiMetric = btn.dataset.fi;
      renderFeatureImportance();
    };

    $('#fiNote').textContent = rows.length
      ? `${stationLabel(ui.station)} · Random Forest RMSE ${num(rf.rmse, 4)} m`
      : 'ไม่มีข้อมูล feature importance ของสถานีนี้ในผลการศึกษา';

    if (!rows.length) {
      $('#plotFeatureImportance').innerHTML =
        '<div class="na-panel"><div class="na-panel__value">N/A</div></div>';
      $('#fiTable').innerHTML = '';
      return;
    }

    SLACharts.featureImportance($('#plotFeatureImportance'), ui.station, ui.fiMetric);

    const sorted = rows.slice().sort((a, b) => a.mdi_rank - b.mdi_rank);
    table($('#fiTable'), {
      caption: 'MDI วัดจากโครงสร้างต้นไม้บนข้อมูลที่ใช้เทรน · Permutation วัดจากค่า RMSE ที่แย่ลงเมื่อสุ่มสลับค่าตัวแปรบนชุด Test',
      head: [
        { label: 'ตัวแปร', text: true }, { label: 'กลุ่ม', text: true },
        'MDI', 'MDI rank', 'Perm ΔRMSE (m)', 'Perm rank',
      ],
      rows: sorted.map((r) => ({
        cells: [
          `<td class="text">${esc(r.feature_label)} <span style="color:var(--ink-3)">${esc(r.feature)}</span></td>`,
          `<td class="text">${esc(r.feature_group)}</td>`,
          `<td>${num(r.mdi_importance, 4)}</td>`,
          `<td>${r.mdi_rank}</td>`,
          `<td>${num(r.perm_test_drmse_m, 4, { sign: true })}</td>`,
          `<td>${r.perm_test_rank}</td>`,
        ],
      })),
    });
  }

  function renderModels() {
    renderModelChips();
    $$('[data-bind="modelStationLabel"]').forEach((el) => {
      el.textContent = `· ${stationLabel(ui.station)}`;
    });

    renderMetricsTable();
    SLACharts.obsPred($('#plotObsPred'), ui.station, ui.activeModels);
    SLACharts.scatter($('#plotScatter'), ui.station, ui.activeModels);
    SLACharts.residual($('#plotResidual'), ui.station, ui.activeModels);
    SLACharts.forecastChart($('#plotForecast'), ui.station, ui.activeModels);
    $('#forecastNote').textContent = SLAData.state.meta.notes.forecast;
    renderFeatureImportance();
    renderSettingsTable();
  }

  // ================================================================== //
  // Routing / boot                                                      //
  // ================================================================== //

  const RENDERERS = {
    overview: renderOverview,
    sla: renderSla,
    meteorology: renderMeteorology,
    models: renderModels,
    report: () => SLAReport.render(),
  };

  function renderCurrentPage() {
    RENDERERS[ui.route]();
  }

  function applyRoute(route) {
    ui.route = ROUTES.includes(route) ? route : 'overview';
    $$('.page').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.route === ui.route);
    });
    $$('.nav__link').forEach((el) => {
      if (el.dataset.route === ui.route) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    const crumb = $('#crumbPage');
    if (crumb) crumb.textContent = ROUTE_TITLE[ui.route] || '';

    renderCurrentPage();
    SLACharts.resizeAll();
    if (ui.route === 'overview' && ui.mapReady) SLAMap.invalidate();
  }

  function routeFromHash() {
    return (window.location.hash.replace(/^#\/?/, '').split('/')[0] || 'overview');
  }

  // ---------------------------------------------------------------- theme

  function currentTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (err) { /* โหมดส่วนตัว */ }
    // สีของกราฟอ่านจาก CSS จึงต้องวาดใหม่หลังเปลี่ยนธีม
    renderCurrentPage();
  }

  function initTheme() {
    let theme;
    try { theme = currentTheme(); } catch (err) { theme = 'light'; }
    document.documentElement.setAttribute('data-theme', theme);
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  // ------------------------------------------------------------- แถบข้าง

  /** ย่อ/ขยายแถบเมนู และจำค่าที่เลือกไว้ในเครื่องผู้ใช้ */
  function initSidebar() {
    let collapsed = false;
    try { collapsed = localStorage.getItem(SIDEBAR_KEY) === '1'; } catch (err) { /* โหมดส่วนตัว */ }

    const apply = () => {
      document.body.classList.toggle('is-collapsed', collapsed);
      const btn = $('#sideToggle');
      btn.textContent = collapsed ? '›' : '‹';
      btn.setAttribute('aria-expanded', String(!collapsed));
    };
    apply();

    $('#sideToggle').addEventListener('click', () => {
      collapsed = !collapsed;
      try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch (err) { /* โหมดส่วนตัว */ }
      apply();
      // แผนที่และกราฟต้องวัดขนาดใหม่หลังพื้นที่เนื้อหาเปลี่ยนความกว้าง
      setTimeout(() => {
        SLACharts.resizeAll();
        if (ui.mapReady) SLAMap.invalidate();
      }, 210);
    });
  }

  /** สรุปที่มาข้อมูลไว้ท้ายแถบเมนู ให้เห็นตลอดว่ากำลังดูข้อมูลชุดใด */
  function fillSideFoot() {
    const meta = SLAData.state.meta;
    const st = SLAData.metaStation(SLAData.stationNames()[0]);
    $('#sideFoot').innerHTML = `
      <div><b>${SLAData.state.stations.length} สถานี</b> · ${esc(st.start)} – ${esc(st.end)}</div>
      <div>${esc(meta.sources[0].name.replace(/\s*\(.*\)/, ''))} · ERA5</div>
      <div>${meta.experiment.models.join(' · ')}</div>`;
  }

  // ----------------------------------------------------------------- boot

  function fillStationSelects() {
    const options = SLAData.state.stations
      .map((s) => `<option value="${esc(s.station)}">${s.index}. ${esc(s.station)} — ${esc(s.station_th)}</option>`)
      .join('');
    $$('[data-station-select]').forEach((sel) => {
      sel.innerHTML = options;
      sel.value = ui.station;
      sel.addEventListener('change', (e) => setStation(e.target.value, { fly: true }));
    });
  }

  function fillStaticText() {
    const meta = SLAData.state.meta;
    const buffer = meta.experiment.buffer_deg;

    $$('[data-bind="buffer"]').forEach((el) => { el.textContent = buffer; });
    $('#mapBoxNote').textContent = `Study box ±${buffer}° รอบพิกัดสถานี (${meta.experiment.spatial_averaging})`;

    $('#sourcebar').innerHTML = meta.sources
      .map((s) => `<span title="${esc(s.role)}">${esc(s.name)}</span>`).join('');

    const exp = meta.experiment;
    $('#footerMeta').innerHTML = `
      <p><strong>${esc(meta.title_th)}</strong></p>
      <p>
        ข้อมูล SLA: ${esc(meta.sources[0].name)} ·
        ตัวแปรอุตุนิยมวิทยา: ${esc(meta.sources[1].name)} ·
        ภาพประกอบเชิงพื้นที่: ${esc(meta.sources[2].name)}
      </p>
      <p>
        Train ${esc(exp.split.train.start)} – ${esc(exp.split.train.end)} ·
        Validation ${esc(exp.split.val.start)} – ${esc(exp.split.val.end)} ·
        Test ${esc(exp.split.test.start)} – ${esc(exp.split.test.end)} ·
        forecast horizon ${exp.forecast_horizon_months} เดือน ·
        LSTM lookback ${exp.lookback_months} เดือน
      </p>
      <p>ตัวเลขทั้งหมดสร้างจาก <code>${esc(meta.generated_from.notebook)}</code>
         โดยหน้าเว็บทำหน้าที่แสดงผลเท่านั้น ไม่มีการฝึกแบบจำลองหรือคำนวณค่าพยากรณ์ใหม่</p>`;
  }

  function bindSlaControls() {
    $('#slaSplitToggle').addEventListener('click', (e) => {
      ui.showSplits = !ui.showSplits;
      e.currentTarget.setAttribute('aria-pressed', String(ui.showSplits));
      SLACharts.slaSeries($('#plotSlaSeries'), ui.station, ui.showSplits);
    });
  }

  async function boot() {
    initTheme();
    SLAReport.setHelpers({ num, esc, table, modelTag });
    try {
      await SLAData.load();
    } catch (err) {
      $('#boot').innerHTML = `
        <div class="err">
          <h2>โหลดข้อมูลไม่สำเร็จ</h2>
          <p>${esc(err.message)}</p>
          <p>ถ้าเปิดไฟล์ด้วย <code>file://</code> เบราว์เซอร์จะบล็อกการอ่านไฟล์ในโฟลเดอร์
             <code>data/</code> ให้เปิดผ่านเว็บเซิร์ฟเวอร์แทน เช่น
             <code>python -m http.server</code> ในโฟลเดอร์ <code>webapp/</code></p>
          <p>ถ้ายังไม่มีไฟล์ในโฟลเดอร์ <code>data/</code> ให้สร้างก่อนด้วย
             <code>python scripts/build_web_data.py</code></p>
        </div>`;
      return;
    }

    ui.station = SLAData.stationNames()[0];

    initSidebar();
    fillStationSelects();
    fillStaticText();
    fillSideFoot();
    bindSlaControls();

    // ปุ่มพิมพ์รายงานพาไปหน้ารายงานก่อน เพราะชุดรูปแบบสำหรับพิมพ์
    // ออกแบบไว้ให้พิมพ์เฉพาะหน้านั้น
    $('#printReport').addEventListener('click', () => {
      if (ui.route !== 'report') {
        window.location.hash = '#/report';
        setTimeout(() => window.print(), 350);
      } else {
        window.print();
      }
    });

    $('#boot').remove();
    $('#app').hidden = false;

    await SLAMap.init('map', { onSelect: (name, opts) => setStation(name, opts) });
    ui.mapReady = true;
    SLAMap.setSelected(ui.station);

    window.addEventListener('hashchange', () => applyRoute(routeFromHash()));
    window.addEventListener('resize', () => SLACharts.resizeAll());
    applyRoute(routeFromHash());
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
