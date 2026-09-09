/* ==========================================================================
   report.js — เดชบอร์ดรายงานอัตโนมัติ (Automated Report Dashboard)

   หน้านี้ "เรียบเรียงรายงาน" จากไฟล์ผลการศึกษาที่โหลดไว้ใน SLAData ทุกครั้งที่เปิด
   ไม่มีข้อความสรุปหรือตัวเลขใดถูก hard-code ไว้ในหน้าเว็บ
   ถ้าไฟล์ใน data/ เปลี่ยน (รัน scripts/build_web_data.py ใหม่) รายงานก็เปลี่ยนตาม

   ขอบเขตการคำนวณของหน้านี้ — สำคัญ
     อ่านค่าตรงจากไฟล์      : SLA, ERA5, prediction, RMSE / MAE / R² / MSE,
                              feature importance, climatology, hyperparameter
     สรุปเชิงพรรณนาเพิ่ม     : จัดอันดับ, นับจำนวนสถานีที่แต่ละโมเดลชนะ,
                              ค่าเฉลี่ยข้ามสถานี, ส่วนต่างร้อยละระหว่างโมเดล,
                              ผลรวม MDI ตามกลุ่มฟีเจอร์
     ไม่ทำเด็ดขาด            : ฝึกแบบจำลองใหม่ คำนวณค่าพยากรณ์ใหม่
                              แก้ metric หรือเดาค่าที่ไม่มีในไฟล์ (แสดง N/A แทน)
   ========================================================================== */

const SLAReport = (() => {
  'use strict';

  const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // ---------------------------------------------------------------- helpers

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  /** ค่าเฉลี่ยของเฉพาะค่าที่เป็นตัวเลขจริง — คืน null ถ้าไม่มีเลย (จะได้แสดง N/A) */
  function mean(values) {
    const ok = values.filter(isNum);
    return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
  }

  /** แถวที่ค่า key น้อยที่สุด / มากที่สุด (ข้ามค่าที่ไม่ใช่ตัวเลข) */
  function extremeBy(rows, key, dir) {
    const ok = rows.filter((r) => isNum(r[key]));
    if (!ok.length) return null;
    return ok.reduce((a, b) => ((dir === 'min' ? b[key] < a[key] : b[key] > a[key]) ? b : a));
  }

  // ============================================================== compute //
  //  แยกส่วนคำนวณออกจากส่วนเรนเดอร์ เพื่อตรวจค่าด้วยสคริปต์ได้โดยไม่ต้องมี DOM
  // ======================================================================= //

  /**
   * เรียบเรียงเนื้อหารายงานทั้งฉบับจากข้อมูลที่โหลดแล้ว
   * @param {object} src แหล่งข้อมูล (ปกติคือ SLAData) — รับเป็นพารามิเตอร์เพื่อให้ทดสอบได้
   */
  function compute(src = SLAData) {
    const st = src.state;
    const meta = st.meta;
    const exp = meta.experiment;
    const MODELS = src.MODELS;
    const names = src.stationNames();

    // ---- 1. ขอบเขตของรายงาน -------------------------------------------
    const spans = names.map((n) => src.metaStation(n));
    const scope = {
      nStations: names.length,
      nMonths: spans[0] ? spans[0].n_months : null,
      recordStart: spans[0] ? spans[0].start : null,
      recordEnd: spans[0] ? spans[0].end : null,
      // ทุกสถานีควรมีช่วงข้อมูลเท่ากัน — ถ้าไม่เท่า รายงานต้องบอก ไม่กลบ
      uniformSpan: spans.every((s) => s.start === spans[0].start && s.end === spans[0].end
        && s.n_months === spans[0].n_months),
      buffer: exp.buffer_deg,
      splits: src.splits(),
      models: MODELS,
      metricPrimary: exp.metric_primary,
      horizon: exp.forecast_horizon_months,
      lookback: exp.lookback_months,
      target: exp.target,
    };

    // ---- 2. สถิติ SLA รายสถานี + ฤดูกาลจาก climatology ------------------
    const perStation = names.map((n) => {
      const s = src.station(n);
      const info = src.metaStation(n);
      const clim = (st.climatology[n] || []).slice().sort((a, b) => a.month - b.month);

      const climPeak = extremeBy(clim, 'mean_m', 'max');
      const climLow = extremeBy(clim, 'mean_m', 'min');
      const seasonalRange = (climPeak && climLow) ? climPeak.mean_m - climLow.mean_m : null;

      // อันดับแบบจำลองด้วย RMSE (ตัวชี้วัดหลักของงานวิจัย)
      const ranking = MODELS
        .map((m) => st.metricsIndex[n][m])
        .slice()
        .sort((a, b) => a.rmse - b.rmse)
        .map((row, i) => ({ ...row, rank: i + 1 }));

      const best = ranking[0];
      const runnerUp = ranking[1] || null;
      // ส่วนต่างร้อยละของ RMSE ระหว่างอันดับ 1 กับอันดับ 2 — การเทียบเชิงพรรณนา
      const marginPct = (runnerUp && isNum(best.rmse) && isNum(runnerUp.rmse) && runnerUp.rmse !== 0)
        ? (runnerUp.rmse - best.rmse) / runnerUp.rmse * 100
        : null;

      const fi = (st.featureImportance[n] || []).slice()
        .sort((a, b) => a.mdi_rank - b.mdi_rank);

      return {
        station: n,
        station_th: s.station_th,
        index: s.index,
        lat: s.lat,
        lon: s.lon,
        lastSla: info.last_m,
        lastDate: info.last_date,
        mean: info.mean_m,
        min: info.min_m,
        minDate: info.min_date,
        max: info.max_m,
        maxDate: info.max_date,
        sd: info.sd_m,
        trend: info.trend_mm_per_year,
        best,
        ranking,
        marginPct,
        climPeak,
        climLow,
        seasonalRange,
        topFeatures: fi.slice(0, 3),
        featureCount: fi.length,
      };
    });

    // ---- 3. สรุประดับแบบจำลอง (เฉลี่ยข้ามสถานี + จำนวนสถานีที่ชนะ) --------
    const modelSummary = MODELS.map((m) => {
      const rows = names.map((n) => st.metricsIndex[n][m]);
      const wins = perStation.filter((p) => p.best.model === m).length;
      const ranks = perStation.map((p) => p.ranking.find((r) => r.model === m).rank);
      return {
        model: m,
        label: src.MODEL_STYLE[m].label,
        rmse: mean(rows.map((r) => r.rmse)),
        mae: mean(rows.map((r) => r.mae)),
        mse: mean(rows.map((r) => r.mse)),
        r2: mean(rows.map((r) => r.r2)),
        wins,
        meanRank: mean(ranks),
      };
    });

    const winner = modelSummary.reduce((a, b) => (b.wins > a.wins ? b : a));
    // ชนะทุกสถานีหรือไม่ — เปลี่ยนถ้อยคำในบทสรุปให้ตรงกับผลจริง
    const winnerSweeps = winner.wins === scope.nStations;

    // ---- 4. ค่าสุดขั้วที่ใช้เล่าเรื่อง -----------------------------------
    const bestStations = perStation.map((p) => ({ ...p, bestRmse: p.best.rmse }));
    const headline = {
      lowestRmse: extremeBy(bestStations, 'bestRmse', 'min'),
      highestRmse: extremeBy(bestStations, 'bestRmse', 'max'),
      trendMin: extremeBy(perStation, 'trend', 'min'),
      trendMax: extremeBy(perStation, 'trend', 'max'),
      trendMean: mean(perStation.map((p) => p.trend)),
      slaMax: extremeBy(perStation, 'max', 'max'),
      slaMin: extremeBy(perStation, 'min', 'min'),
      seasonalMax: extremeBy(perStation, 'seasonalRange', 'max'),
      winner,
      winnerSweeps,
    };

    // ---- 5. Feature importance รวมทุกสถานี ------------------------------
    //  MDI ของแต่ละสถานีรวมได้ 1 อยู่แล้ว จึงเฉลี่ยข้ามสถานีได้ตรง ๆ
    const fiAll = names.flatMap((n) => st.featureImportance[n] || []);
    const featureGroups = [];
    const featureRanked = [];
    if (fiAll.length) {
      const byGroup = {};
      for (const r of fiAll) {
        const g = byGroup[r.feature_group] || (byGroup[r.feature_group] = { group: r.feature_group, sum: 0, features: new Set() });
        if (isNum(r.mdi_importance)) g.sum += r.mdi_importance;
        g.features.add(r.feature);
      }
      for (const g of Object.values(byGroup)) {
        featureGroups.push({
          group: g.group,
          share: g.sum / names.length,     // สัดส่วน MDI เฉลี่ยต่อสถานี
          nFeatures: g.features.size,
        });
      }
      featureGroups.sort((a, b) => b.share - a.share);

      const byFeature = {};
      for (const r of fiAll) {
        const f = byFeature[r.feature] || (byFeature[r.feature] = {
          feature: r.feature, label: r.feature_label, group: r.feature_group,
          mdi: [], perm: [], ranks: [],
        });
        f.mdi.push(r.mdi_importance);
        f.perm.push(r.perm_test_drmse_m);
        f.ranks.push(r.mdi_rank);
      }
      for (const f of Object.values(byFeature)) {
        featureRanked.push({
          feature: f.feature,
          label: f.label,
          group: f.group,
          mdi: mean(f.mdi),
          perm: mean(f.perm),
          meanRank: mean(f.ranks),
          // ติด 3 อันดับแรกของกี่สถานี — บอกความสม่ำเสมอข้ามพื้นที่
          top3Count: f.ranks.filter((r) => isNum(r) && r <= 3).length,
        });
      }
      featureRanked.sort((a, b) => b.mdi - a.mdi);
    }

    // การตั้งค่าของ permutation importance (มีเฉพาะเมื่อไฟล์ผลบันทึกไว้)
    const rfImportanceMeta = exp.rf_importance || null;

    // ---- 6. สถานะค่าพยากรณ์อนาคต ---------------------------------------
    const forecast = {
      available: st.hasForecast,
      note: meta.notes.forecast,
      // ช่วงที่งานวิจัยมีค่าพยากรณ์จริง = ชุด Test
      predictedFrom: scope.splits.find((s) => s.key === 'test').start,
      predictedTo: scope.splits.find((s) => s.key === 'test').end,
      nPredMonths: (() => {
        const first = names[0];
        const series = st.predByStation[first] && st.predByStation[first][MODELS[0]];
        return series ? series.length : null;
      })(),
    };

    // ---- 7. ตัวแปร ERA5 ที่ป้อนแบบจำลอง ---------------------------------
    const metSummary = src.MET_VARS.map((v) => {
      const rows = names.map((n) => {
        const series = (st.metByStation[n] || []).map((r) => r[v.key]).filter(isNum);
        return {
          station: n,
          mean: mean(series),
          min: series.length ? Math.min(...series) : null,
          max: series.length ? Math.max(...series) : null,
        };
      });
      return { ...v, rows, meanAll: mean(rows.map((r) => r.mean)) };
    });

    // ---- 8. ข้อค้นพบสำคัญ — เรียบเรียงจากค่าข้างบนทั้งหมด ----------------
    const findings = buildFindings({ scope, headline, perStation, modelSummary, featureRanked, featureGroups, forecast });

    return {
      generatedAt: new Date(),
      provenance: {
        notebook: meta.generated_from.notebook,
        resultsDir: meta.generated_from.results_dir,
        rawData: meta.generated_from.raw_data,
        sources: meta.sources,
      },
      titleTh: meta.title_th,
      title: meta.title,
      notes: meta.notes,
      scope,
      headline,
      perStation,
      modelSummary,
      featureGroups,
      featureRanked,
      rfImportanceMeta,
      metSummary,
      forecast,
      findings,
    };
  }

  /** ประโยคข้อค้นพบ — ทุกตัวเลขในข้อความมาจากค่าที่คำนวณไว้แล้วเท่านั้น */
  function buildFindings(r) {
    const { scope, headline, perStation, modelSummary, featureRanked, featureGroups, forecast } = r;
    const f = [];
    const w = headline.winner;

    const fmt = (v, d = 4, sign = false) => {
      if (!isNum(v)) return 'N/A';
      const s = v.toFixed(d);
      return sign && v >= 0 ? `+${s}` : s;
    };

    // 1. แบบจำลองที่ดีที่สุด
    if (headline.winnerSweeps) {
      f.push({
        tag: 'แบบจำลอง',
        text: `${w.label} ให้ค่า RMSE ต่ำที่สุดในทุกสถานี (${w.wins} จาก ${scope.nStations} สถานี) `
          + `โดยมี RMSE เฉลี่ยข้ามสถานี ${fmt(w.rmse)} m และ R² เฉลี่ย ${fmt(w.r2)} `
          + `จึงเป็นแบบจำลองที่ดีที่สุดของการศึกษานี้เมื่อวัดด้วย ${scope.metricPrimary}`,
      });
    } else {
      const winnersText = perStation
        .map((p) => `${p.station} → ${p.best.model}`)
        .join(' · ');
      f.push({
        tag: 'แบบจำลอง',
        text: `${w.label} ให้ RMSE ต่ำที่สุดใน ${w.wins} จาก ${scope.nStations} สถานี `
          + `(แบบจำลองที่ดีที่สุดรายสถานี: ${winnersText})`,
      });
    }

    // 2. ระยะห่างจากอันดับสอง
    const margins = perStation.filter((p) => isNum(p.marginPct));
    if (margins.length) {
      const lo = extremeBy(margins, 'marginPct', 'min');
      const hi = extremeBy(margins, 'marginPct', 'max');
      f.push({
        tag: 'ระยะห่าง',
        text: `RMSE ของแบบจำลองอันดับหนึ่งต่ำกว่าอันดับสองอยู่ระหว่าง `
          + `${fmt(lo.marginPct, 1)}% (${lo.station}) ถึง ${fmt(hi.marginPct, 1)}% (${hi.station})`,
      });
    }

    // 3. ช่วง RMSE ของแบบจำลองที่ดีที่สุด
    if (headline.lowestRmse && headline.highestRmse) {
      f.push({
        tag: 'ความคลาดเคลื่อน',
        text: `แบบจำลองที่ดีที่สุดรายสถานีมี RMSE อยู่ระหว่าง ${fmt(headline.lowestRmse.bestRmse)} m `
          + `ที่ ${headline.lowestRmse.station} (แม่นที่สุด) ถึง ${fmt(headline.highestRmse.bestRmse)} m `
          + `ที่ ${headline.highestRmse.station}`,
      });
    }

    // 4. แนวโน้มระดับน้ำ
    if (headline.trendMin && headline.trendMax) {
      const allRising = perStation.every((p) => isNum(p.trend) && p.trend > 0);
      f.push({
        tag: 'แนวโน้ม',
        text: `แนวโน้มเชิงเส้นของ SLA ${allRising ? 'เป็นบวก (ระดับน้ำสูงขึ้น) ทุกสถานี' : 'มีทั้งค่าบวกและค่าลบ'} `
          + `อยู่ระหว่าง ${fmt(headline.trendMin.trend, 2, true)} ถึง ${fmt(headline.trendMax.trend, 2, true)} mm/ปี `
          + `(เฉลี่ย ${fmt(headline.trendMean, 2, true)} mm/ปี) ในช่วง ${scope.recordStart} – ${scope.recordEnd}`,
      });
    }

    // 5. ฤดูกาล — เดือนสูงสุด/ต่ำสุดอาจไม่ตรงกันทุกสถานี ต้องรายงานตามจริง
    const withClim = perStation.filter((p) => p.climPeak && p.climLow);
    if (withClim.length) {
      //  จัดกลุ่มสถานีตามเดือน — ถ้าตรงกันหมดก็พูดสั้น ๆ ถ้าไม่ตรงก็บอกว่าสถานีไหนต่าง
      const monthPhrase = (key) => {
        const byMonth = new Map();
        for (const p of withClim) {
          const m = p[key].month;
          byMonth.set(m, [...(byMonth.get(m) || []), p.station]);
        }
        if (byMonth.size === 1) {
          return `เดือน${MONTHS_TH[[...byMonth.keys()][0] - 1]} ทุกสถานี`;
        }
        return [...byMonth.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .map(([m, sts]) => `เดือน${MONTHS_TH[m - 1]} (${sts.length === 1 ? sts[0] : `${sts.length} สถานี`})`)
          .join(' และ ');
      };
      const sMax = headline.seasonalMax;
      f.push({
        tag: 'ฤดูกาล',
        text: `รูปแบบรายเดือนตามปฏิทินมีค่าสูงสุดใน${monthPhrase('climPeak')} `
          + `และต่ำสุดใน${monthPhrase('climLow')}`
          + (sMax ? ` · ช่วงแกว่งตามฤดูกาลกว้างที่สุดที่ ${sMax.station} เท่ากับ ${fmt(sMax.seasonalRange, 4)} m` : ''),
      });
    }

    // 6. ตัวแปรที่สำคัญที่สุดใน Random Forest
    if (featureRanked.length) {
      const top = featureRanked[0];
      const top3 = featureRanked.slice(0, 3)
        .map((x) => `${x.feature} (${fmt(x.mdi, 3)})`).join(', ');
      // ป้ายชื่อบางตัวเป็นแค่ชื่อฟีเจอร์ + "(t)" จึงไม่ต้องพูดซ้ำ
      const topLabel = String(top.label || '').replace(/\s*\(t\)\s*$/, '') === top.feature
        ? top.feature : `${top.feature} (${top.label})`;
      f.push({
        tag: 'ตัวแปรสำคัญ',
        text: `Random Forest ให้ค่า MDI เฉลี่ยสูงสุดกับ ${topLabel} `
          + `เท่ากับ ${fmt(top.mdi, 3)} และติด 3 อันดับแรกใน ${top.top3Count} จาก ${scope.nStations} สถานี · `
          + `สามอันดับแรกโดยเฉลี่ย: ${top3}`,
      });
      if (featureGroups.length) {
        f.push({
          tag: 'กลุ่มตัวแปร',
          text: 'สัดส่วนความสำคัญ (MDI) ตามกลุ่มตัวแปร: '
            + featureGroups.map((g) => `${g.group} ${(g.share * 100).toFixed(1)}%`).join(' · '),
        });
      }
    }

    // 7. สถานะค่าพยากรณ์อนาคต — ต้องบอกตรง ๆ ว่างานวิจัยไม่ได้ผลิตไว้
    f.push({
      tag: 'ขอบเขตการพยากรณ์',
      text: forecast.available
        ? `ชุดข้อมูลมีค่าพยากรณ์ล่วงหน้าให้แสดง`
        : `งานวิจัยผลิตค่าพยากรณ์แบบ ${scope.horizon}-step-ahead บนชุด Test `
          + `(${forecast.predictedFrom} ถึง ${forecast.predictedTo}${isNum(forecast.nPredMonths) ? `, ${forecast.nPredMonths} เดือน` : ''}) เท่านั้น `
          + `ไม่ได้ผลิตค่าพยากรณ์เลยช่วงข้อมูล จึงรายงานค่าพยากรณ์อนาคตเป็น N/A`,
    });

    return f;
  }

  // =============================================================== render //

  let dom = null;   // อ้างอิงฟังก์ชันช่วยจาก app.js (num / esc / table / modelTag)

  function setHelpers(helpers) { dom = helpers; }

  const fmtDateTime = (d) => d.toLocaleString('th-TH', {
    dateStyle: 'long', timeStyle: 'short',
  });

  function monthTh(m) { return isNum(m) ? MONTHS_TH[m - 1] : 'N/A'; }

  /** แถบหัวรายงาน — ที่มาข้อมูลและเวลาที่เรียบเรียง */
  function renderHeader(r) {
    const { esc } = dom;
    const el = document.getElementById('reportHeader');
    el.innerHTML = `
      <div class="report-head">
        <div>
          <div class="report-head__kicker">รายงานอัตโนมัติ · Automated Report</div>
          <h2 class="report-head__title">${esc(r.titleTh)}</h2>
          <p class="report-head__meta">
            เรียบเรียงจากไฟล์ผลการศึกษาเมื่อ <strong>${esc(fmtDateTime(r.generatedAt))}</strong> ·
            ${r.scope.nStations} สถานี ·
            ${isNum(r.scope.nMonths) ? `${r.scope.nMonths} เดือน` : 'N/A'}
            (${esc(r.scope.recordStart)} – ${esc(r.scope.recordEnd)})
          </p>
        </div>
        <div class="report-head__actions no-print">
          <button class="btn btn--primary" type="button" id="reportPrint">พิมพ์ / บันทึกเป็น PDF</button>
          <button class="btn" type="button" id="reportCopy">คัดลอกบทสรุป</button>
        </div>
      </div>
      ${r.scope.uniformSpan ? '' : `
        <div class="callout callout--warn">
          <strong>ข้อสังเกต</strong> — ช่วงข้อมูลของแต่ละสถานีไม่เท่ากัน
          ตัวเลขที่เป็นค่าเฉลี่ยข้ามสถานีจึงเทียบกันตรง ๆ ไม่ได้ทั้งหมด
        </div>`}
      <div class="provenance">
        <span class="provenance__item"><b>โน้ตบุ๊ก</b> <code>${esc(r.provenance.notebook)}</code></span>
        <span class="provenance__item"><b>โฟลเดอร์ผล</b> <code>${esc(r.provenance.resultsDir)}</code></span>
        ${r.provenance.rawData.map((p) => `<span class="provenance__item"><b>ข้อมูลต้นทาง</b> <code>${esc(p)}</code></span>`).join('')}
      </div>`;

    document.getElementById('reportPrint').onclick = () => window.print();
    document.getElementById('reportCopy').onclick = (e) => copySummary(r, e.currentTarget);
  }

  /** ตัวเลขหลักของรายงาน */
  function renderTiles(r) {
    const { num, esc } = dom;
    const w = r.headline.winner;
    const tiles = [
      {
        label: 'แบบจำลองที่ดีที่สุดโดยรวม',
        value: esc(w.label),
        note: `ชนะ ${w.wins}/${r.scope.nStations} สถานี · RMSE เฉลี่ย ${num(w.rmse, 4)} m`,
        big: false,
      },
      {
        label: `RMSE ของแบบจำลองที่ดีที่สุด`,
        value: r.headline.lowestRmse && r.headline.highestRmse
          ? `${num(r.headline.lowestRmse.bestRmse, 4)} – ${num(r.headline.highestRmse.bestRmse, 4)}`
          : 'N/A',
        unit: 'm',
        note: 'ช่วงค่าข้ามสถานี · ยิ่งต่ำยิ่งดี',
      },
      {
        label: 'แนวโน้ม SLA',
        value: r.headline.trendMin && r.headline.trendMax
          ? `${num(r.headline.trendMin.trend, 2, { sign: true })} … ${num(r.headline.trendMax.trend, 2, { sign: true })}`
          : 'N/A',
        unit: 'mm/ปี',
        note: `เฉลี่ย ${num(r.headline.trendMean, 2, { sign: true })} mm/ปี · ${esc(r.scope.recordStart)} – ${esc(r.scope.recordEnd)}`,
      },
      {
        label: 'ค่าพยากรณ์อนาคต',
        value: r.forecast.available ? 'มีข้อมูล' : 'N/A',
        note: r.forecast.available
          ? 'อ่านจาก forecast.csv'
          : `มีเฉพาะ ${r.scope.horizon}-step-ahead บนชุด Test`,
      },
    ];

    document.getElementById('reportTiles').innerHTML = tiles.map((t) => `
      <div class="tile">
        <div class="tile__label">${t.label}</div>
        <div class="tile__value tile__value--text">${t.value}${t.unit ? `<span class="tile__unit">${t.unit}</span>` : ''}</div>
        <div class="tile__note">${t.note}</div>
      </div>`).join('');
  }

  /** บทสรุปผู้บริหาร + ข้อค้นพบเรียงข้อ */
  function renderSummary(r) {
    const { esc, num } = dom;
    const w = r.headline.winner;
    const sp = r.scope.splits;

    const intro = `การศึกษานี้ติดตามและพยากรณ์ความผิดปกติของระดับน้ำทะเล (Sea Level Anomaly) `
      + `ที่ ${r.scope.nStations} สถานีบริเวณอ่าวไทยตอนบน ด้วยข้อมูล SLA รายเดือนจาก `
      + `${r.provenance.sources[0].name} และตัวแปรอุตุนิยมวิทยาจาก ${r.provenance.sources[1].name} `
      + `รวม ${isNum(r.scope.nMonths) ? r.scope.nMonths : 'N/A'} เดือน (${r.scope.recordStart} – ${r.scope.recordEnd}) `
      + `เฉลี่ยเชิงพื้นที่ในกล่อง ±${r.scope.buffer}° รอบพิกัดสถานี `
      + `เปรียบเทียบแบบจำลอง ${r.scope.models.join(', ')} บนเงื่อนไขเดียวกัน — `
      + `แบ่งข้อมูลเป็น Train ${sp[0].start} – ${sp[0].end}, Validation ${sp[1].start} – ${sp[1].end} `
      + `และ Test ${sp[2].start} – ${sp[2].end} พยากรณ์แบบ ${r.scope.horizon}-step-ahead `
      + `เป้าหมาย ${r.scope.target} และวัดผลด้วย ${r.scope.metricPrimary} เป็นตัวชี้วัดหลัก`;

    const verdict = r.headline.winnerSweeps
      ? `ผลบนชุดทดสอบชี้ว่า ${w.label} แม่นที่สุดในทุกสถานี`
      : `ผลบนชุดทดสอบชี้ว่า ${w.label} แม่นที่สุดใน ${w.wins} จาก ${r.scope.nStations} สถานี`;

    document.getElementById('reportSummary').innerHTML = `
      <p class="report-para">${esc(intro)}</p>
      <p class="report-para"><strong>${esc(verdict)}</strong> ${esc(
        `โดยมี RMSE เฉลี่ยข้ามสถานี ${num(w.rmse, 4)} m, MAE ${num(w.mae, 4)} m และ R² ${num(w.r2, 4)} `
        + `ส่วนแบบจำลองอื่นเรียงตาม RMSE เฉลี่ยได้เป็น `
        + r.modelSummary.slice().sort((a, b) => a.rmse - b.rmse)
          .map((m) => `${m.label} ${num(m.rmse, 4)} m`).join(' < '))}</p>
      <ol class="findings">
        ${r.findings.map((f) => `
          <li class="finding">
            <span class="finding__tag">${esc(f.tag)}</span>
            <span class="finding__text">${esc(f.text)}</span>
          </li>`).join('')}
      </ol>`;
  }

  /** ตารางที่ 1 — พื้นที่ศึกษาและสถิติ SLA */
  function renderStationTable(r) {
    const { num, esc, table, modelTag } = dom;
    table(document.getElementById('reportStationTable'), {
      caption: 'ตารางที่ 1 · พื้นที่ศึกษา สถิติ SLA รายสถานี และแบบจำลองที่ดีที่สุด',
      head: ['#', { label: 'สถานี', text: true }, 'พิกัด', 'SLA ล่าสุด (m)', 'เฉลี่ย (m)',
        'ต่ำสุด (m)', 'สูงสุด (m)', 'SD (m)', 'แนวโน้ม (mm/ปี)', 'แบบจำลองที่ดีที่สุด', 'RMSE (m)'],
      rows: r.perStation.map((p) => ({
        cells: [
          `<td>${p.index}</td>`,
          `<td class="text"><b>${esc(p.station)}</b><span class="cell-sub">${esc(p.station_th)}</span></td>`,
          `<td>${p.lat.toFixed(4)}°N<br>${p.lon.toFixed(4)}°E</td>`,
          `<td><b>${num(p.lastSla, 4, { sign: true })}</b><span class="cell-sub">${esc(p.lastDate)}</span></td>`,
          `<td>${num(p.mean, 4, { sign: true })}</td>`,
          `<td>${num(p.min, 4, { sign: true })}<span class="cell-sub">${esc(p.minDate)}</span></td>`,
          `<td>${num(p.max, 4, { sign: true })}<span class="cell-sub">${esc(p.maxDate)}</span></td>`,
          `<td>${num(p.sd, 4)}</td>`,
          `<td>${num(p.trend, 2, { sign: true })}</td>`,
          `<td>${modelTag(p.best.model)}</td>`,
          `<td><b>${num(p.best.rmse, 4)}</b></td>`,
        ],
      })),
    });
  }

  /** ตารางที่ 2 — เมทริกซ์ RMSE สถานี × แบบจำลอง */
  function renderMatrix(r) {
    const { num, esc, table } = dom;
    const models = r.scope.models;

    const rows = r.perStation.map((p) => ({
      cells: [
        `<td class="text"><b>${esc(p.station)}</b><span class="cell-sub">${esc(p.station_th)}</span></td>`,
        ...models.map((m) => {
          const row = p.ranking.find((x) => x.model === m);
          const isBest = p.best.model === m;
          return `<td class="${isBest ? 'is-best-cell' : ''}">`
            + `<b>${num(row.rmse, 4)}</b>`
            + `<span class="cell-sub">อันดับ ${row.rank}${isBest ? ' · ดีที่สุด' : ''}</span></td>`;
        }),
        `<td>${num(p.marginPct, 1)}%</td>`,
      ],
    }));

    // แถวสรุประดับแบบจำลอง — ค่าเฉลี่ยข้ามสถานี (สรุปเชิงพรรณนา)
    rows.push({
      cls: 'row-total',
      cells: [
        '<td class="text"><b>เฉลี่ยข้ามสถานี</b><span class="cell-sub">สรุปจากตารางผล</span></td>',
        ...models.map((m) => {
          const s = r.modelSummary.find((x) => x.model === m);
          return `<td><b>${num(s.rmse, 4)}</b><span class="cell-sub">ชนะ ${s.wins}/${r.scope.nStations}</span></td>`;
        }),
        '<td>—</td>',
      ],
    });

    table(document.getElementById('reportMatrix'), {
      caption: `ตารางที่ 2 · RMSE (m) บนชุด Test ${r.scope.splits[2].start} – ${r.scope.splits[2].end} · ช่องไฮไลต์ = ดีที่สุดของสถานีนั้น`,
      head: [{ label: 'สถานี', text: true }, ...models.map((m) => dom.modelTag(m)),
        'อันดับ 1 ต่ำกว่าอันดับ 2'],
      rows,
    });
  }

  /** ตารางที่ 3 — สรุประดับแบบจำลองทุกตัวชี้วัด */
  function renderModelTable(r) {
    const { num, table, modelTag } = dom;
    table(document.getElementById('reportModelTable'), {
      caption: 'ตารางที่ 3 · ค่าเฉลี่ยตัวชี้วัดข้ามสถานีของแต่ละแบบจำลอง (สรุปเชิงพรรณนาจากตารางที่ 2)',
      head: [{ label: 'แบบจำลอง', text: true }, 'MSE (m²)', 'MAE (m)', 'RMSE (m)', 'R²',
        'อันดับเฉลี่ย', 'จำนวนสถานีที่ดีที่สุด'],
      rows: r.modelSummary.slice().sort((a, b) => a.rmse - b.rmse).map((m) => ({
        cls: m.wins > 0 && m.model === r.headline.winner.model ? 'is-best' : '',
        cells: [
          `<td class="text">${modelTag(m.model)}</td>`,
          `<td>${num(m.mse, 6)}</td>`,
          `<td>${num(m.mae, 4)}</td>`,
          `<td><b>${num(m.rmse, 4)}</b></td>`,
          `<td>${num(m.r2, 4)}</td>`,
          `<td>${num(m.meanRank, 2)}</td>`,
          `<td>${m.wins} / ${r.scope.nStations}</td>`,
        ],
      })),
    });
  }

  /** การ์ดรายงานรายสถานี — เล่าเรื่องต่อสถานีพร้อมตัวเลขประกอบ */
  function renderStationCards(r) {
    const { num, esc, modelTag } = dom;
    document.getElementById('reportStationCards').innerHTML = r.perStation.map((p) => `
      <article class="report-card">
        <header class="report-card__head">
          <div>
            <span class="report-card__no">${p.index}</span>
            <b>${esc(p.station)}</b>
            <span class="cell-sub">${esc(p.station_th)} · ${p.lat.toFixed(4)}°N ${p.lon.toFixed(4)}°E</span>
          </div>
          <div class="report-card__best">${modelTag(p.best.model)}</div>
        </header>

        <p class="report-para">
          ${esc(`ค่า SLA ล่าสุดในชุดข้อมูล ${num(p.lastSla, 4, { sign: true })} m (เดือน ${p.lastDate}) `
            + `ค่าเฉลี่ยตลอดช่วง ${num(p.mean, 4, { sign: true })} m และส่วนเบี่ยงเบนมาตรฐาน ${num(p.sd, 4)} m `
            + `ต่ำสุด ${num(p.min, 4, { sign: true })} m (${p.minDate}) สูงสุด ${num(p.max, 4, { sign: true })} m (${p.maxDate}) `
            + `แนวโน้มเชิงเส้น ${num(p.trend, 2, { sign: true })} mm/ปี `
            + `รูปแบบรายเดือนสูงสุดเดือน${monthTh(p.climPeak && p.climPeak.month)} `
            + `ต่ำสุดเดือน${monthTh(p.climLow && p.climLow.month)} `
            + `ช่วงแกว่งตามฤดูกาล ${num(p.seasonalRange, 4)} m`)}
        </p>

        <p class="report-para">
          ${esc(`แบบจำลองที่ดีที่สุดคือ ${p.best.model} (RMSE ${num(p.best.rmse, 4)} m, MAE ${num(p.best.mae, 4)} m, `
            + `R² ${num(p.best.r2, 4)}) ต่ำกว่าอันดับสองอยู่ ${num(p.marginPct, 1)}%`)}
        </p>

        <div class="report-card__grid">
          <div>
            <div class="report-card__label">อันดับแบบจำลอง (RMSE)</div>
            <ol class="mini-rank">
              ${p.ranking.map((row) => `
                <li>
                  <span>${modelTag(row.model)}</span>
                  <span class="mini-rank__val">${num(row.rmse, 4)} m · R² ${num(row.r2, 4)}</span>
                </li>`).join('')}
            </ol>
          </div>
          <div>
            <div class="report-card__label">
              ตัวแปรสำคัญสูงสุด 3 อันดับ (Random Forest · MDI)
            </div>
            ${p.topFeatures.length ? `
              <ol class="mini-rank">
                ${p.topFeatures.map((fRow) => `
                  <li>
                    <span><code>${esc(fRow.feature)}</code> <span class="cell-sub">${esc(fRow.feature_group)}</span></span>
                    <span class="mini-rank__val">${num(fRow.mdi_importance, 3)}</span>
                  </li>`).join('')}
              </ol>` : '<p class="report-para">N/A — ไม่มีข้อมูล feature importance ของสถานีนี้</p>'}
          </div>
        </div>
      </article>`).join('');
  }

  /** สรุปตัวแปรที่ป้อนแบบจำลอง (ERA5) และความสำคัญของตัวแปรใน RF */
  function renderInputs(r) {
    const { num, esc, table } = dom;

    table(document.getElementById('reportMetTable'), {
      caption: 'ตารางที่ 4 · ช่วงค่าตัวแปร ERA5 ที่ป้อนแบบจำลอง (เฉลี่ยเชิงพื้นที่ในกล่องเดียวกับ SLA)',
      head: [{ label: 'ตัวแปร', text: true }, 'หน่วย',
        ...r.perStation.map((p) => `${p.index}. ${esc(p.station)}`), 'เฉลี่ยทุกสถานี'],
      rows: r.metSummary.map((v) => ({
        cells: [
          `<td class="text"><b>${esc(v.code)}</b><span class="cell-sub">${esc(v.label)}</span></td>`,
          `<td>${esc(v.unit)}</td>`,
          ...v.rows.map((row) => `<td>${num(row.mean, 2)}<span class="cell-sub">${num(row.min, 2)} … ${num(row.max, 2)}</span></td>`),
          `<td><b>${num(v.meanAll, 2)}</b></td>`,
        ],
      })),
    });

    const fiEl = document.getElementById('reportFiTable');
    if (!r.featureRanked.length) {
      fiEl.innerHTML = '';
      document.getElementById('reportFiNote').textContent =
        'N/A — ไม่มีไฟล์ feature importance ในชุดข้อมูล';
      return;
    }

    const fiMeta = r.rfImportanceMeta;
    document.getElementById('reportFiNote').textContent =
      `ค่าเฉลี่ยข้ามสถานีจาก rf_feature_importance.csv · MDI ของแต่ละสถานีรวมกันได้ 1 · `
      + `dRMSE จาก permutation บน${fiMeta ? fiMeta.permutation_scope : 'ชุด Test'} `
      + (fiMeta && isNum(fiMeta.permutation_n_repeats)
        ? `(สุ่มสลับ ${fiMeta.permutation_n_repeats} รอบ`
          + (isNum(fiMeta.n_test) ? `, n = ${fiMeta.n_test} เดือน` : '') + ') '
        : '')
      + `· ค่ายิ่งสูงยิ่งสำคัญ`;

    table(fiEl, {
      caption: 'ตารางที่ 5 · ความสำคัญของตัวแปรใน Random Forest เฉลี่ยข้ามสถานี',
      head: [{ label: 'ตัวแปร', text: true }, 'กลุ่ม', 'MDI เฉลี่ย', 'dRMSE เฉลี่ย (m)',
        'อันดับเฉลี่ย', `ติด 3 อันดับแรก`],
      rows: r.featureRanked.map((f) => ({
        cells: [
          `<td class="text"><code>${esc(f.feature)}</code><span class="cell-sub">${esc(f.label)}</span></td>`,
          `<td>${esc(f.group)}</td>`,
          `<td><b>${num(f.mdi, 4)}</b></td>`,
          `<td>${num(f.perm, 5, { sign: true })}</td>`,
          `<td>${num(f.meanRank, 2)}</td>`,
          `<td>${f.top3Count} / ${r.scope.nStations}</td>`,
        ],
      })),
    });
  }

  /** ภาคผนวก — วิธีการและการตั้งค่าที่ใช้จริง */
  function renderAppendix(r) {
    const { esc, table } = dom;
    const st = SLAData.state;
    const exp = st.meta.experiment;

    document.getElementById('reportMethod').innerHTML = `
      <dl class="spec">
        <div><dt>การเฉลี่ยเชิงพื้นที่</dt><dd>${esc(exp.spatial_averaging)}</dd></div>
        <div><dt>เป้าหมาย (target)</dt><dd><code>${esc(exp.target)}</code></dd></div>
        <div><dt>Forecast horizon</dt><dd>${exp.forecast_horizon_months} เดือน</dd></div>
        <div><dt>LSTM lookback</dt><dd>${exp.lookback_months} เดือน</dd></div>
        <div><dt>คาบฤดูกาล</dt><dd>${exp.seasonal_period} เดือน</dd></div>
        <div><dt>ตัวชี้วัดหลัก</dt><dd>${esc(exp.metric_primary)}</dd></div>
        ${r.scope.splits.map((s) => `
          <div><dt>ชุด ${esc(s.label)}</dt><dd>${esc(s.start)} – ${esc(s.end)}</dd></div>`).join('')}
        <div><dt>ฟีเจอร์ของ Random Forest (${exp.rf_features.length})</dt>
            <dd>${exp.rf_features.map((f) => `<code>${esc(f)}</code>`).join(' ')}</dd></div>
        <div><dt>ฟีเจอร์ของ LSTM (${exp.lstm_features.length})</dt>
            <dd>${exp.lstm_features.map((f) => `<code>${esc(f)}</code>`).join(' ')}</dd></div>
      </dl>`;

    table(document.getElementById('reportSettingsTable'), {
      caption: 'ตารางที่ 6 · โครงสร้างและพารามิเตอร์สุดท้ายของแต่ละแบบจำลอง (เลือกด้วยชุด Validation)',
      head: [{ label: 'สถานี', text: true }, 'แบบจำลอง', 'มิติข้อมูลเข้า',
        { label: 'พารามิเตอร์หลัก', text: true }],
      rows: st.settings.map((row) => ({
        cells: [
          `<td class="text">${esc(row.station)}</td>`,
          `<td>${dom.modelTag(row.model)}</td>`,
          `<td class="text">${esc(row.input_dimension)}</td>`,
          `<td class="text">${esc(row.main_parameters)}</td>`,
        ],
      })),
    });

    document.getElementById('reportNotes').innerHTML = Object.entries(r.notes)
      .map(([, text]) => `<li>${esc(text)}</li>`).join('');

    document.getElementById('reportSources').innerHTML = r.provenance.sources.map((s) => `
      <div><dt>${esc(s.name)}</dt><dd>${esc(s.role)}${s.variables.length
        ? ` · ตัวแปร ${s.variables.map((v) => `<code>${esc(v)}</code>`).join(' ')}` : ''}</dd></div>`).join('');
  }

  /** สถานะค่าพยากรณ์อนาคต — ต้องแสดง N/A ตรง ๆ ถ้างานวิจัยไม่ได้ผลิตไว้ */
  function renderForecastStatus(r) {
    const { esc } = dom;
    document.getElementById('reportForecast').innerHTML = r.forecast.available
      ? `<div class="callout"><strong>มีค่าพยากรณ์ล่วงหน้า</strong> — อ่านจาก <code>forecast.csv</code>
           ดูกราฟได้ที่หน้า Model Results &amp; Forecast</div>`
      : `<div class="na-panel">
           <div class="na-panel__value">ค่าพยากรณ์หลังช่วงข้อมูล : N/A</div>
           <p>${esc(r.forecast.note)}</p>
           <p class="cell-sub">
             ช่วงที่มีค่าพยากรณ์จริงในงานวิจัย: ${esc(r.forecast.predictedFrom)} – ${esc(r.forecast.predictedTo)}
             ${isNum(r.forecast.nPredMonths) ? `(${r.forecast.nPredMonths} เดือน ต่อสถานี ต่อแบบจำลอง)` : ''}
           </p>
         </div>`;
  }

  /** คัดลอกบทสรุปเป็นข้อความล้วน — ใช้วางลงเอกสารรายงานได้ทันที */
  function copySummary(r, btn) {
    const lines = [
      r.titleTh,
      `รายงานอัตโนมัติ · เรียบเรียงเมื่อ ${fmtDateTime(r.generatedAt)}`,
      `ที่มา: ${r.provenance.notebook} (${r.provenance.resultsDir})`,
      '',
      'ข้อค้นพบสำคัญ',
      ...r.findings.map((f, i) => `${i + 1}. [${f.tag}] ${f.text}`),
      '',
      'RMSE (m) บนชุด Test — ต่อสถานี',
      ...r.perStation.map((p) => `- ${p.station}: `
        + p.ranking.map((x) => `${x.model} ${x.rmse.toFixed(4)}`).join(' | ')
        + ` → ดีที่สุด ${p.best.model}`),
    ];
    const text = lines.join('\n');

    const done = (ok) => {
      btn.textContent = ok ? 'คัดลอกแล้ว ✓' : 'คัดลอกไม่สำเร็จ';
      setTimeout(() => { btn.textContent = 'คัดลอกบทสรุป'; }, 2000);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      return;
    }
    // สำรองสำหรับบริบทที่ Clipboard API ใช้ไม่ได้ (เช่นเปิดผ่าน http:// ธรรมดา)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    done(ok);
  }

  /** เรนเดอร์รายงานทั้งหน้า — เรียกใหม่ได้ทุกครั้งที่เปลี่ยนธีมหรือข้อมูล */
  function render() {
    const r = compute();
    renderHeader(r);
    renderTiles(r);
    renderSummary(r);
    renderStationTable(r);
    renderMatrix(r);
    SLACharts.bestRmseBar(document.getElementById('reportPlotRmse'));
    SLACharts.trendBar(document.getElementById('reportPlotTrend'));
    renderModelTable(r);
    renderStationCards(r);
    renderInputs(r);
    renderForecastStatus(r);
    renderAppendix(r);
    return r;
  }

  return { compute, render, setHelpers, MONTHS_TH };
})();

// รองรับการเรียกใช้จากสคริปต์ตรวจสอบใน Node (ไม่กระทบการทำงานบนเบราว์เซอร์)
if (typeof module !== 'undefined' && module.exports) module.exports = SLAReport;
