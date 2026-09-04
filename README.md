# SLA Prediction  SARIMA · Random Forest · LSTM

พยากรณ์ค่าความผิดปกติของระดับน้ำทะเลรายเดือน (Sea Level Anomaly: SLA) ล่วงหน้า 1 เดือน
บริเวณอ่าวไทยตอนบน โดยเปรียบเทียบแบบจำลอง 3 ชนิดบนข้อมูล ชุดแบ่งข้อมูล เป้าหมาย
และ forecast horizon เดียวกัน

![Python](https://img.shields.io/badge/Python-3.13-blue)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.21-orange)
![scikit--learn](https://img.shields.io/badge/scikit--learn-1.9-f89939)
![statsmodels](https://img.shields.io/badge/statsmodels-0.14-informational)
![License](https://img.shields.io/badge/License-Academic-lightgrey)

---

## สารบัญ

- [ภาพรวม](#ภาพรวม)
- [คุณสมบัติหลัก](#คุณสมบัติหลัก)
- [พื้นที่ศึกษา](#พื้นที่ศึกษา)
- [ข้อมูลที่ใช้](#ข้อมูลที่ใช้)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [ความต้องการของระบบ](#ความต้องการของระบบ)
- [การติดตั้ง](#การติดตั้ง)
- [วิธีใช้งาน](#วิธีใช้งาน)
- [การตั้งค่า](#การตั้งค่า)
- [ระเบียบวิธี](#ระเบียบวิธี)
- [แบบจำลอง](#แบบจำลอง)
- [การประเมินผล](#การประเมินผล)
- [ผลลัพธ์ที่ได้](#ผลลัพธ์ที่ได้)
- [ข้อควรทราบและข้อจำกัด](#ข้อควรทราบและข้อจำกัด)
- [เอกสารเพิ่มเติม](#เอกสารเพิ่มเติม)
- [ผู้พัฒนา](#ผู้พัฒนา)

---

## ภาพรวม

โครงการนี้พัฒนาและเปรียบเทียบแบบจำลองสำหรับพยากรณ์ SLA รายเดือนล่วงหน้า 1 เดือน (t+1)
ใน 4 สถานีของอ่าวไทยตอนบน โดยใช้ข้อมูลดาวเทียม SLA ร่วมกับตัวแปรบรรยากาศจาก ERA5

งานทั้งหมดอยู่ในโน้ตบุ๊กเดียว:

```text
SLA_predict_SARIMA_RF_LSTM.ipynb
```

**วัตถุประสงค์**

1. เตรียมข้อมูล SLA และ ERA5 รายเดือนจากไฟล์ NetCDF
2. สกัดค่าเฉลี่ยเชิงพื้นที่รอบตำแหน่งศึกษา
3. สร้างชุดข้อมูลสำหรับการพยากรณ์ SLA ล่วงหน้า 1 เดือน
4. เปรียบเทียบประสิทธิภาพของ SARIMA, Random Forest และ single-layer LSTM
5. ประเมินแบบจำลองด้วยชุดทดสอบที่ไม่ถูกใช้ในการปรับแต่งโมเดล

---

## คุณสมบัติหลัก

- **ตรวจสอบไฟล์ NetCDF ก่อนฝึกโมเดล** — ตรวจมิติ พิกัด ชื่อตัวแปร หน่วย ช่วงเวลา
  เดือนที่ขาด timestamp ซ้ำ ทิศของ latitude ระยะห่าง grid และ NaN/Inf
  หากไม่ผ่านโปรแกรมจะหยุดทันที
- **แปลงหน่วยจาก metadata จริง** ไม่ hard-code (SST: K → °C, SLP: Pa → hPa)
- **preprocessing แยก 3 branch** ตามธรรมชาติของแต่ละโมเดล ไม่บังคับให้ใช้ตารางเดียวกัน
- **การเปรียบเทียบที่ควบคุมตัวแปร** — split เดียวกัน target เดียวกัน seed เดียวกัน
  และ scaler ไม่เคยเห็นข้อมูล Test
- **บันทึกหลักฐานการคัดเลือกโมเดลครบ** ทั้ง grid search ทุก combination
  ผลการทดสอบความนิ่ง residual diagnostics และ feature importance
- **กราฟพร้อมใช้ในรายงาน** — แผนที่สถานี ACF/PACF learning curve
  และ actual vs predicted รายสถานี (ใช้ชุดสีที่ผ่าน colorblind-safe validator)

---

## พื้นที่ศึกษา

| สถานี | Latitude | Longitude |
|---|---:|---:|
| Wat Khun Samut Chin | 13.5061216 | 100.5312743 |
| Laem Chabang Port | 13.0475510 | 100.8688260 |
| Upper Gulf Offshore | 12.6250000 | 100.3750000 |
| Phetchaburi Bangkawe | 13.0997140 | 100.0654660 |

ข้อมูลแต่ละสถานีเฉลี่ยเชิงพื้นที่ภายในขอบเขต **±0.25°** จากพิกัดสถานี
หรือประมาณ **0.5° × 0.5°**

---

## ข้อมูลที่ใช้

### SLA (Sea Level Anomaly)

```text
Rawdata/sla_monthly_1993_2024.nc     # ตัวแปร: sla
```

### ERA5 (ตัวแปรบรรยากาศ)

```text
Rawdata/era5_monthly_1993_2024.nc
```

| ตัวแปร | ชื่อที่รองรับในไฟล์ | หน่วยหลังแปลง |
|---|---|---|
| Sea Surface Temperature | `sst`, `sea_surface_temperature` | °C |
| Mean Sea Level Pressure | `msl`, `mean_sea_level_pressure` | hPa |
| ลมแนวตะวันออก–ตะวันตก ที่ 10 ม. | `u10`, `10m_u_component_of_wind` | ตามไฟล์ต้นฉบับ |
| ลมแนวเหนือ–ใต้ ที่ 10 ม. | `v10`, `10m_v_component_of_wind` | ตามไฟล์ต้นฉบับ |

> โปรแกรมจะหยุดทำงานเมื่อไม่พบไฟล์ ตัวแปร พิกัด หน่วยข้อมูล หรือ grid cell ที่จำเป็น
> เพื่อป้องกันการนำข้อมูลผิดรูปแบบไปฝึกโมเดล

---

## โครงสร้างโปรเจกต์

```text
Demo_SLA/
├── SLA_predict_SARIMA_RF_LSTM.ipynb   # โน้ตบุ๊กหลัก (ทุกขั้นตอน)
├── requirements.txt                   # รายการไลบรารีแบบตรึงเวอร์ชัน
├── README.md
├── 02README.md                        # เอกสารรายละเอียดเชิงลึก
├── .gitignore
│
├── Rawdata/                           # ไฟล์ NetCDF ต้นทาง (ต้องเตรียมเอง)
│   ├── sla_monthly_1993_2024.nc
│   └── era5_monthly_1993_2024.nc
│
├── outputs_fair_comparison/           # ผลลัพธ์: ตาราง กราฟ (สร้างอัตโนมัติ)
│   └── separated_preprocessing/       # หลักฐานการคัดเลือกแบบจำลอง
│
└── train_model_final/                 # ตารางฟีเจอร์รายสถานี (สร้างอัตโนมัติ)
```

โฟลเดอร์ `outputs_fair_comparison/` และ `train_model_final/` ถูกละไว้ใน `.gitignore`
เพราะเป็นผลลัพธ์ที่สร้างใหม่ได้จากการรันโน้ตบุ๊ก

---

## ความต้องการของระบบ

| รายการ | เวอร์ชันที่ใช้พัฒนา |
|---|---|
| Python | 3.13 |
| TensorFlow / Keras | 2.21 / 3.15 |
| scikit-learn | 1.9 |
| statsmodels | 0.14 |
| xarray + netCDF4 | 2026.7 / 1.7 |
| GeoPandas | 1.1 |

- GPU ช่วยลดเวลาฝึก LSTM แต่ไม่ใช่ข้อบังคับ
- หากไม่ติดตั้ง TensorFlow โน้ตบุ๊กจะข้ามส่วน LSTM แล้วรันต่อได้ตามปกติ

---

## การติดตั้ง

```powershell
# 1) โคลนโปรเจกต์
git clone https://github.com/Jariya-aum/Demo_SLA.git
cd Demo_SLA

# 2) สร้างและเปิดใช้งาน virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3) ติดตั้งไลบรารีทั้งหมด
python -m pip install --upgrade pip
pip install -r requirements.txt

# 4) ลงทะเบียน Jupyter kernel
python -m ipykernel install --user --name sla-defence --display-name "Python (SLA Defence)"
```

ติดตั้งเฉพาะไลบรารีหลัก (กรณีไม่ต้องการตรึงเวอร์ชันทั้งชุด):

```powershell
pip install numpy pandas matplotlib xarray netCDF4 scipy statsmodels scikit-learn tensorflow
pip install geopandas shapely folium pyproj contextily openpyxl jupyter ipykernel
```

> `contextily` ใช้ดึง basemap เท่านั้น หากใช้งานไม่ได้ โน้ตบุ๊กยังสร้างแผนที่ด้วย
> Folium หรือวิธีสำรองที่ไม่พึ่ง `contextily` ได้

---

## วิธีใช้งาน

1. วางไฟล์ NetCDF ทั้งสองไฟล์ไว้ในโฟลเดอร์ `Rawdata/`
2. เปิดโปรเจกต์ใน VS Code หรือ Jupyter แล้วเลือก kernel ของ virtual environment
3. รันเซลล์จากบนลงล่าง หรือเลือก **Run All**
4. ตรวจผลจากส่วน **3b. NetCDF Validation** ให้ผ่านก่อนฝึกโมเดล
5. รอให้ SARIMA grid search และการฝึก LSTM ทำงานจนครบ
6. เปิดผลลัพธ์ในโฟลเดอร์ `outputs_fair_comparison/`

```powershell
jupyter notebook "SLA_predict_SARIMA_RF_LSTM.ipynb"
```

---

## การตั้งค่า

โน้ตบุ๊ก **ค้นหาโฟลเดอร์โปรเจกต์เอง** โดยไล่หาไฟล์
`Rawdata/sla_monthly_1993_2024.nc` จากโฟลเดอร์ปัจจุบันขึ้นไปทีละชั้น
จึงย้ายหรือคัดลอกโปรเจกต์ไปเครื่องอื่นได้โดยไม่ต้องแก้ path

หากเก็บข้อมูลไว้ที่อื่น ให้กำหนด `BASE_DIR` เองในเซลล์ Configuration:

```python
BASE_DIR = Path(r"D:\path\to\project")   # แทนที่ find_project_dir()
```

ค่าหลักในการพยากรณ์:

```python
lookback          = 12    # LSTM ใช้ข้อมูลย้อนหลัง 12 เดือน
forecast_horizon  = 1     # พยากรณ์ SLA เดือนถัดไป
seasonal_period   = 12
SEED              = 42
```

---

## ระเบียบวิธี

### การแบ่งข้อมูล

| ชุดข้อมูล | ช่วงเวลา |
|---|---|
| Training | มกราคม 1993 – ธันวาคม 2016 |
| Validation | มกราคม 2017 – ธันวาคม 2019 |
| Testing | มกราคม 2020 – ธันวาคม 2024 |

แบ่งแบบเรียงตามเวลาและไม่มีการสุ่ม เพื่อป้องกันข้อมูลอนาคตรั่วไหลเข้าสู่การฝึกโมเดล

### Target

```text
SLA_target = SLA เดือน t+1
```

Index ของข้อมูลถูกจัดให้ตรงกับเดือนของ target เพื่อให้การแบ่งชุดข้อมูล
สื่อถึงเดือนที่กำลังพยากรณ์จริง

### Features

| แบบจำลอง | ตัวแปรที่ใช้ |
|---|---|
| **Random Forest** (11 ตัว) | `SLA_hist`, `SST`, `SLP`, `u10`, `v10`, `SLA_lag1`, `SLA_lag3`, `SLA_lag6`, `SLA_lag12`, `month_sin`, `month_cos` |
| **LSTM** (7 ตัว × 12 เดือน) | `SLA_hist`, `SST`, `SLP`, `u10`, `v10`, `month_sin`, `month_cos` |
| **SARIMA** | univariate — ประวัติ SLA และรูปแบบฤดูกาลราย 12 เดือน |

LSTM ไม่ใช้คอลัมน์ lag ซ้ำ เพราะโครงสร้าง sequence เก็บลำดับย้อนหลังไว้แล้ว

### การควบคุมความยุติธรรมในการเปรียบเทียบ

- พื้นที่ศึกษา ช่วงข้อมูล และ target เดียวกันทุกโมเดล
- ใช้ชุด Train / Validation / Test เดียวกัน
- Scaler ไม่ถูก fit ด้วยข้อมูล Test
- ใช้ Validation เลือก hyperparameter — Test ใช้เฉพาะการประเมินผลสุดท้าย
- SARIMA พยากรณ์แบบ rolling 1-step-ahead เท่ากับอีกสองโมเดล
- ใช้ `SEED = 42` ทั้ง Random Forest และ LSTM
- มี `assert` ตรวจช่วงข้อมูล ความยาวผลพยากรณ์ และจำนวนผลลัพธ์ 12 รายการ

---

## แบบจำลอง

### 1. SARIMA(p,d,q)(P,D,Q)s

1. ประเมินความแรงของฤดูกาลด้วย STL seasonal strength
2. เลือก seasonal differencing `D`
3. ทดสอบความนิ่งด้วย Augmented Dickey-Fuller test หลัง seasonal differencing
4. เลือก non-seasonal differencing `d`
5. Grid search `p`, `q`, `P`, `Q` แล้วเรียง candidate ด้วย AIC
6. นำ 5 อันดับแรกไปประเมินด้วย Validation RMSE แล้วเลือกค่าต่ำสุด
7. ฝึกใหม่ด้วย Train + Validation แล้วพยากรณ์ Test แบบ rolling 1-step-ahead

```python
p = [0, 1, 2]    q = [0, 1, 2]    P = [0, 1]    Q = [0, 1]    s = 12
```

### 2. Random Forest Regression

```python
random_state = 42
n_jobs       = -1

# grid search บนชุด Validation — 54 ชุดต่อสถานี
n_estimators     = [100, 200, 300, 500, 700, 1000]
max_features     = [1.0, 0.5, "sqrt"]
min_samples_leaf = [1, 2, 4]
```

จำนวนต้นไม้ไม่ได้ถูกล็อกไว้ล่วงหน้า แต่คัดเลือกด้วย Validation RMSE เช่นเดียวกับ
อีกสองพารามิเตอร์ ผลทุกชุดถูกบันทึกไว้ที่ `rf_gridsearch_all_combinations.csv`

> ไม่ใส่ `max_features="log2"` เพราะ RF ใช้ 11 ฟีเจอร์ ทำให้
> `int(sqrt(11)) = int(log2(11)) = 3` ซึ่งเป็นแบบจำลองเดียวกันทุกประการ
> โค้ดคัดออกให้เองจากจำนวนฟีเจอร์จริง ไม่ได้ hard-code

Random Forest ไม่ต้องปรับสเกล เพราะต้นไม้ตัดสินใจด้วย threshold บนลำดับของค่า
และ min-max เป็นการแปลงแบบ monotone จึงไม่เปลี่ยนจุดแบ่ง

### 3. LSTM (ชั้นเดียว)

```text
Input (12 เดือน × 7 ฟีเจอร์)
└── LSTM 64 units — dropout 0.30, recurrent_dropout 0.20
    └── Dense 1 unit
```

```python
epochs = 200    batch_size = 16    patience = 15    shuffle = False    seed = 42
```

ฝึก 2 ขั้น: (1) ฝึกด้วย Train และใช้ Validation ทำ Early Stopping
(2) นำจำนวน epoch ที่ดีที่สุดไปฝึกใหม่ด้วย Train + Validation

ปรับสเกลด้วย `MinMaxScaler` — ขั้นเลือก epoch fit จาก Train เท่านั้น
เมื่อ refit ด้วย Train + Validation จึง fit scaler ใหม่
แล้วแปลงค่าพยากรณ์กลับสู่สเกลจริงด้วย inverse transform

---

## การประเมินผล

| ตัวชี้วัด | ความหมาย |
|---|---|
| MSE | ค่าเฉลี่ยของความคลาดเคลื่อนกำลังสอง |
| MAE | ค่าเฉลี่ยของค่าสัมบูรณ์ของความคลาดเคลื่อน |
| **RMSE** | รากที่สองของ MSE — **ตัวชี้วัดหลัก** มีหน่วยเดียวกับ SLA |
| R² | สัดส่วนความแปรปรวนที่โมเดลอธิบายได้ |

ทุกตัวชี้วัดคำนวณบนหน่วยจริงของ SLA ผลลัพธ์สุดท้ายมี
**3 โมเดล × 4 สถานี = 12 model-station results**

**การอ่านผล** — ควรพิจารณาร่วมกัน ไม่เลือกจากตัวชี้วัดเดียว:
RMSE ต่ำที่สุด → MAE/MSE ต่ำสอดคล้องกัน → R² สูง → ให้ผลสม่ำเสมอในทุกสถานี

---

## ผลลัพธ์ที่ได้

### `outputs_fair_comparison/`

```text
netcdf_validation_summary.csv          # ผลตรวจไฟล์ NetCDF
stations_static_map.png / station_map.png
sla_overview_1993_2024.png
sample_data_table.csv / .xlsx
full_variables_statistics.csv
final_acf_pacf_all_stations.png
final_metrics_3models.csv              # MSE / MAE / RMSE / R² ต่อสถานีต่อโมเดล
test_predictions_3models.csv           # ค่าจริง vs ค่าพยากรณ์รายเดือน
model_settings_3models.csv
final_actual_vs_pred_<station>.png
```

### `outputs_fair_comparison/separated_preprocessing/`

```text
01_data_split_summary.csv
02_sarima_stationarity_results.csv
03_sarima_gridsearch_all_candidates.csv
04_sarima_top5_validation.csv
05_sarima_selected_models.csv
06_sarima_coefficients.csv
07_sarima_residual_diagnostics.csv
08_sarima_test_predictions.csv
09_final_model_metrics.csv
rf_gridsearch_all_combinations.csv     # ทุก combination ของ RF (54 × 4 สถานี)
rf_best_hyperparameters.csv
model_structure_by_station.csv
lstm_training_summary.csv
lstm_test_predictions.csv
```

### `train_model_final/`

```text
<station>_features.csv                 # ชุดฟีเจอร์รายสถานี
```

---

## ข้อควรทราบและข้อจำกัด

- SLA เป็น anomaly และมีค่าติดลบได้ จึงไม่ใช้ log transformation
- การพยากรณ์เป็นแบบ **1-step-ahead** ไม่ใช่การพยากรณ์หลายเดือนแบบ recursive
- ชื่อไฟล์และชื่อตัวแปรใน NetCDF ต้องตรงกับรูปแบบที่โค้ดรองรับ
- Notebook metadata ระบุ Python 3.13 แต่ควรเลือกเวอร์ชันที่เข้ากันได้กับ
  TensorFlow และไลบรารีที่ติดตั้งในเครื่อง
- ผลลัพธ์ใช้ได้กับพื้นที่และช่วงเวลาที่ศึกษาเท่านั้น การนำไปใช้กับพื้นที่อื่น
  ต้องปรับ hyperparameter ใหม่

---

## เอกสารเพิ่มเติม

[02README.md](02README.md) — เอกสารรายละเอียดเชิงลึกของแต่ละขั้นตอน

---

## ผู้พัฒนา

โครงการพยากรณ์ Sea Level Anomaly บริเวณอ่าวไทยตอนบน
สำหรับการศึกษาและเปรียบเทียบแบบจำลองอนุกรมเวลาและการเรียนรู้ของเครื่อง

**License:** ใช้เพื่อการศึกษาและงานวิจัย
