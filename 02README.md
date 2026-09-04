# SLA Prediction: SARIMA, Random Forest และ LSTM

โครงการนี้พัฒนาและเปรียบเทียบแบบจำลองสำหรับ **พยากรณ์ค่าความผิดปกติของระดับน้ำทะเลรายเดือน (Sea Level Anomaly: SLA) ล่วงหน้า 1 เดือน** บริเวณอ่าวไทยตอนบน โดยใช้ข้อมูล SLA ร่วมกับตัวแปรบรรยากาศจาก ERA5

โน้ตบุ๊กหลักของโครงการ:

```text
SLA_predict_SARIMA_RF_LSTM.ipynb
```

## วัตถุประสงค์

1. เตรียมข้อมูล SLA และ ERA5 รายเดือนจากไฟล์ NetCDF
2. สกัดค่าเฉลี่ยเชิงพื้นที่รอบตำแหน่งศึกษา
3. สร้างชุดข้อมูลสำหรับการพยากรณ์ SLA ล่วงหน้า 1 เดือน
4. เปรียบเทียบประสิทธิภาพของแบบจำลอง
   - SARIMA
   - Random Forest Regression (RF)
   - Single-layer Long Short-Term Memory (LSTM)
5. ประเมินแบบจำลองด้วยข้อมูลทดสอบที่ไม่ถูกใช้ในการปรับแต่งโมเดล

---

## พื้นที่ศึกษา

| สถานี | Latitude | Longitude |
|---|---:|---:|
| Wat Khun Samut Chin | 13.5061216 | 100.5312743 |
| Laem Chabang Port | 13.0475510 | 100.8688260 |
| Upper Gulf Offshore | 12.6250000 | 100.3750000 |
| Phetchaburi Bangkawe | 13.0997140 | 100.0654660 |

ข้อมูลในแต่ละสถานีถูกเฉลี่ยภายในขอบเขต **±0.25 องศา** จากพิกัดสถานี หรือพื้นที่รวมประมาณ **0.5° × 0.5°**

---

## ข้อมูลที่ใช้

### 1. ข้อมูล SLA

ไฟล์ตัวอย่าง:

```text
Rawdata/sla_monthly_1993_2024.nc
```

ตัวแปรที่รองรับ:

```text
sla
```

### 2. ข้อมูล ERA5

ไฟล์ตัวอย่าง:

```text
Rawdata/era5_monthly_1993_2024.nc
```

ตัวแปรที่รองรับ:

| ตัวแปร | ชื่อตัวแปรที่รองรับ |
|---|---|
| Sea Surface Temperature | `sst`, `sea_surface_temperature` |
| Mean Sea Level Pressure | `msl`, `mean_sea_level_pressure` |
| ลมแนวตะวันออก–ตะวันตกที่ระดับ 10 เมตร | `u10`, `10m_u_component_of_wind` |
| ลมแนวเหนือ–ใต้ที่ระดับ 10 เมตร | `v10`, `10m_v_component_of_wind` |

โปรแกรมอ่านหน่วยจาก metadata ของไฟล์ และแปลงหน่วยดังนี้:

- SST: Kelvin → องศาเซลเซียส
- SLP: Pascal → hectopascal
- u10 และ v10: คงหน่วยตามไฟล์ต้นฉบับ

> โปรแกรมจะหยุดทำงานเมื่อไม่พบไฟล์ ตัวแปร พิกัด หน่วยข้อมูล หรือ grid cell ที่จำเป็น เพื่อป้องกันการนำข้อมูลผิดรูปแบบไปฝึกโมเดล

---

## การแบ่งข้อมูลตามเวลา

| ชุดข้อมูล | ช่วงเวลา |
|---|---|
| Training | มกราคม 1993 – ธันวาคม 2016 |
| Validation | มกราคม 2017 – ธันวาคม 2019 |
| Testing | มกราคม 2020 – ธันวาคม 2024 |

การแบ่งข้อมูลเป็นแบบเรียงตามเวลาและไม่มีการสุ่ม เพื่อป้องกันข้อมูลอนาคตรั่วไหลเข้าสู่กระบวนการฝึกโมเดล

ค่าหลักในการพยากรณ์:

```python
lookback = 12
forecast_horizon = 1
seasonal_period = 12
```

หมายความว่า LSTM ใช้ข้อมูลย้อนหลัง 12 เดือน และทุกโมเดลพยากรณ์ SLA ของเดือนถัดไป

---

## การสร้างชุดข้อมูล

Target ของแบบจำลองคือ:

```text
SLA_target = SLA เดือน t+1
```

Index ของข้อมูลถูกกำหนดให้ตรงกับเดือนของ Target เพื่อให้การแบ่ง Train, Validation และ Test สื่อถึงเดือนที่กำลังพยากรณ์จริง

### Features สำหรับ Random Forest

Random Forest ใช้ตัวแปรทั้งหมด 11 ตัว:

```text
SLA_hist
SST
SLP
u10
v10
SLA_lag1
SLA_lag3
SLA_lag6
SLA_lag12
month_sin
month_cos
```

### Features สำหรับ LSTM

LSTM ใช้ sequence ต่อเนื่องย้อนหลัง 12 เดือน โดยใช้ตัวแปร:

```text
SLA_hist
SST
SLP
u10
v10
month_sin
month_cos
```

LSTM ไม่ใช้คอลัมน์ lag ซ้ำ เนื่องจากโครงสร้าง sequence ได้เก็บลำดับย้อนหลังไว้แล้ว

### Features สำหรับ SARIMA

SARIMA เป็นแบบจำลองอนุกรมเวลาแบบตัวแปรเดียว โดยใช้ประวัติ SLA และรูปแบบฤดูกาลราย 12 เดือน

---

## แบบจำลอง

### 1. SARIMA

รูปแบบทั่วไป:

```text
SARIMA(p,d,q)(P,D,Q)s
```

ขั้นตอนการเลือกโมเดล:

1. ประเมินความแรงของฤดูกาลด้วย STL seasonal strength
2. เลือก seasonal differencing `D`
3. ทดสอบความนิ่งด้วย Augmented Dickey-Fuller test หลัง seasonal differencing
4. เลือก non-seasonal differencing `d`
5. ทำ grid search สำหรับ `p`, `q`, `P` และ `Q`
6. เรียง candidate ด้วย AIC
7. นำโมเดล AIC ดีที่สุด 5 อันดับแรกไปประเมินด้วย Validation RMSE
8. เลือกโมเดลที่มี Validation RMSE ต่ำที่สุด
9. ฝึกใหม่ด้วย Train + Validation
10. พยากรณ์ชุด Test แบบ rolling 1-step-ahead

ช่วงค้นหาพารามิเตอร์เริ่มต้น:

```python
p = 0, 1, 2
q = 0, 1, 2
P = 0, 1
Q = 0, 1
```

### 2. Random Forest Regression

ค่าคงที่:

```python
random_state = 42
n_jobs       = -1
```

ค่าที่ค้นหาด้วย grid search บนชุด Validation (**54 ชุดต่อสถานี**):

```python
n_estimators     = [100, 200, 300, 500, 700, 1000]   # 6 ค่า
max_features     = [1.0, 0.5, "sqrt"]                # 3 ค่า
min_samples_leaf = [1, 2, 4]                         # 3 ค่า
```

จำนวนต้นไม้ **ไม่ได้ถูกล็อกไว้ล่วงหน้า** แต่ถูกคัดเลือกด้วย Validation RMSE
เช่นเดียวกับอีก 2 พารามิเตอร์ ผลการทดลองทุกชุดถูกบันทึกไว้ที่
`separated_preprocessing/rf_gridsearch_all_combinations.csv` (216 แถว)

> ไม่ใส่ `max_features="log2"` ในการค้นหา เพราะ RF ใช้ 11 ฟีเจอร์ ทำให้
> `int(sqrt(11)) = int(log2(11)) = 3` เท่ากัน จึงเป็นแบบจำลองเดียวกันทุกประการ
> การใส่ทั้งคู่คือการทดลองซ้ำ — โค้ดในเซลล์ 13.1 คัดออกให้เองจากจำนวนฟีเจอร์จริง
> ไม่ได้ hard-code ไว้

Random Forest ไม่ต้องปรับสเกลข้อมูล เนื่องจากต้นไม้ตัดสินใจด้วย threshold บนลำดับของค่า ซึ่งการทำ min-max เป็นการแปลงแบบ monotone จึงไม่เปลี่ยนจุดแบ่ง หลังเลือก hyperparameter จาก Validation แล้วจึงฝึกโมเดลใหม่ด้วย Train + Validation แล้วพยากรณ์ชุด Test

### 3. LSTM

โครงสร้างเครือข่าย (LSTM ชั้นเดียว):

```text
Input
└── LSTM 64 units
    ├── dropout = 0.30
    └── recurrent_dropout = 0.20
└── Dense 1 unit
```

การฝึกโมเดลแบ่งเป็น 2 ขั้น:

1. ฝึกด้วย Train และใช้ Validation สำหรับ Early Stopping
2. นำจำนวน epoch ที่ดีที่สุดไปฝึกโมเดลใหม่ด้วย Train + Validation

การตั้งค่า:

```python
epochs = 200
batch_size = 16
patience = 15
shuffle = False
seed = 42
```

การปรับสเกลใช้ `MinMaxScaler` โดย scaler ในขั้นเลือกจำนวน epoch ถูก fit จากชุด Train เท่านั้น เมื่อ refit ด้วย Train + Validation จึง fit scaler ใหม่ และแปลงค่าพยากรณ์กลับสู่สเกลจริงด้วย inverse transform

---

## ตัวชี้วัดประสิทธิภาพ

โครงการคำนวณตัวชี้วัดบนหน่วยจริงของ SLA:

| ตัวชี้วัด | ความหมาย |
|---|---|
| MSE | ค่าเฉลี่ยของความคลาดเคลื่อนกำลังสอง |
| MAE | ค่าเฉลี่ยของค่าสัมบูรณ์ของความคลาดเคลื่อน |
| RMSE | รากที่สองของ MSE มีหน่วยเดียวกับ SLA |
| R² | สัดส่วนความแปรปรวนที่โมเดลอธิบายได้ |

**RMSE เป็นตัวชี้วัดหลักในการเปรียบเทียบ** เนื่องจากมีหน่วยเดียวกับ SLA และเทียบกับ MAE ได้โดยตรง

ผลลัพธ์สุดท้ายมีทั้งหมด **3 โมเดล × 4 สถานี = 12 model-station results**

---

## การควบคุมความยุติธรรมในการเปรียบเทียบ

โน้ตบุ๊กออกแบบให้โมเดลใช้เงื่อนไขการประเมินร่วมกัน ได้แก่:

- พื้นที่ศึกษาเดียวกัน
- ช่วงข้อมูลเดียวกัน
- Target เป็น SLA ล่วงหน้า 1 เดือนเหมือนกัน
- ชุด Train, Validation และ Test เดียวกัน
- Scaler ไม่ถูก fit ด้วยข้อมูล Test
- ใช้ Validation สำหรับเลือก hyperparameter
- Test ถูกใช้เฉพาะการประเมินผลสุดท้าย
- SARIMA ใช้ rolling 1-step-ahead
- ใช้ seed เดียวกัน (`SEED = 42`) ทั้ง Random Forest และ LSTM
- มี `assert` ตรวจสอบช่วงข้อมูล ความยาวผลพยากรณ์ และจำนวนผลลัพธ์ 12 รายการ

---

## โครงสร้างโฟลเดอร์ที่แนะนำ

```text
D:/defence_sla/
│
├── SLA_predict_SARIMA_RF_LSTM.ipynb
│
├── Rawdata/
│   ├── sla_monthly_1993_2024.nc
│   └── era5_monthly_1993_2024.nc
│
├── outputs_fair_comparison/
│
└── train_model_final/
```

เมื่อย้ายโปรเจกต์ไปเครื่องอื่น ให้แก้ไข path ในเซลล์ Configuration:

```python
BASE_DIR = Path(r"D:\defence_sla")
```

และตรวจสอบค่า:

```python
CONFIG["sla_path"]
CONFIG["era5_path"]
CONFIG["output_dir"]
```

---

## การติดตั้งไลบรารี

สร้าง virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

อัปเกรด pip:

```powershell
python -m pip install --upgrade pip
```

ติดตั้งไลบรารีหลัก:

```powershell
pip install numpy pandas matplotlib xarray netCDF4 scipy statsmodels scikit-learn tensorflow
```

ติดตั้งไลบรารีด้านแผนที่และการส่งออกข้อมูล:

```powershell
pip install geopandas shapely folium pyproj contextily matplotlib-scalebar requests pillow openpyxl
```

ติดตั้ง Jupyter kernel:

```powershell
pip install jupyter ipykernel
python -m ipykernel install --user --name sla-defence --display-name "Python (SLA Defence)"
```

> `contextily` เป็นส่วนเสริมสำหรับ basemap หากใช้งานไม่ได้ โน้ตบุ๊กยังสามารถสร้างแผนที่ด้วย Folium หรือวิธีสำรองที่ไม่พึ่ง `contextily` ได้

---

## วิธีใช้งาน

1. นำไฟล์ SLA และ ERA5 ไปวางในโฟลเดอร์ `Rawdata`
2. เปิดโปรเจกต์ใน VS Code หรือ Jupyter Notebook
3. เลือก Python kernel ของ virtual environment
4. แก้ไข path ในเซลล์ `BASE_DIR` และ `CONFIG`
5. รันเซลล์จากบนลงล่าง หรือเลือก **Run All**
6. ตรวจสอบผลจากส่วน NetCDF Validation ก่อนฝึกโมเดล
7. รอให้ SARIMA grid search และการฝึก LSTM ทำงานครบ
8. เปิดผลลัพธ์ในโฟลเดอร์ `outputs_fair_comparison`

เปิดโน้ตบุ๊กด้วยคำสั่ง:

```powershell
jupyter notebook "SLA_predict_SARIMA_RF_LSTM.ipynb"
```

---

## ผลลัพธ์ที่โปรแกรมสร้าง

ไฟล์สำคัญใน `outputs_fair_comparison` ได้แก่:

```text
netcdf_validation_summary.csv
stations_static_map.png
station_map.png
sla_overview_1993_2024.png
sample_data_table.csv
sample_data_table.xlsx
full_variables_statistics.csv
final_acf_pacf_all_stations.png
final_metrics_3models.csv
test_predictions_3models.csv
model_settings_3models.csv
final_actual_vs_pred_<station>.png
```

โฟลเดอร์ย่อย `separated_preprocessing/` เก็บหลักฐานการคัดเลือกแบบจำลอง:

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
rf_gridsearch_all_combinations.csv     <- ทุก combination ของ RF (54 x 4 สถานี)
rf_best_hyperparameters.csv            <- ค่าที่ดีที่สุดต่อสถานี
model_structure_by_station.csv         <- โครงสร้างแบบจำลองทั้ง 3 โมเดลรายสถานี
lstm_training_summary.csv
lstm_test_predictions.csv
```

ชุดข้อมูล features รายสถานีถูกบันทึกใน:

```text
train_model_final/<station>_features.csv
```

---

## การอ่านผลลัพธ์

ให้พิจารณาโมเดลที่:

1. มี RMSE ต่ำที่สุด (ตัวชี้วัดหลัก)
2. มี MAE และ MSE ต่ำสอดคล้องกัน
3. มี R² สูง
4. ให้ผลสม่ำเสมอในทุกสถานี

ไม่ควรเลือกโมเดลจากตัวชี้วัดเพียงค่าเดียว ควรพิจารณาความแม่นยำและความสม่ำเสมอข้ามสถานีร่วมกัน

---

## หมายเหตุ

- SLA เป็น anomaly และสามารถมีค่าติดลบได้ จึงไม่ใช้ log transformation โดยอัตโนมัติ
- การพยากรณ์ในโน้ตบุ๊กเป็นแบบ **1-step-ahead** ไม่ใช่การพยากรณ์หลายเดือนแบบ recursive
- Notebook metadata ระบุ Python 3.13.14 แต่ควรเลือกเวอร์ชัน Python ที่เข้ากันได้กับ TensorFlow และไลบรารีที่ติดตั้งในเครื่อง
- GPU ช่วยลดเวลาในการฝึก LSTM แต่ไม่ใช่ข้อบังคับ
- หากไม่ติดตั้ง TensorFlow โปรแกรมจะข้ามส่วน LSTM
- ชื่อไฟล์และชื่อตัวแปรใน NetCDF ต้องตรงกับรูปแบบที่โค้ดรองรับ

---

## ผู้พัฒนา

โครงการพยากรณ์ Sea Level Anomaly บริเวณอ่าวไทยตอนบน สำหรับการศึกษาและเปรียบเทียบแบบจำลองอนุกรมเวลาและการเรียนรู้ของเครื่อง
