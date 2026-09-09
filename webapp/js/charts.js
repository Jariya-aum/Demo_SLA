/* ==========================================================================
   charts.js — กราฟทั้งหมด (Plotly.js)

   หลักการที่ยึดทั้งเว็บ
     - หนึ่งกราฟ = หนึ่งแกน y เท่านั้น (ไม่มี dual axis)
       ตัวแปรคนละหน่วยแยกเป็นคนละแผง
     - สีประจำแบบจำลองคงที่ทุกกราฟ และมีรูปแบบเส้นต่างกันกำกับซ้ำ
       (เผื่อผู้ใช้ที่แยกสีได้ยาก และเผื่อพิมพ์ขาวดำ)
     - โครงกราฟจาง (กริด/แกน) ให้ข้อมูลเด่นกว่าโครง
   ========================================================================== */

const SLACharts = (() => {
  'use strict';

  const FONT = '"Segoe UI", "Leelawadee UI", Tahoma, system-ui, sans-serif';

  /** อ่านค่าสีจาก CSS custom property — เปลี่ยนธีมแล้วกราฟตามได้ */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /**
   * แปลงสี #rrggbb เป็น rgba() พร้อมความโปร่งใส
   * Plotly เขียนค่าลง attribute ของ SVG โดยตรง จึงต้องส่งสีที่เป็นค่าคงที่
   * (ฟังก์ชัน CSS อย่าง color-mix() ใช้ไม่ได้ตรงนี้)
   */
  function withAlpha(color, alpha) {
    const hex = color.replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = parseInt(full, 16);
    if (Number.isNaN(n) || full.length !== 6) return color;
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function palette() {
    return {
      surface: cssVar('--surface-1'),
      ink: cssVar('--ink'),
      ink2: cssVar('--ink-2'),
      ink3: cssVar('--ink-3'),
      grid: cssVar('--grid'),
      border: cssVar('--border'),
      sla: cssVar('--series-sla'),
      observed: cssVar('--observed'),
      SARIMA: cssVar('--sarima'),
      RF: cssVar('--rf'),
      LSTM: cssVar('--lstm'),
      accent: cssVar('--accent'),
      bandTrain: cssVar('--band-train'),
      bandVal: cssVar('--band-val'),
      bandTest: cssVar('--band-test'),
    };
  }

  const CONFIG = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: [
      'select2d', 'lasso2d', 'autoScale2d', 'toggleSpikelines',
      'hoverClosestCartesian', 'hoverCompareCartesian',
    ],
    toImageButtonOptions: { format: 'png', scale: 2 },
  };

  /** โครง layout ร่วมของทุกกราฟ */
  function baseLayout(extra = {}) {
    const p = palette();
    return Object.assign({
      paper_bgcolor: p.surface,
      plot_bgcolor: p.surface,
      font: { family: FONT, size: 12, color: p.ink2 },
      margin: { l: 62, r: 18, t: 14, b: 44 },
      hoverlabel: {
        bgcolor: p.surface,
        bordercolor: p.border,
        font: { family: FONT, size: 12, color: p.ink },
      },
      legend: {
        orientation: 'h',
        y: 1.14, x: 0, xanchor: 'left', yanchor: 'top',
        font: { size: 12, color: p.ink2 },
        bgcolor: 'rgba(0,0,0,0)',
      },
      xaxis: {
        gridcolor: p.grid, zeroline: false,
        linecolor: p.border, tickcolor: p.border,
        tickfont: { size: 11.5, color: p.ink3 },
        automargin: true,
      },
      yaxis: {
        gridcolor: p.grid, zeroline: false,
        linecolor: p.border, tickcolor: p.border,
        tickfont: { size: 11.5, color: p.ink3 },
        automargin: true,
      },
    }, extra);
  }

  function draw(el, traces, layout) {
    if (!el) return;
    Plotly.react(el, traces, layout, CONFIG);
  }

  /** เส้นศูนย์ (SLA = 0) — เป็นเส้นอ้างอิง ไม่ใช่ข้อมูล จึงจางกว่าเสมอ */
  function zeroLine(p) {
    return {
      type: 'line', xref: 'paper', x0: 0, x1: 1,
      yref: 'y', y0: 0, y1: 0,
      line: { color: p.ink3, width: 1, dash: 'dot' },
      layer: 'below',
    };
  }

  /** แถบพื้นหลังบอกช่วง Train / Validation / Test */
  function splitBands(p) {
    const colors = { train: p.bandTrain, val: p.bandVal, test: p.bandTest };
    return SLAData.splits().map((s) => ({
      type: 'rect', xref: 'x', yref: 'paper',
      x0: s.start, x1: s.end, y0: 0, y1: 1,
      fillcolor: colors[s.key], line: { width: 0 }, layer: 'below',
    }));
  }

  function splitLabels(p) {
    return SLAData.splits().map((s) => ({
      x: s.start, y: 1, xref: 'x', yref: 'paper',
      xanchor: 'left', yanchor: 'bottom', yshift: 2, xshift: 3,
      text: s.label, showarrow: false,
      font: { size: 10.5, color: p.ink3 },
    }));
  }

  // ====================================================================== //
  // หน้า Overview                                                          //
  // ====================================================================== //

  /** RMSE ของแบบจำลองที่ดีที่สุดในแต่ละสถานี — งานคือ "ขนาด" จึงใช้สีเดียว */
  function bestRmseBar(el) {
    const p = palette();
    const names = SLAData.stationNames();
    const rows = names.map((n) => SLAData.bestModel(n));

    draw(el, [{
      type: 'bar', orientation: 'h',
      x: rows.map((r) => r.rmse),
      y: names.map((n, i) => `${i + 1}. ${n}`),
      marker: { color: p.sla, cornerradius: 4 },
      text: rows.map((r) => `${r.rmse.toFixed(4)} m · ${r.model}`),
      textposition: 'auto',
      insidetextfont: { color: '#ffffff', size: 11.5 },
      outsidetextfont: { color: p.ink2, size: 11.5 },
      customdata: rows.map((r) => r.model),
      hovertemplate: '%{y}<br>%{customdata} · RMSE %{x:.4f} m<extra></extra>',
    }], baseLayout({
      margin: { l: 190, r: 24, t: 10, b: 40 },
      showlegend: false,
      xaxis: Object.assign(baseLayout().xaxis, { title: { text: 'RMSE (m)', font: { size: 11.5 } }, rangemode: 'tozero' }),
      yaxis: Object.assign(baseLayout().yaxis, { autorange: 'reversed' }),
    }));
  }

  /** แนวโน้ม SLA (mm/ปี) รายสถานี */
  function trendBar(el) {
    const p = palette();
    const names = SLAData.stationNames();
    const vals = names.map((n) => SLAData.station(n).trend_mm_per_year);

    draw(el, [{
      type: 'bar', orientation: 'h',
      x: vals,
      y: names.map((n, i) => `${i + 1}. ${n}`),
      marker: { color: p.sla, cornerradius: 4 },
      text: vals.map((v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} mm/ปี`),
      textposition: 'auto',
      insidetextfont: { color: '#ffffff', size: 11.5 },
      outsidetextfont: { color: p.ink2, size: 11.5 },
      hovertemplate: '%{y}<br>แนวโน้ม %{x:.2f} mm/ปี<extra></extra>',
    }], baseLayout({
      margin: { l: 190, r: 24, t: 10, b: 40 },
      showlegend: false,
      xaxis: Object.assign(baseLayout().xaxis, { title: { text: 'มิลลิเมตรต่อปี', font: { size: 11.5 } }, rangemode: 'tozero' }),
      yaxis: Object.assign(baseLayout().yaxis, { autorange: 'reversed' }),
    }));
  }

  // ====================================================================== //
  // หน้า SLA Analysis                                                      //
  // ====================================================================== //

  function slaSeries(el, stationName, showSplits) {
    const p = palette();
    const series = SLAData.state.slaByStation[stationName];
    const info = SLAData.metaStation(stationName);

    // เส้นแนวโน้มเชิงเส้น: y = a·t + b โดย t นับเป็น "เดือนที่" ตั้งแต่ต้นอนุกรม
    const a = info.trend_slope_m_per_month;
    const b = info.trend_intercept_m;
    const trendY = series.map((_, i) => a * i + b);

    const traces = [
      {
        type: 'scatter', mode: 'lines', name: 'SLA (CMEMS)',
        x: series.map((d) => d.iso), y: series.map((d) => d.value),
        line: { color: p.sla, width: 1.6 },
        hovertemplate: '%{x|%Y-%m}<br>SLA %{y:.4f} m<extra></extra>',
      },
      {
        type: 'scatter', mode: 'lines',
        name: `แนวโน้มเชิงเส้น (${info.trend_mm_per_year >= 0 ? '+' : ''}${info.trend_mm_per_year.toFixed(2)} mm/ปี)`,
        x: series.map((d) => d.iso), y: trendY,
        line: { color: p.ink2, width: 2, dash: 'dash' },
        hovertemplate: '%{x|%Y-%m}<br>เส้นแนวโน้ม %{y:.4f} m<extra></extra>',
      },
    ];

    const shapes = [zeroLine(p)];
    let annotations = [];
    if (showSplits) {
      shapes.unshift(...splitBands(p));
      annotations = splitLabels(p);
    }

    draw(el, traces, baseLayout({
      hovermode: 'x unified',
      shapes, annotations,
      margin: { l: 62, r: 18, t: 34, b: 44 },
      yaxis: Object.assign(baseLayout().yaxis, {
        title: { text: 'Sea Level Anomaly (m)', font: { size: 11.5 } },
      }),
      xaxis: Object.assign(baseLayout().xaxis, {
        type: 'date',
        rangeslider: { visible: true, thickness: 0.07, bgcolor: p.surface, bordercolor: p.border, borderwidth: 1 },
      }),
    }));
  }

  function climatology(el, stationName) {
    const p = palette();
    const rows = (SLAData.state.climatology[stationName] || [])
      .slice().sort((x, y) => x.month - y.month);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const x = rows.map((r) => months[r.month - 1]);

    draw(el, [
      {
        type: 'scatter', mode: 'lines', name: '+1 SD',
        x, y: rows.map((r) => r.mean_m + r.sd_m),
        line: { width: 0 }, hoverinfo: 'skip', showlegend: false,
      },
      {
        type: 'scatter', mode: 'lines', name: 'ช่วง ±1 SD',
        x, y: rows.map((r) => r.mean_m - r.sd_m),
        line: { width: 0 }, fill: 'tonexty',
        fillcolor: withAlpha(p.sla, 0.16),
        hoverinfo: 'skip',
      },
      {
        type: 'scatter', mode: 'lines+markers', name: 'ค่าเฉลี่ยรายเดือน',
        x, y: rows.map((r) => r.mean_m),
        line: { color: p.sla, width: 2.2 },
        marker: { size: 8, color: p.sla, line: { color: p.surface, width: 2 } },
        hovertemplate: '%{x}<br>เฉลี่ย %{y:.4f} m<extra></extra>',
      },
    ], baseLayout({
      hovermode: 'x unified',
      shapes: [zeroLine(p)],
      margin: { l: 62, r: 18, t: 34, b: 40 },
      yaxis: Object.assign(baseLayout().yaxis, { title: { text: 'SLA (m)', font: { size: 11.5 } } }),
    }));
  }

  // ====================================================================== //
  // หน้า Meteorological Variables                                          //
  // ====================================================================== //

  function metPanel(el, stationName, varDef) {
    const p = palette();
    const rows = SLAData.state.metByStation[stationName];

    draw(el, [{
      type: 'scatter', mode: 'lines', name: varDef.code,
      x: rows.map((d) => d.iso), y: rows.map((d) => d[varDef.key]),
      line: { color: p.sla, width: 1.5 },
      hovertemplate: `%{x|%Y-%m}<br>${varDef.code} %{y:.3f} ${varDef.unit}<extra></extra>`,
    }], baseLayout({
      hovermode: 'x unified',
      showlegend: false,
      margin: { l: 66, r: 18, t: 10, b: 40 },
      yaxis: Object.assign(baseLayout().yaxis, {
        title: { text: `${varDef.code} (${varDef.unit})`, font: { size: 11.5 } },
      }),
      xaxis: Object.assign(baseLayout().xaxis, { type: 'date' }),
    }));
  }

  // ====================================================================== //
  // หน้า Model Results & Forecast                                          //
  // ====================================================================== //

  function modelTrace(p, model, x, y, nameSuffix = '') {
    const style = SLAData.MODEL_STYLE[model];
    return {
      type: 'scatter', mode: 'lines',
      name: style.label + nameSuffix,
      x, y,
      line: { color: p[model], width: 2, dash: style.dash },
      hovertemplate: `%{x|%Y-%m}<br>${style.label} %{y:.4f} m<extra></extra>`,
    };
  }

  function obsPred(el, stationName, activeModels) {
    const p = palette();
    const byModel = SLAData.state.predByStation[stationName];
    const ref = byModel[SLAData.MODELS[0]];

    const traces = [{
      type: 'scatter', mode: 'lines', name: 'Observed (ค่าจริง)',
      x: ref.map((d) => d.iso), y: ref.map((d) => d.actual),
      line: { color: p.observed, width: 2.4 },
      hovertemplate: '%{x|%Y-%m}<br>ค่าจริง %{y:.4f} m<extra></extra>',
    }];

    for (const m of SLAData.MODELS) {
      if (!activeModels.includes(m)) continue;
      const rows = byModel[m];
      traces.push(modelTrace(p, m, rows.map((d) => d.iso), rows.map((d) => d.predicted)));
    }

    draw(el, traces, baseLayout({
      hovermode: 'x unified',
      shapes: [zeroLine(p)],
      margin: { l: 62, r: 18, t: 34, b: 44 },
      yaxis: Object.assign(baseLayout().yaxis, { title: { text: 'SLA (m)', font: { size: 11.5 } } }),
      xaxis: Object.assign(baseLayout().xaxis, { type: 'date' }),
    }));
  }

  function scatter(el, stationName, activeModels) {
    const p = palette();
    const byModel = SLAData.state.predByStation[stationName];
    const actual = byModel[SLAData.MODELS[0]].map((d) => d.actual);

    let lo = Math.min(...actual);
    let hi = Math.max(...actual);
    for (const m of activeModels) {
      const preds = byModel[m].map((d) => d.predicted);
      lo = Math.min(lo, ...preds);
      hi = Math.max(hi, ...preds);
    }
    const pad = (hi - lo) * 0.06 || 0.01;
    lo -= pad; hi += pad;

    const traces = [{
      type: 'scatter', mode: 'lines', name: 'เส้น 1:1',
      x: [lo, hi], y: [lo, hi],
      line: { color: p.ink3, width: 1.4, dash: 'dot' },
      hoverinfo: 'skip',
    }];

    for (const m of SLAData.MODELS) {
      if (!activeModels.includes(m)) continue;
      const style = SLAData.MODEL_STYLE[m];
      const rows = byModel[m];
      traces.push({
        type: 'scatter', mode: 'markers', name: style.label,
        x: rows.map((d) => d.actual), y: rows.map((d) => d.predicted),
        marker: { color: p[m], size: 8, opacity: 0.85, line: { color: p.surface, width: 2 } },
        customdata: rows.map((d) => d.iso),
        hovertemplate: `${style.label}<br>%{customdata|%Y-%m}<br>จริง %{x:.4f} · ทำนาย %{y:.4f} m<extra></extra>`,
      });
    }

    // แกน x และ y ใช้ช่วงเดียวกัน เส้น 1:1 จึงลากมุมล่างซ้ายไปมุมบนขวาพอดี
    // (ไม่ใช้ scaleanchor เพราะจะบังคับอัตราส่วนจนแกน x ถูกยืดออกจนกราฟโล่ง)
    const ax = { range: [lo, hi], gridcolor: p.grid, zeroline: false, linecolor: p.border, tickcolor: p.border, tickfont: { size: 11.5, color: p.ink3 } };
    draw(el, traces, baseLayout({
      hovermode: 'closest',
      margin: { l: 62, r: 18, t: 34, b: 46 },
      xaxis: Object.assign({}, ax, { title: { text: 'ค่าจริง (m)', font: { size: 11.5 } } }),
      yaxis: Object.assign({}, ax, { title: { text: 'ค่าพยากรณ์ (m)', font: { size: 11.5 } } }),
    }));
  }

  function residual(el, stationName, activeModels) {
    const p = palette();
    const byModel = SLAData.state.predByStation[stationName];

    const traces = [];
    for (const m of SLAData.MODELS) {
      if (!activeModels.includes(m)) continue;
      const rows = byModel[m];
      traces.push(modelTrace(p, m, rows.map((d) => d.iso), rows.map((d) => d.residual)));
    }

    draw(el, traces, baseLayout({
      hovermode: 'x unified',
      shapes: [zeroLine(p)],
      margin: { l: 62, r: 18, t: 34, b: 44 },
      yaxis: Object.assign(baseLayout().yaxis, { title: { text: 'Residual (m)', font: { size: 11.5 } } }),
      xaxis: Object.assign(baseLayout().xaxis, { type: 'date' }),
    }));
  }

  /**
   * Historical -> Prediction -> Forecast
   * ช่วง Forecast (หลัง 2024-12) ไม่มีข้อมูลในผลการศึกษา
   * จึงวาดเป็นแถบว่างพร้อมป้าย N/A แทน — ไม่สร้างค่าขึ้นเอง
   */
  function forecastChart(el, stationName, activeModels) {
    const p = palette();
    const hist = SLAData.state.slaByStation[stationName];
    const byModel = SLAData.state.predByStation[stationName];
    const testStart = SLAData.splits()[2].start;
    const histEnd = hist[hist.length - 1].iso;

    const traces = [{
      type: 'scatter', mode: 'lines', name: 'Historical SLA (สังเกตจริง)',
      x: hist.map((d) => d.iso), y: hist.map((d) => d.value),
      line: { color: p.observed, width: 1.6 },
      hovertemplate: '%{x|%Y-%m}<br>SLA %{y:.4f} m<extra></extra>',
    }];

    for (const m of SLAData.MODELS) {
      if (!activeModels.includes(m)) continue;
      const rows = byModel[m];
      traces.push(modelTrace(p, m, rows.map((d) => d.iso), rows.map((d) => d.predicted), ' — Prediction'));
    }

    if (SLAData.state.hasForecast) {
      const fc = SLAData.state.forecast[stationName] || {};
      for (const m of SLAData.MODELS) {
        if (!activeModels.includes(m) || !fc[m]) continue;
        traces.push(modelTrace(p, m, fc[m].map((r) => r.date), fc[m].map((r) => r.forecast_m), ' — Forecast'));
      }
    }

    // ขยายแกน x ออกไป 12 เดือนเพื่อแสดง "ช่องว่างของอนาคต" ให้เห็นชัด
    const futureEnd = '2025-12-01';

    draw(el, traces, baseLayout({
      hovermode: 'x unified',
      margin: { l: 62, r: 18, t: 34, b: 44 },
      shapes: [
        zeroLine(p),
        { type: 'rect', xref: 'x', yref: 'paper', x0: testStart, x1: histEnd, y0: 0, y1: 1,
          fillcolor: p.bandTest, line: { width: 0 }, layer: 'below' },
        { type: 'rect', xref: 'x', yref: 'paper', x0: histEnd, x1: futureEnd, y0: 0, y1: 1,
          fillcolor: 'rgba(0,0,0,0)', line: { color: p.border, width: 1, dash: 'dot' }, layer: 'below' },
      ],
      annotations: [
        { x: testStart, y: 1, xref: 'x', yref: 'paper', xanchor: 'left', yanchor: 'bottom',
          yshift: 2, xshift: 3, text: 'Prediction (Test 2020–2024)', showarrow: false,
          font: { size: 10.5, color: p.ink3 } },
        { x: histEnd, y: 0.5, xref: 'x', yref: 'paper', xanchor: 'left', yanchor: 'middle',
          xshift: 8, text: SLAData.state.hasForecast ? 'Forecast' : 'Forecast<br>N/A',
          showarrow: false, font: { size: 11, color: p.ink3 } },
      ],
      yaxis: Object.assign(baseLayout().yaxis, { title: { text: 'SLA (m)', font: { size: 11.5 } } }),
      xaxis: Object.assign(baseLayout().xaxis, { type: 'date', range: ['1993-01-01', futureEnd] }),
    }));
  }

  /**
   * Random Forest feature importance
   * metric = 'mdi' (Mean Decrease in Impurity) หรือ 'perm' (permutation บนชุด Test)
   * งานของกราฟคือ "ขนาด" จึงใช้สีเดียว และเรียงจากมากไปน้อย
   */
  function featureImportance(el, stationName, metric) {
    const p = palette();
    const isMdi = metric === 'mdi';
    const valueKey = isMdi ? 'mdi_importance' : 'perm_test_drmse_m';
    const errKey = isMdi ? 'mdi_std_across_trees' : 'perm_test_std_m';

    const rows = (SLAData.state.featureImportance[stationName] || [])
      .slice().sort((a, b) => a[valueKey] - b[valueKey]);

    draw(el, [{
      type: 'bar', orientation: 'h',
      x: rows.map((r) => r[valueKey]),
      y: rows.map((r) => r.feature_label),
      marker: { color: p.sla, cornerradius: 4 },
      error_x: {
        type: 'data', array: rows.map((r) => r[errKey]),
        color: p.ink3, thickness: 1.2, width: 4,
      },
      customdata: rows.map((r) => [r.feature, r.feature_group]),
      hovertemplate: isMdi
        ? '%{customdata[0]} · %{customdata[1]}<br>MDI %{x:.4f}<extra></extra>'
        : '%{customdata[0]} · %{customdata[1]}<br>ΔRMSE %{x:.4f} m<extra></extra>',
    }], baseLayout({
      showlegend: false,
      margin: { l: 110, r: 30, t: 10, b: 46 },
      xaxis: Object.assign(baseLayout().xaxis, {
        title: {
          text: isMdi ? 'MDI importance (รวมทุกตัวแปร = 1.000)' : 'Permutation ΔRMSE บนชุด Test (m)',
          font: { size: 11.5 },
        },
      }),
    }));
  }

  /** วาดกราฟทุกใบใหม่เมื่อธีมเปลี่ยน (สีอ่านจาก CSS จึงต้อง re-render) */
  function resizeAll() {
    document.querySelectorAll('.plot').forEach((el) => {
      if (el.data) Plotly.Plots.resize(el);
    });
  }

  return {
    palette, bestRmseBar, trendBar, slaSeries, climatology, metPanel,
    obsPred, scatter, residual, forecastChart, featureImportance, resizeAll,
  };
})();
