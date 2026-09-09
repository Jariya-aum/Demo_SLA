# assets/gee/ — ภาพ Remote Sensing ที่ export จาก Google Earth Engine

หน้าเว็บ **ไม่เรียก Google Earth Engine โดยตรง** เพราะ GEE ต้องยืนยันตัวตน
(service account / OAuth) ซึ่งจะทำให้ต้องฝังความลับไว้ในโค้ดฝั่งหน้าเว็บ
วิธีที่ใช้แทนคือ export ภาพจาก GEE ไว้ล่วงหน้า แล้ววางไฟล์ในโฟลเดอร์นี้

## วิธีเพิ่มภาพ

1. ใน GEE Code Editor ใช้ `Export.image.toDrive()` (Sentinel-2 หรือ Landsat composite)
   ครอบคลุมอ่าวไทยตอนบน แล้วแปลงเป็น PNG/JPG พร้อมค่าขอบเขต (bounds)
   หรือ publish เป็น XYZ tile service
2. วางไฟล์ภาพไว้ในโฟลเดอร์นี้
3. สร้างไฟล์ `manifest.json` ในโฟลเดอร์เดียวกัน ตามรูปแบบด้านล่าง
   แผนที่จะเพิ่มชั้นข้อมูลให้อัตโนมัติใน Layer control (ถ้าไม่มีไฟล์นี้ก็ข้ามไปเงียบ ๆ)

## รูปแบบ manifest.json

```json
{
  "overlays": [
    {
      "name": "Sentinel-2 True Colour (2024)",
      "type": "image",
      "url": "assets/gee/s2_truecolour_2024.png",
      "bounds": [[12.20, 99.60], [13.90, 101.30]],
      "opacity": 0.85,
      "attribution": "Copernicus Sentinel-2 via Google Earth Engine"
    },
    {
      "name": "Landsat 8/9 Composite (tiles)",
      "type": "tiles",
      "url": "https://earthengine.googleapis.com/v1/projects/<project>/maps/<map-id>/tiles/{z}/{x}/{y}",
      "maxZoom": 14,
      "opacity": 0.9,
      "attribution": "USGS Landsat via Google Earth Engine"
    }
  ]
}
```

`bounds` ของชนิด `image` คือ `[[ใต้, ตะวันตก], [เหนือ, ตะวันออก]]` ตามรูปแบบของ Leaflet

> อย่าใส่ไฟล์ service-account key (`*.json` ที่มี `private_key`) ลงในโฟลเดอร์นี้
> ทุกอย่างใน `webapp/` ถูก publish ขึ้น GitHub Pages แบบสาธารณะ
