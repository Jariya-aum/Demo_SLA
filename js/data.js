/* ==========================================================================
   data.js — โหลดและจัดรูปข้อมูลผลการศึกษา

   ทุกไฟล์ใน data/ ถูกสร้างโดย scripts/build_web_data.py จาก
     - Rawdata/*.nc                (CMEMS SLA, ERA5)
     - outputs_fair_comparison/    (ผลลัพธ์จากโน้ตบุ๊ก)
   หน้าเว็บ "อ่านอย่างเดียว" ไม่คำนวณผลทางวิทยาศาสตร์ใหม่
   ========================================================================== */

const SLAData = (() => {
  'use strict';

  const DATA_DIR = 'data/';

  /** ลำดับแบบจำลองตาม MODELS ในโน้ตบุ๊ก — ใช้ลำดับนี้ทุกที่ในเว็บ */
  const MODELS = ['SARIMA', 'RF', 'LSTM'];

  /** ป้ายชื่อและรูปแบบเส้นประจำแบบจำลอง (สีอ่านจาก CSS custom property) */
  const MODEL_STYLE = {
    SARIMA: { label: 'SARIMA', cssVar: '--sarima', dash: 'dash' },
    RF: { label: 'Random Forest', cssVar: '--rf', dash: 'dashdot' },
    LSTM: { label: 'LSTM', cssVar: '--lstm', dash: 'dot' },
  };

  /** ตัวแปร ERA5 ที่หน้า Meteorology แสดง */
  const MET_VARS = [
    { key: 'sst_c', code: 'SST', label: 'Sea Surface Temperature', unit: '°C' },
    { key: 'slp_hpa', code: 'SLP', label: 'Mean Sea Level Pressure', unit: 'hPa' },
    { key: 'u10_ms', code: 'u10', label: '10-m U-component of wind', unit: 'm/s' },
    { key: 'v10_ms', code: 'v10', label: '10-m V-component of wind', unit: 'm/s' },
  ];

  const state = {
    meta: null,
    stations: [],          // [{station, station_th, lat, lon, ...props จาก geojson}]
    studyBoxes: [],        // [{station, bounds: [[s,w],[n,e]], buffer_deg}]
    geojson: null,
    slaByStation: {},      // station -> [{date: Date, iso, value}]
    metByStation: {},      // station -> [{date, iso, sst_c, slp_hpa, u10_ms, v10_ms}]
    predByStation: {},     // station -> model -> [{date, iso, actual, predicted, residual}]
    metrics: [],           // [{station, model, mse, mae, rmse, r2, is_best}]
    metricsIndex: {},      // station -> model -> metric row
    settings: [],
    featureImportance: {}, // station -> [rows]
    climatology: {},       // station -> [12 rows]
    forecast: {},          // station -> model -> rows (ปกติว่าง — งานวิจัยไม่ได้ผลิตไว้)
    hasForecast: false,
  };

  // ------------------------------------------------------------------ utils

  async function fetchJSON(name) {
    const res = await fetch(DATA_DIR + name, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`โหลด ${name} ไม่สำเร็จ (HTTP ${res.status})`);
    return res.json();
  }

  async function fetchCSV(name) {
    const res = await fetch(DATA_DIR + name, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`โหลด ${name} ไม่สำเร็จ (HTTP ${res.status})`);
    const text = await res.text();
    const parsed = Papa.parse(text.trim(), {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length) {
      const first = parsed.errors[0];
      throw new Error(`อ่าน ${name} ไม่สำเร็จ: ${first.message} (แถว ${first.row})`);
    }
    return parsed.data;
  }

  /** "1993-01-01" -> Date (UTC เที่ยงคืน) กัน timezone เลื่อนวัน */
  function toDate(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function groupBy(rows, key) {
    const out = {};
    for (const row of rows) {
      const k = row[key];
      (out[k] || (out[k] = [])).push(row);
    }
    return out;
  }

  // ------------------------------------------------------------------- load

  async function load() {
    const [meta, geojson, sla, met, pred, metrics, settings, fi, clim, forecast] =
      await Promise.all([
        fetchJSON('meta.json'),
        fetchJSON('stations.geojson'),
        fetchCSV('sla_historical.csv'),
        fetchCSV('meteorology.csv'),
        fetchCSV('model_predictions.csv'),
        fetchCSV('model_metrics.csv'),
        fetchCSV('model_settings.csv'),
        fetchCSV('rf_feature_importance.csv'),
        fetchCSV('monthly_climatology.csv'),
        fetchCSV('forecast.csv'),
      ]);

    state.meta = meta;
    state.geojson = geojson;

    // ---- สถานี + study box จาก GeoJSON ----------------------------------
    state.stations = geojson.features
      .filter((f) => f.properties.kind === 'station')
      .map((f, i) => ({ ...f.properties, index: i + 1 }));

    state.studyBoxes = geojson.features
      .filter((f) => f.properties.kind === 'study_box')
      .map((f) => {
        const ring = f.geometry.coordinates[0];
        const lons = ring.map((c) => c[0]);
        const lats = ring.map((c) => c[1]);
        return {
          station: f.properties.station,
          buffer_deg: f.properties.buffer_deg,
          bounds: [
            [Math.min(...lats), Math.min(...lons)],
            [Math.max(...lats), Math.max(...lons)],
          ],
        };
      });

    // ---- อนุกรม SLA -----------------------------------------------------
    for (const [station, rows] of Object.entries(groupBy(sla, 'station'))) {
      state.slaByStation[station] = rows
        .map((r) => ({ iso: r.date, date: toDate(r.date), value: r.sla_m }))
        .sort((a, b) => a.date - b.date);
    }

    // ---- ตัวแปร ERA5 ----------------------------------------------------
    for (const [station, rows] of Object.entries(groupBy(met, 'station'))) {
      state.metByStation[station] = rows
        .map((r) => ({ iso: r.date, date: toDate(r.date), ...r }))
        .sort((a, b) => a.date - b.date);
    }

    // ---- ค่าพยากรณ์ชุด Test ---------------------------------------------
    for (const [station, rows] of Object.entries(groupBy(pred, 'station'))) {
      const byModel = {};
      for (const m of MODELS) {
        byModel[m] = rows
          .filter((r) => r.model === m)
          .map((r) => ({
            iso: r.date,
            date: toDate(r.date),
            actual: r.actual_m,
            predicted: r.predicted_m,
            residual: r.residual_m,
          }))
          .sort((a, b) => a.date - b.date);
      }
      state.predByStation[station] = byModel;
    }

    // ---- Metric ---------------------------------------------------------
    state.metrics = metrics;
    for (const row of metrics) {
      (state.metricsIndex[row.station] || (state.metricsIndex[row.station] = {}))[row.model] = row;
    }

    state.settings = settings;
    state.featureImportance = groupBy(fi, 'station');
    state.climatology = groupBy(clim, 'station');

    // ---- Forecast อนาคต (อาจไม่มีข้อมูล) --------------------------------
    const forecastRows = forecast.filter((r) => r && r.station);
    state.hasForecast = forecastRows.length > 0;
    state.forecast = state.hasForecast
      ? Object.fromEntries(
          Object.entries(groupBy(forecastRows, 'station')).map(([st, rows]) => [
            st,
            groupBy(rows, 'model'),
          ])
        )
      : {};

    validate();
    return state;
  }

  /** ตรวจความสอดคล้องของชุดข้อมูลก่อนวาด — พังตั้งแต่ต้นดีกว่าวาดกราฟผิด */
  function validate() {
    if (!state.stations.length) throw new Error('stations.geojson ไม่มีสถานีเลย');
    for (const s of state.stations) {
      if (!state.slaByStation[s.station]) throw new Error(`ไม่มีอนุกรม SLA ของ ${s.station}`);
      if (!state.metByStation[s.station]) throw new Error(`ไม่มีข้อมูล ERA5 ของ ${s.station}`);
      if (!state.metricsIndex[s.station]) throw new Error(`ไม่มี metric ของ ${s.station}`);
      for (const m of MODELS) {
        if (!state.metricsIndex[s.station][m]) {
          throw new Error(`ไม่มี metric ของ ${s.station} / ${m}`);
        }
      }
    }
  }

  // -------------------------------------------------------------- accessors

  const stationNames = () => state.stations.map((s) => s.station);
  const station = (name) => state.stations.find((s) => s.station === name);
  const metaStation = (name) =>
    (state.meta.stations || []).find((s) => s.station === name) || {};

  /** ช่วง Train / Validation / Test จาก meta.json (ตรงกับ CONFIG ในโน้ตบุ๊ก) */
  function splits() {
    const s = state.meta.experiment.split;
    return [
      { key: 'train', label: 'Train', start: s.train.start, end: s.train.end },
      { key: 'val', label: 'Validation', start: s.val.start, end: s.val.end },
      { key: 'test', label: 'Test', start: s.test.start, end: s.test.end },
    ];
  }

  /** แถวของแบบจำลองที่ดีที่สุด (RMSE ต่ำสุด) ของสถานี */
  function bestModel(stationName) {
    const rows = MODELS.map((m) => state.metricsIndex[stationName][m]);
    return rows.reduce((a, b) => (b.rmse < a.rmse ? b : a));
  }

  return {
    MODELS, MODEL_STYLE, MET_VARS,
    load, state,
    stationNames, station, metaStation, splits, bestModel,
    toDate,
  };
})();
