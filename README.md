# SLA Prediction — SARIMA · Random Forest · LSTM

พยากรณ์ค่าความผิดปกติของระดับน้ำทะเลรายเดือน (Sea Level Anomaly: SLA) ล่วงหน้า 1 เดือน
บริเวณอ่าวไทยตอนบน โดยเปรียบเทียบแบบจำลอง 3 ชนิดบนข้อมูล ชุดแบ่งข้อมูล เป้าหมาย
และ forecast horizon เดียวกัน พร้อมเว็บแดชบอร์ดสำหรับแสดงผลเชิงพื้นที่

![Python](https://img.shields.io/badge/Python-3.13-blue)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.21-orange)
![scikit--learn](https://img.shields.io/badge/scikit--learn-1.9-f89939)
![statsmodels](https://img.shields.io/badge/statsmodels-0.14-informational)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6)
![Vite](https://img.shields.io/badge/Vite-8.2-646cff)
![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009688)
![License](https://img.shields.io/badge/License-Academic-lightgrey)

**เดโมออนไลน์:** <https://jariya-aum.github.io/Demo_SLA/>

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
- [เว็บแดชบอร์ด](#เว็บแดชบอร์ด)
- [Web Map App แสดงผลการศึกษา (`webapp/`)](#web-map-app-แสดงผลการศึกษา-webapp)
- [การนำขึ้นระบบ](#การนำขึ้นระบบ)
- [ข้อควรทราบและข้อจำกัด](#ข้อควรทราบและข้อจำกัด)
- [เอกสารเพิ่มเติม](#เอกสารเพิ่มเติม)
- [ผู้พัฒนา](#ผู้พัฒนา)

---

## ภาพรวม

โครงการนี้พัฒนาและเปรียบเทียบแบบจำลองสำหรับพยากรณ์ SLA รายเดือนล่วงหน้า 1 เดือน (t+1)
ใน 4 สถานีของอ่าวไทยตอนบน โดยใช้ข้อมูลดาวเทียม SLA ร่วมกับตัวแปรบรรยากาศจาก ERA5

โปรเจกต์แบ่งเป็นส่วนที่ใช้งานแยกกันได้:

| ส่วน | ที่อยู่ | หน้าที่ |
|---|---|---|
| งานวิเคราะห์และสร้างแบบจำลอง | `SLA_predict_SARIMA_RF_LSTM.ipynb` | เตรียมข้อมูล ฝึกและเปรียบเทียบ 3 แบบจำลอง |
| **Web Map App แสดงผลการศึกษา** | `webapp/` | แผนที่ + กราฟผล SLA / ERA5 / SARIMA / RF / LSTM (static, ขึ้น GitHub Pages) |
| สคริปต์แปลงข้อมูลให้เว็บ | `scripts/build_web_data.py` | อ่านผลจากโน้ตบุ๊ก แล้วเขียนเป็น CSV/GeoJSON ใน `webapp/data/` |
| เดโมแผนที่รุ่นก่อน | `frontend/` + `backend/` | เดโม Leaflet / MapLibre / Cesium และโครง API (ไม่ได้ deploy แล้ว) |

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
├── requirements.txt                   # ไลบรารี Python ของงานวิเคราะห์ (ตรึงเวอร์ชัน)
├── README.md
├── 02README.md                        # เอกสารรายละเอียดเชิงลึก
├── .gitignore
│
├── .github/workflows/
│   └── deploy-pages.yml               # publish webapp/ ขึ้น GitHub Pages (ไม่มี build step)
│
├── Rawdata/                           # ไฟล์ NetCDF ต้นทาง (ต้องเตรียมเอง)
│   ├── sla_monthly_1993_2024.nc
│   └── era5_monthly_1993_2024.nc
│
├── scripts/
│   └── build_web_data.py              # แปลงผลการศึกษา -> webapp/data/
│
├── webapp/                            # Web Map App แสดงผลการศึกษา (static)
│   ├── index.html                     # 5 เมนู: Overview / SLA / ERA5 / Model Results / Report
│   ├── css/style.css
│   ├── js/                            # data.js, charts.js, map.js, report.js, app.js
│   ├── data/                          # CSV / GeoJSON / meta.json (สร้างจากสคริปต์)
│   ├── assets/gee/                    # ภาพ remote sensing ที่ export จาก GEE
│   └── README.md                      # รายละเอียดของเว็บ
│
├── frontend/                          # เว็บแดชบอร์ด (Vite + TypeScript)
│   ├── index.html                     # หน้ารวมลิงก์เดโม
│   ├── leaflet.html / maplibre.html / cesium.html
│   ├── vite.config.ts                 # multi-page build + base path
│   ├── scripts/
│   │   ├── copy-cesium.mjs            # คัดลอก static asset ของ Cesium
│   │   └── copy-to-backend.mjs        # คัดลอก dist/ ไป backend/static/
│   └── src/
│       ├── main.ts                    # หน้ารวม
│       ├── stations.ts                # พิกัด 4 สถานี (ใช้ร่วมกันทุกเดโม)
│       ├── provinces.ts               # ขอบเขตจังหวัดสำหรับ dropdown
│       ├── style.css
│       └── demos/                     # โค้ดแผนที่แยกตามไลบรารี
│
├── backend/                           # FastAPI (เสิร์ฟ API + web root)
│   ├── app/main.py
│   ├── requirements.txt
│   └── Procfile
│
├── outputs_fair_comparison/           # ผลลัพธ์: ตาราง กราฟ (สร้างอัตโนมัติ)
│   └── separated_preprocessing/       # หลักฐานการคัดเลือกแบบจำลอง
│
└── train_model_final/                 # ตารางฟีเจอร์รายสถานี (สร้างอัตโนมัติ)
```

โฟลเดอร์ `outputs_fair_comparison/`, `train_model_final/`, `frontend/dist/`,
`frontend/public/cesium/` และ `backend/static/` ถูกละไว้ใน `.gitignore`
เพราะสร้างใหม่ได้จากการรันโน้ตบุ๊กหรือ `npm run build`

> **ห้าม commit ไฟล์ service account key** (`ee-*.json`, `service-account*.json`)
> repository นี้เป็นสาธารณะ — `.gitignore` กันไว้ให้แล้ว

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
| Node.js / npm | 22 ขึ้นไป / 11 (เฉพาะส่วนเว็บ) |
| FastAPI + Uvicorn | 0.141 / 0.52 (เฉพาะส่วนเว็บ) |

- ส่วนเว็บแดชบอร์ดไม่จำเป็นต้องติดตั้ง หากต้องการรันเฉพาะโน้ตบุ๊ก
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

### ส่วนเว็บแดชบอร์ด (ไม่บังคับ)

```powershell
# frontend
cd frontend
npm install

# backend — ใช้ virtual environment แยกจากโน้ตบุ๊กได้
cd ../backend
pip install -r requirements.txt
```

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

### รันเว็บแดชบอร์ด

```powershell
# โหมดพัฒนา — hot reload ที่ http://localhost:5173
cd frontend
npm run dev

# build ใช้งานจริง (postbuild คัดลอก dist/ ไป backend/static/ ให้อัตโนมัติ)
npm run build

# เสิร์ฟทั้ง API และหน้าเว็บด้วย FastAPI ที่ http://localhost:8000
cd ../backend
uvicorn app.main:app --reload --port 8000
```

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `npm run dev` | Vite dev server (เรียก `copy:cesium` ให้ก่อนอัตโนมัติ) |
| `npm run build` | `tsc` ตรวจ type แล้ว build ทั้ง 4 หน้าลง `dist/` |
| `npm run preview` | เปิด `dist/` ด้วย static server เพื่อตรวจก่อน deploy |

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

## เว็บแดชบอร์ด

หน้าเว็บเป็น **multi-page build** ของ Vite — หน้ารวมหนึ่งหน้า และหน้าเดโมแผนที่
สามไลบรารีที่ใช้ข้อมูลสถานีชุดเดียวกันจาก `src/stations.ts`
เพื่อเปรียบเทียบความเหมาะสมของแต่ละ Web Map API กับงาน SLA

| หน้า | ไลบรารี | จุดเด่น |
|---|---|---|
| `index.html` | — | หน้ารวมลิงก์และคำอธิบายแต่ละเดโม |
| `leaflet.html` | Leaflet 1.9.4 | แผนที่ 2 มิติ raster tile เบาที่สุด เหมาะกับหมุดและ popup |
| `maplibre.html` | MapLibre GL JS 6.7.0 | WebGL + vector tile หมุน/เอียงมุมกล้องได้ มี dropdown เลือกจังหวัด |
| `cesium.html` | CesiumJS 1.145.0 | ลูกโลก 3 มิติ รองรับ terrain และแกนเวลา |

**Backend** (`backend/app/main.py`) เป็นโครง FastAPI สำหรับต่อยอด API พยากรณ์
ปัจจุบันมี `GET /health` (health check), `GET /api` (ข้อมูลบริการ), `/docs`
(เอกสาร OpenAPI) และ mount `backend/static/` ไว้ที่ `/` เพื่อเสิร์ฟหน้าเว็บ

**Base path** — `frontend/vite.config.ts` อ่านค่า `VITE_BASE` จาก environment
ค่าเริ่มต้นคือ `/` (สำหรับ FastAPI) ส่วน workflow ตั้งเป็น `/Demo_SLA/` ตอน deploy
ขึ้น GitHub Pages โค้ดจึงอ้างลิงก์ผ่าน `import.meta.env.BASE_URL` และ `%BASE_URL%`
แทนการ hard-code เส้นทาง

> Cesium ต้องโหลด `Workers/`, `Assets/`, `Widgets/` แบบ static
> สคริปต์ `copy:cesium` จึงคัดลอกจาก `node_modules` มาไว้ที่ `public/cesium/`
> ก่อน `dev` และ `build` ทุกครั้ง

---

## Web Map App แสดงผลการศึกษา (`webapp/`)

ระบบแสดงผล ไม่ใช่ระบบ real-time — หน้าเว็บอ่านไฟล์ผลการศึกษาที่คำนวณไว้แล้วเท่านั้น
ไม่ฝึกแบบจำลอง ไม่คำนวณค่าพยากรณ์ และไม่แก้ผลทางวิทยาศาสตร์ใด ๆ
รายละเอียดเต็มอยู่ใน [`webapp/README.md`](webapp/README.md)

**5 เมนูหลัก**

| เมนู | แสดงอะไร |
|---|---|
| Overview | แผนที่ 4 สถานี + Study box ±0.25°, พิกัด, SLA ล่าสุด, แนวโน้ม, Best model |
| SLA Analysis | อนุกรมเวลา SLA + เส้นแนวโน้ม, Mean/Min/Max/SD, ค่าเฉลี่ยรายเดือนตามปฏิทิน |
| Meteorological Variables | อนุกรมเวลา SST / SLP / u10 / v10 จาก ERA5 |
| Model Results & Forecast | ตารางเปรียบเทียบ 3 แบบจำลอง, Observed vs Predicted, scatter 1:1, residual, Historical→Prediction→Forecast, RF feature importance |
| รายงานอัตโนมัติ · Report | เดชบอร์ดรายงาน — บทสรุปผู้บริหาร, ข้อค้นพบสำคัญ, ตารางที่ 1–6, รายงานรายสถานี, ภาคผนวกวิธีการ, ปุ่มพิมพ์เป็น PDF |

หน้ารายงานเรียบเรียงบทสรุปและตารางใหม่จากไฟล์ใน `webapp/data/` ทุกครั้งที่เปิด
ไม่มีตัวเลขหรือข้อสรุปใดเขียนค้างไว้ในหน้าเว็บ — รัน `scripts/build_web_data.py` ใหม่
แล้วรายงานเปลี่ยนตามข้อมูลเองทั้งฉบับ ค่าที่เป็นการสรุปเชิงพรรณนา (อันดับ, ค่าเฉลี่ย
ข้ามสถานี, ส่วนต่างร้อยละ) กำกับไว้ในตารางทุกจุด และค่าที่ไม่มีในไฟล์แสดงเป็น `N/A`

**สร้าง/อัปเดตไฟล์ข้อมูลของเว็บ**

```bash
# ต้องรันโน้ตบุ๊กให้ได้ outputs_fair_comparison/ ก่อน
python scripts/build_web_data.py

# ถ้าผลการศึกษาอยู่คนละที่กับ repo ให้ระบุเอง
python scripts/build_web_data.py --results "<path>/outputs_fair_comparison"
```

สคริปต์อ่าน `Rawdata/*.nc` และไฟล์ผลจากโน้ตบุ๊ก แล้วเขียน CSV / GeoJSON / `meta.json`
ลง `webapp/data/` โดยคัดลอกค่า metric และค่าพยากรณ์มาตรง ๆ ไม่ปัดเศษและไม่คำนวณใหม่

**เปิดดูในเครื่อง**

```bash
cd webapp
python -m http.server 8000     # แล้วเปิด http://localhost:8000
```

> เปิดไฟล์ด้วย `file://` ไม่ได้ เพราะเบราว์เซอร์บล็อก `fetch()` ของไฟล์ใน `data/`

**สิ่งที่ยังไม่มีในผลการศึกษา** — งานวิจัยพยากรณ์แบบ 1-step-ahead บนชุด Test
(2020–2024) เท่านั้น ไม่มีค่าพยากรณ์ล่วงหน้าหลังปี 2024
`webapp/data/forecast.csv` จึงมีแต่หัวตาราง และหน้าเว็บแสดง **N/A** ตามจริง

---

## การนำขึ้นระบบ

### GitHub Pages (Web Map App)

ทุกครั้งที่ push แตะ `webapp/` บน `main` workflow
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
จะคัดลอกโฟลเดอร์ `webapp/` ทั้งก้อน (ไม่ต้อง build) แล้ว force push ลงแบรนช์ `gh-pages`

```text
https://jariya-aum.github.io/Demo_SLA/
```

ตั้งค่าใน **Settings -> Pages** เป็น *Deploy from a branch* -> `gh-pages` / `(root)`
สั่งรันเองได้จากแท็บ **Actions -> Deploy web map app to GitHub Pages -> Run workflow**

`webapp/` ใช้ relative path ทั้งหมดและโหลดไลบรารีจาก CDN จึงทำงานได้ทั้งใต้ path ย่อย
ของ Pages และเมื่อเปิดผ่านเว็บเซิร์ฟเวอร์ในเครื่อง

> แบรนช์ `gh-pages` เก็บเฉพาะผลลัพธ์ build และถูกเขียนทับทุกครั้ง — ห้ามแก้ด้วยมือ
> ประวัติของโค้ดจริงอยู่ที่ `main` เท่านั้น

> หน้าเว็บบน Pages เป็น static ล้วน จึงไม่มี API ของ backend
> หากต้องการใช้งาน API ต้อง deploy `backend/` แยกต่างหาก

### Backend

`backend/Procfile` และ `backend/.gcloudignore` เตรียมไว้สำหรับ deploy
แบบ container/buildpack เช่น Cloud Run

```text
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

ตั้ง environment variable `ALLOWED_ORIGINS` เป็นรายการ origin ที่อนุญาต
คั่นด้วยจุลภาค — ค่าเริ่มต้นครอบคลุมเฉพาะ dev server ในเครื่อง

---

## ข้อควรทราบและข้อจำกัด

- SLA เป็น anomaly และมีค่าติดลบได้ จึงไม่ใช้ log transformation
- การพยากรณ์เป็นแบบ **1-step-ahead** ไม่ใช่การพยากรณ์หลายเดือนแบบ recursive
- ชื่อไฟล์และชื่อตัวแปรใน NetCDF ต้องตรงกับรูปแบบที่โค้ดรองรับ
- Notebook metadata ระบุ Python 3.13 แต่ควรเลือกเวอร์ชันที่เข้ากันได้กับ
  TensorFlow และไลบรารีที่ติดตั้งในเครื่อง
- ผลลัพธ์ใช้ได้กับพื้นที่และช่วงเวลาที่ศึกษาเท่านั้น การนำไปใช้กับพื้นที่อื่น
  ต้องปรับ hyperparameter ใหม่
- เว็บแดชบอร์ดยังแสดงเฉพาะตำแหน่งสถานี ยังไม่ได้เชื่อมผลพยากรณ์จากโน้ตบุ๊ก
- bundle ของ CesiumJS ใหญ่ประมาณ 4 MB (gzip ~1.1 MB) หน้า `cesium.html`
  จึงโหลดช้ากว่าอีกสองหน้าอย่างเห็นได้ชัด

---

## เอกสารเพิ่มเติม

[02README.md](02README.md) — เอกสารรายละเอียดเชิงลึกของแต่ละขั้นตอน

---

## ผู้พัฒนา

โครงการพยากรณ์ Sea Level Anomaly บริเวณอ่าวไทยตอนบน
สำหรับการศึกษาและเปรียบเทียบแบบจำลองอนุกรมเวลาและการเรียนรู้ของเครื่อง

**License:** ใช้เพื่อการศึกษาและงานวิจัย
