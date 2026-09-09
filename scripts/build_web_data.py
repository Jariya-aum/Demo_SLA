"""แปลง "ผลการศึกษา" ให้เป็นชุดไฟล์ข้อมูลของ Web Map App (webapp/data/)

สคริปต์นี้ไม่เทรนโมเดลใหม่ ไม่แก้ค่าพยากรณ์ ไม่แก้ metric ใด ๆ
หน้าที่เดียวคือ "อ่านผลที่โน้ตบุ๊กสร้างไว้แล้ว + อ่าน NetCDF ต้นทาง"
แล้วเขียนออกเป็น CSV / GeoJSON / JSON ที่หน้าเว็บโหลดได้โดยตรง

แหล่งข้อมูลเข้า
  1. Rawdata/sla_monthly_1993_2024.nc   (CMEMS SLA)      -> อนุกรม SLA รายสถานี
  2. Rawdata/era5_monthly_1993_2024.nc  (ERA5)           -> SST / SLP / u10 / v10 รายสถานี
  3. outputs_fair_comparison/           (ผลจากโน้ตบุ๊ก)  -> metric / prediction / feature importance

ค่าคงที่ทั้งหมด (พิกัดสถานี, BUFFER, ช่วง split, ชื่อฟีเจอร์) คัดลอกตรงจาก
CONFIG ในโน้ตบุ๊ก SLA_predict_SARIMA_RF_LSTM.ipynb — ห้ามแก้ให้ต่างจากโน้ตบุ๊ก

การใช้งาน
    python scripts/build_web_data.py
    python scripts/build_web_data.py --results "<path ของ outputs_fair_comparison>"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

# คอนโซล Windows ตั้งต้นเป็น cp1252 — ข้อความไทยจะพังถ้าไม่บังคับ utf-8
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

# ---------------------------------------------------------------------------
# 1. ค่าคงที่ — ตรงกับ CONFIG ในโน้ตบุ๊กทุกค่า
# ---------------------------------------------------------------------------

STATIONS = {
    "Wat Khun Samut Chin": {
        "lat": 13.5061216,
        "lon": 100.5312743,
        "name_th": "วัดขุนสมุทรจีน",
    },
    "Laem Chabang Port": {
        "lat": 13.047551,
        "lon": 100.868826,
        "name_th": "ท่าเรือแหลมฉบัง",
    },
    "Upper Gulf Offshore": {
        "lat": 12.6250,
        "lon": 100.3750,
        "name_th": "พื้นที่ตอนล่างของอ่าวไทยตอนบน",
    },
    "Phetchaburi Bangkawe": {
        "lat": 13.099714,
        "lon": 100.065466,
        "name_th": "ชายฝั่งทะเลตำบลบางแก้ว",
    },
}

BUFFER = 0.25                    # องศา — CONFIG["BUFFER"]
SEASONAL_PERIOD = 12
LOOKBACK = 12
FORECAST_HORIZON = 1
SPLIT = {
    "train": ("1993-01-01", "2016-12-31"),
    "val": ("2017-01-01", "2019-12-31"),
    "test": ("2020-01-01", "2024-12-31"),
}
MODELS = ["SARIMA", "RF", "LSTM"]

REPO_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_DIR / "Rawdata"
OUT_DIR = REPO_DIR / "webapp" / "data"

RESULTS_MARKER = "final_metrics_3models.csv"


# ---------------------------------------------------------------------------
# 2. หาโฟลเดอร์ผลการศึกษา (ไม่ hard-code absolute path)
# ---------------------------------------------------------------------------

def find_results_dir(explicit: str | None) -> Path:
    """หา outputs_fair_comparison/ ที่มีไฟล์ผลจริง

    ลำดับการค้น: --results -> ในรีโป -> โฟลเดอร์พี่น้องของรีโป -> ชั้นบนถัดไป
    """
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if (p / RESULTS_MARKER).exists():
            return p
        if (p / "outputs_fair_comparison" / RESULTS_MARKER).exists():
            return p / "outputs_fair_comparison"
        raise FileNotFoundError(f"ไม่พบ {RESULTS_MARKER} ใน {p}")

    candidates: list[Path] = [REPO_DIR / "outputs_fair_comparison"]
    for parent in [REPO_DIR.parent, *REPO_DIR.parents]:
        try:
            siblings = sorted(d for d in parent.iterdir() if d.is_dir())
        except (PermissionError, OSError):
            continue
        candidates += [d / "outputs_fair_comparison" for d in siblings]

    for cand in candidates:
        if (cand / RESULTS_MARKER).exists():
            return cand.resolve()

    raise FileNotFoundError(
        "หาโฟลเดอร์ผลการศึกษาไม่เจอ\n"
        f"ต้องมีไฟล์ outputs_fair_comparison/{RESULTS_MARKER}\n"
        "ระบุเองได้ด้วย: python scripts/build_web_data.py --results <path>"
    )


def read_result_csv(path: Path) -> pd.DataFrame:
    """อ่าน CSV ของโน้ตบุ๊ก (บางไฟล์เขียนด้วย utf-8-sig จึงมี BOM)"""
    if not path.exists():
        raise FileNotFoundError(f"ไม่พบไฟล์ผลการศึกษา: {path}")
    enc = "utf-8-sig" if path.open("rb").read(3) == b"\xef\xbb\xbf" else "utf-8"
    return pd.read_csv(path, encoding=enc)


# ไฟล์ผลบางตัวมาจากเซลล์ที่ต้องสั่งรันแยกในโน้ตบุ๊ก จึงอาจไม่มีในโฟลเดอร์ผล
SKIPPED: list[str] = []


def find_result_file(name: str, *dirs: Path) -> Path | None:
    """หาไฟล์ผลตามชื่อ โดยไล่ดูหลายที่

    ไฟล์บางตัวถูกย้ายออกมาวางไว้ที่รากของ repo แทนที่จะอยู่ในโฟลเดอร์ผล
    จึงต้องมองทั้งตำแหน่งมาตรฐานและรากของ repo ก่อนจะสรุปว่าไม่มีไฟล์
    คืน path แรกที่เจอ หรือ None ถ้าไม่เจอที่ไหนเลย
    """
    for d in dirs:
        cand = d / name
        if cand.exists():
            return cand
    return None


def keep_previous_or_fail(src: Path, out_name: str, cell: str) -> bool:
    """ตัดสินใจเมื่อไฟล์ผลต้นทางหายไป

    ถ้าโฟลเดอร์ผลไม่มีไฟล์นั้น แต่ webapp/data/ เคยสร้างไว้แล้ว ให้คงไฟล์เดิมและเตือน
    ห้ามสร้างค่าขึ้นมาแทนเด็ดขาด และห้ามเขียนทับด้วยไฟล์ว่าง

    คืน True  = ข้ามไฟล์นี้ (คงของเดิมไว้)
    ยกข้อยกเว้น = ไม่เคยมีไฟล์เดิม จึงไปต่อไม่ได้
    """
    existing = OUT_DIR / out_name
    if existing.exists():
        print(f"  [เตือน] ไม่พบ {src.name} ในโฟลเดอร์ผล — คงไฟล์เดิม {out_name} ไว้")
        print(f"          ถ้าต้องการสร้างใหม่ ให้รันเซลล์ {cell} ในโน้ตบุ๊กก่อน")
        SKIPPED.append(f"{out_name} (คงของเดิม — ไม่พบ {src.name})")
        return True
    raise FileNotFoundError(
        f"ไม่พบ {src}\n"
        f"และยังไม่เคยสร้าง {existing} ไว้ด้วย\n"
        f"ให้รันเซลล์ {cell} ในโน้ตบุ๊ก SLA_predict_SARIMA_RF_LSTM.ipynb ก่อน"
    )


# ---------------------------------------------------------------------------
# 3. อ่าน NetCDF ต้นทาง — ตรรกะเดียวกับ load_sla() / load_era5() ในโน้ตบุ๊ก
# ---------------------------------------------------------------------------

def _coord_name(ds, candidates, label):
    for name in candidates:
        if name in ds.coords or name in ds.dims:
            return name
    raise KeyError(f"ไม่พบ coordinate {label}; มีอยู่: {list(ds.coords)}")


def _var_name(ds, candidates, label):
    for name in candidates:
        if name in ds.data_vars:
            return name
    raise KeyError(f"ไม่พบตัวแปร {label}; มีอยู่: {list(ds.data_vars)}")


def _coord_slice(coord, lower, upper):
    """slice ให้ตรงทิศ ascending/descending ของแกนจริง"""
    values = np.asarray(coord.values, dtype=float)
    return slice(lower, upper) if values[0] <= values[-1] else slice(upper, lower)


def _box_mean(ds, da, lat_c, lon_c, buf) -> pd.Series:
    lat_name = _coord_name(ds, ("latitude", "lat"), "latitude")
    lon_name = _coord_name(ds, ("longitude", "lon"), "longitude")
    subset = da.sel({
        lat_name: _coord_slice(ds[lat_name], lat_c - buf, lat_c + buf),
        lon_name: _coord_slice(ds[lon_name], lon_c - buf, lon_c + buf),
    })
    if subset.sizes.get(lat_name, 0) == 0 or subset.sizes.get(lon_name, 0) == 0:
        raise ValueError(f"ไม่มี grid cell ใน buffer ±{buf}° รอบ ({lat_c}, {lon_c})")
    series = subset.mean(dim=[lat_name, lon_name], skipna=True).load().to_series()
    return series.sort_index()


def _to_month_start(series: pd.Series) -> pd.Series:
    """normalise index ให้เป็นวันที่ 1 ของเดือน (ไม่เลื่อนเดือน)"""
    idx = pd.DatetimeIndex(series.index).to_period("M").to_timestamp(how="start")
    out = pd.Series(series.to_numpy(dtype=float), index=idx)
    out.index.name = "time"
    return out.sort_index()


def load_sla(lat, lon) -> pd.Series:
    with xr.open_dataset(RAW_DIR / "sla_monthly_1993_2024.nc") as ds:
        raw = _box_mean(ds, ds[_var_name(ds, ("sla",), "SLA")], lat, lon, BUFFER)
    return _to_month_start(raw)


def load_era5(lat, lon) -> pd.DataFrame:
    """SST -> °C, SLP -> hPa, u10/v10 คงหน่วยเดิม (m/s) — แปลงตาม metadata เท่านั้น"""
    with xr.open_dataset(RAW_DIR / "era5_monthly_1993_2024.nc") as ds:
        def grab(candidates, label):
            name = _var_name(ds, candidates, label)
            da = ds[name]
            return _box_mean(ds, da, lat, lon, BUFFER), str(da.attrs.get("units") or "")

        sst_raw, sst_units = grab(("sst", "sea_surface_temperature"), "SST")
        slp_raw, slp_units = grab(("msl", "mean_sea_level_pressure"), "SLP")
        u10, _ = grab(("u10", "10m_u_component_of_wind"), "u10")
        v10, _ = grab(("v10", "10m_v_component_of_wind"), "v10")

    u = sst_units.strip().lower()
    if u in {"k", "kelvin", "degree_kelvin", "degrees_kelvin"}:
        sst = sst_raw - 273.15
    elif u in {"c", "degc", "celsius", "degree_celsius", "degrees_celsius"}:
        sst = sst_raw
    else:
        raise ValueError(f"ไม่รู้จักหน่วย SST: {sst_units!r}")

    u = slp_units.strip().lower()
    if u in {"pa", "pascal", "pascals"}:
        slp = slp_raw / 100.0
    elif u in {"hpa", "hectopascal", "hectopascals", "mbar", "millibar"}:
        slp = slp_raw
    else:
        raise ValueError(f"ไม่รู้จักหน่วย SLP: {slp_units!r}")

    df = pd.concat(
        [_to_month_start(sst).rename("sst_c"),
         _to_month_start(slp).rename("slp_hpa"),
         _to_month_start(u10).rename("u10_ms"),
         _to_month_start(v10).rename("v10_ms")],
        axis=1,
    )
    return df.sort_index()


# ---------------------------------------------------------------------------
# 4. สถิติเชิงพรรณนา + แนวโน้มเชิงเส้น
#    ใช้ np.polyfit(deg=1) แบบเดียวกับ detrend_linear() ในโน้ตบุ๊ก
#    (เป็นสถิติของ "อนุกรมที่แสดงบนกราฟ" ไม่ใช่ผลของแบบจำลองใด)
# ---------------------------------------------------------------------------

def describe_series(sla: pd.Series) -> dict:
    y = sla.to_numpy(dtype=float)
    t = np.arange(len(y), dtype=float)                  # หน่วย = เดือน
    slope_per_month, intercept = np.polyfit(t, y, deg=1)
    return {
        "n_months": int(len(y)),
        "start": sla.index[0].strftime("%Y-%m"),
        "end": sla.index[-1].strftime("%Y-%m"),
        "mean_m": float(np.mean(y)),
        "min_m": float(np.min(y)),
        "max_m": float(np.max(y)),
        "sd_m": float(np.std(y, ddof=1)),
        "min_date": sla.index[int(np.argmin(y))].strftime("%Y-%m"),
        "max_date": sla.index[int(np.argmax(y))].strftime("%Y-%m"),
        "last_m": float(y[-1]),
        "last_date": sla.index[-1].strftime("%Y-%m"),
        "trend_slope_m_per_month": float(slope_per_month),
        "trend_intercept_m": float(intercept),
        "trend_mm_per_year": float(slope_per_month * 12 * 1000.0),
    }


# ---------------------------------------------------------------------------
# 5. main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--results", default=None,
                    help="path ของ outputs_fair_comparison/ (ปกติค้นหาเอง)")
    args = ap.parse_args()

    results = find_results_dir(args.results)
    sep = results / "separated_preprocessing"
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"repo          : {REPO_DIR}")
    print(f"ผลการศึกษา    : {results}")
    print(f"เขียนออกที่    : {OUT_DIR}\n")

    written: list[tuple[str, int]] = []

    def save_csv(df: pd.DataFrame, name: str) -> None:
        path = OUT_DIR / name
        df.to_csv(path, index=False, encoding="utf-8")
        written.append((name, len(df)))
        print(f"  {name:34s} {len(df):5d} แถว")

    # --- 5.1 SLA + ERA5 รายสถานีจาก NetCDF ------------------------------------
    sla_rows, met_rows, stats = [], [], {}
    for station, info in STATIONS.items():
        sla = load_sla(info["lat"], info["lon"])
        met = load_era5(info["lat"], info["lon"])

        if len(sla) != len(met) or not sla.index.equals(met.index):
            raise ValueError(f"{station}: index ของ SLA และ ERA5 ไม่ตรงกัน")
        if not np.isfinite(sla.to_numpy()).all():
            raise ValueError(f"{station}: SLA มี NaN/Inf หลังเฉลี่ยเชิงพื้นที่")

        sla_rows.append(pd.DataFrame({
            "station": station,
            "date": sla.index.strftime("%Y-%m-%d"),
            "sla_m": sla.to_numpy(),
        }))
        met_rows.append(met.reset_index().assign(station=station).rename(
            columns={"time": "date"})[
            ["station", "date", "sst_c", "slp_hpa", "u10_ms", "v10_ms"]])
        met_rows[-1]["date"] = pd.to_datetime(
            met_rows[-1]["date"]).dt.strftime("%Y-%m-%d")

        stats[station] = describe_series(sla)

    save_csv(pd.concat(sla_rows, ignore_index=True).round(6),
             "sla_historical.csv")
    save_csv(pd.concat(met_rows, ignore_index=True).round(6),
             "meteorology.csv")

    # --- 5.2 ค่าพยากรณ์ชุด Test (ผลจริงจากโน้ตบุ๊ก ไม่แตะตัวเลข) ----------------
    pred = read_result_csv(results / "test_predictions_3models.csv")
    pred = pred.rename(columns={
        "Station": "station", "Date": "date", "Model": "model",
        "Actual_SLA_m": "actual_m", "Predicted_SLA_m": "predicted_m",
        "Residual_m": "residual_m",
    })
    pred["date"] = pd.to_datetime(pred["date"]).dt.strftime("%Y-%m-%d")
    pred["split"] = "test"
    expected_rows = len(STATIONS) * len(MODELS) * 60
    if len(pred) != expected_rows:
        raise ValueError(
            f"test_predictions_3models.csv ควรมี {expected_rows} แถว แต่มี {len(pred)}")
    save_csv(pred[["station", "date", "model", "split",
                   "actual_m", "predicted_m", "residual_m"]],
             "model_predictions.csv")

    # --- 5.3 Metric + ทำเครื่องหมายโมเดลที่ดีที่สุด (RMSE ต่ำสุด) ---------------
    met_df = read_result_csv(results / "final_metrics_3models.csv").rename(columns={
        "Station": "station", "Model": "model",
        "MSE": "mse", "MAE": "mae", "RMSE": "rmse", "R2": "r2",
    })
    if len(met_df) != len(STATIONS) * len(MODELS):
        raise ValueError("final_metrics_3models.csv ต้องมี 4 สถานี x 3 โมเดล = 12 แถว")
    best_idx = met_df.groupby("station")["rmse"].idxmin()
    met_df["is_best"] = 0
    met_df.loc[best_idx, "is_best"] = 1
    met_df["station"] = pd.Categorical(met_df["station"],
                                       categories=list(STATIONS), ordered=True)
    met_df["model"] = pd.Categorical(met_df["model"],
                                     categories=MODELS, ordered=True)
    met_df = met_df.sort_values(["station", "model"])
    save_csv(met_df[["station", "model", "mse", "mae", "rmse", "r2", "is_best"]],
             "model_metrics.csv")

    best_model = {row.station: row.model
                  for row in met_df[met_df["is_best"] == 1].itertuples()}
    best_rmse = {row.station: float(row.rmse)
                 for row in met_df[met_df["is_best"] == 1].itertuples()}

    # --- 5.4 พารามิเตอร์สุดท้ายของแต่ละโมเดล ----------------------------------
    settings = read_result_csv(results / "model_settings_3models.csv").rename(columns={
        "Station": "station", "Model": "model",
        "Input_dimension": "input_dimension", "Main_parameters": "main_parameters",
    })
    save_csv(settings[["station", "model", "input_dimension", "main_parameters"]],
             "model_settings.csv")

    # --- 5.5 Random Forest feature importance ---------------------------------
    fi_name = "rf_feature_importance_by_station.csv"
    fi_src = find_result_file(fi_name, sep, results, REPO_DIR)
    if fi_src is None and keep_previous_or_fail(
            sep / fi_name, "rf_feature_importance.csv", "13.5b (RF FEATURE IMPORTANCE)"):
        fi = None
    else:
        fi = read_result_csv(fi_src).rename(columns={
            "Station": "station", "Feature": "feature",
            "Feature_Label": "feature_label", "Feature_Group": "feature_group",
            "MDI_Importance": "mdi_importance",
            "MDI_Std_Across_Trees": "mdi_std_across_trees",
            "Perm_Test_dRMSE_m": "perm_test_drmse_m",
            "Perm_Test_Std_m": "perm_test_std_m",
            "MDI_Rank": "mdi_rank", "Perm_Test_Rank": "perm_test_rank",
        })
    # การตั้งค่าของ permutation importance อยู่ในไฟล์เดียวกัน (ค่าเดียวกันทุกแถว)
    # เก็บไว้ใส่ meta.json เพื่อให้หน้ารายงานบอกได้ว่า dRMSE วัดมาอย่างไร
    rf_importance_meta = None
    if fi is not None:
        raw_fi = read_result_csv(fi_src)

        def one_value(column):
            if column not in raw_fi.columns:
                return None
            values = raw_fi[column].dropna().unique()
            return None if len(values) != 1 else values[0].item() if hasattr(
                values[0], "item") else values[0]

        n_repeats = one_value("Perm_N_Repeats")
        n_test = one_value("N_Test")
        n_trainval = one_value("N_TrainVal")
        if n_repeats is not None:
            rf_importance_meta = {
                "mdi": "mean decrease in impurity — ผลรวมของแต่ละสถานีเท่ากับ 1",
                "permutation_scope": "ชุด Test",
                "permutation_n_repeats": n_repeats,
                "n_test": n_test,
                "n_trainval": n_trainval,
            }

    if fi is not None:
        print(f"  [อ่าน] {fi_src}")
        save_csv(fi[["station", "feature", "feature_label", "feature_group",
                     "mdi_importance", "mdi_std_across_trees",
                     "perm_test_drmse_m", "perm_test_std_m",
                     "mdi_rank", "perm_test_rank"]],
                 "rf_feature_importance.csv")

    # --- 5.6 Monthly climatology (ผลจากโน้ตบุ๊ก) -------------------------------
    clim_name = "monthly_climatology_long.csv"
    clim_src = find_result_file(clim_name, results, REPO_DIR)
    if clim_src is None and keep_previous_or_fail(
            results / clim_name, "monthly_climatology.csv",
            "Monthly Climatology (หัวข้อ 4.1.2.1)"):
        clim = None
    else:
        clim = read_result_csv(clim_src).rename(columns={
            "Station": "station", "Station_TH": "station_th",
            "Month": "month", "Month_TH": "month_th",
            "Mean_m": "mean_m", "SD_m": "sd_m", "Min_m": "min_m", "Max_m": "max_m",
            "N_years": "n_years", "Mean_detrended_m": "mean_detrended_m",
        })
    if clim is not None:
        print(f"  [อ่าน] {clim_src}")
        save_csv(clim[["station", "month", "mean_m", "sd_m", "min_m", "max_m",
                       "n_years", "mean_detrended_m"]],
                 "monthly_climatology.csv")

    # --- 5.7 Forecast อนาคต — งานวิจัยไม่ได้ผลิตไว้ จึงเขียนไฟล์เปล่า ------------
    #     หน้าเว็บจะแสดง N/A ตามข้อมูลที่มีจริง (ห้ามสร้างค่าพยากรณ์ขึ้นเอง)
    forecast = pd.DataFrame(columns=["station", "date", "model",
                                     "forecast_m", "lower_m", "upper_m"])
    save_csv(forecast, "forecast.csv")

    # --- 5.8 stations.geojson: จุดสถานี + Study box ±BUFFER° -------------------
    features = []
    for station, info in STATIONS.items():
        lat, lon = info["lat"], info["lon"]
        s = stats[station]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "kind": "station",
                "station": station,
                "station_th": info["name_th"],
                "lat": lat,
                "lon": lon,
                "buffer_deg": BUFFER,
                "sla_last_m": round(s["last_m"], 6),
                "sla_last_date": s["last_date"],
                "sla_mean_m": round(s["mean_m"], 6),
                "sla_min_m": round(s["min_m"], 6),
                "sla_max_m": round(s["max_m"], 6),
                "sla_sd_m": round(s["sd_m"], 6),
                "trend_mm_per_year": round(s["trend_mm_per_year"], 4),
                "record_start": s["start"],
                "record_end": s["end"],
                "best_model": best_model[station],
                "best_model_rmse_m": round(best_rmse[station], 6),
            },
        })
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [lon - BUFFER, lat - BUFFER],
                    [lon + BUFFER, lat - BUFFER],
                    [lon + BUFFER, lat + BUFFER],
                    [lon - BUFFER, lat + BUFFER],
                    [lon - BUFFER, lat - BUFFER],
                ]],
            },
            "properties": {
                "kind": "study_box",
                "station": station,
                "station_th": info["name_th"],
                "buffer_deg": BUFFER,
                "area_deg2": round((BUFFER * 2) ** 2, 4),
            },
        })

    geojson = {
        "type": "FeatureCollection",
        "name": "sla_study_stations_upper_gulf_of_thailand",
        "crs": {"type": "name",
                "properties": {"name": "urn:ogc:def:crs:OGC:1.3/CRS84"}},
        "features": features,
    }
    path = OUT_DIR / "stations.geojson"
    path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2),
                    encoding="utf-8")
    written.append(("stations.geojson", len(features)))
    print(f"  {'stations.geojson':34s} {len(features):5d} feature")

    # --- 5.9 meta.json: provenance + สถิติ + การตั้งค่าการทดลอง -----------------
    meta = {
        "title": "Sea Level Anomaly Monitoring & Forecasting — Upper Gulf of Thailand",
        "title_th": ("การติดตามและพยากรณ์ความผิดปกติของระดับน้ำทะเล "
                     "กรณีศึกษา 4 สถานี บริเวณอ่าวไทยตอนบน"),
        "generated_from": {
            "notebook": "SLA_predict_SARIMA_RF_LSTM.ipynb",
            "results_dir": results.name,
            "raw_data": ["Rawdata/sla_monthly_1993_2024.nc",
                         "Rawdata/era5_monthly_1993_2024.nc"],
        },
        "sources": [
            {"id": "cmems", "name": "Copernicus Marine Service (CMEMS)",
             "role": "Sea Level Anomaly (SLA) รายเดือน 1993–2024",
             "variables": ["sla"], "units": {"sla": "m"}},
            {"id": "era5", "name": "ERA5 reanalysis (Copernicus CDS)",
             "role": "ตัวแปรอุตุนิยมวิทยาที่ป้อนให้ RF และ LSTM",
             "variables": ["sst", "msl", "u10", "v10"],
             "units": {"sst": "°C", "msl": "hPa", "u10": "m/s", "v10": "m/s"}},
            {"id": "gee", "name": "Google Earth Engine (Sentinel-2 / Landsat)",
             "role": "ภาพดาวเทียมประกอบพื้นที่ศึกษา (ไม่เข้าแบบจำลอง)",
             "variables": [], "units": {}},
        ],
        "experiment": {
            "buffer_deg": BUFFER,
            "spatial_averaging": f"box mean ±{BUFFER}° รอบพิกัดสถานี",
            "forecast_horizon_months": FORECAST_HORIZON,
            "lookback_months": LOOKBACK,
            "seasonal_period": SEASONAL_PERIOD,
            "split": {k: {"start": v[0], "end": v[1]} for k, v in SPLIT.items()},
            "models": MODELS,
            "metric_primary": "RMSE (m)",
            "rf_features": ["SLA_hist", "SST", "SLP", "u10", "v10",
                            "SLA_lag1", "SLA_lag3", "SLA_lag6", "SLA_lag12",
                            "month_sin", "month_cos"],
            "lstm_features": ["SLA_hist", "SST", "SLP", "u10", "v10",
                              "month_sin", "month_cos"],
            "target": "SLA_target = SLA(t+1)",
            **({"rf_importance": rf_importance_meta} if rf_importance_meta else {}),
        },
        "stations": [
            {
                "station": st,
                "station_th": STATIONS[st]["name_th"],
                "lat": STATIONS[st]["lat"],
                "lon": STATIONS[st]["lon"],
                "best_model": best_model[st],
                "best_model_rmse_m": best_rmse[st],
                **stats[st],
            }
            for st in STATIONS
        ],
        "notes": {
            "forecast": ("งานวิจัยพยากรณ์แบบ 1-step-ahead บนชุด Test (2020–2024) เท่านั้น "
                         "ไม่ได้ผลิตค่าพยากรณ์ล่วงหน้าเลยปี 2024 "
                         "forecast.csv จึงว่าง และหน้าเว็บแสดง N/A"),
            "trend": ("แนวโน้มเชิงเส้นคำนวณจากอนุกรม SLA ที่แสดงบนกราฟด้วย "
                      "np.polyfit(deg=1) ซึ่งเป็นวิธีเดียวกับ detrend_linear() ในโน้ตบุ๊ก "
                      "เป็นสถิติเชิงพรรณนาของข้อมูล ไม่ใช่ผลลัพธ์ของแบบจำลอง"),
            "descriptive_stats": ("Mean / Min / Max / SD คำนวณจากอนุกรม SLA เต็มช่วง "
                                  "1993-01 ถึง 2024-12 (384 เดือน) ของแต่ละสถานี"),
        },
    }
    path = OUT_DIR / "meta.json"
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2),
                    encoding="utf-8")
    written.append(("meta.json", 1))
    print(f"  {'meta.json':34s}     1 ไฟล์")

    print(f"\nเขียนไฟล์ทั้งหมด {len(written)} รายการลง {OUT_DIR}")
    if SKIPPED:
        print("\nไฟล์ที่ไม่ได้สร้างใหม่ในรอบนี้ (ใช้ของเดิมที่ build ไว้ก่อนหน้า):")
        for item in SKIPPED:
            print(f"  - {item}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
