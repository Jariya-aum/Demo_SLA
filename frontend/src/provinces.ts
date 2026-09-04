export type Province = {
  /** ISO 3166-2:TH — ใช้เป็น key ของ <option value> */
  code: string
  nameTh: string
  nameEn: string
  /** [west, south, east, north] — ค่าโดยประมาณ ใช้สำหรับ fitBounds เท่านั้น */
  bbox: [number, number, number, number]
}

/**
 * จังหวัดชายฝั่งอ่าวไทยตอนบน ครอบคลุมพื้นที่ศึกษาทั้ง 4 สถานี
 * bbox เป็นค่าประมาณจากขอบเขตจังหวัด ไม่ใช่ขอบเขตการปกครองที่แม่นยำ
 * ถ้าต้องการขอบเขตจริงให้เปลี่ยนไปโหลด GeoJSON ADM1 แทน
 */
export const PROVINCES: Province[] = [
  { code: 'TH-10', nameTh: 'กรุงเทพมหานคร', nameEn: 'Bangkok', bbox: [100.327, 13.494, 100.938, 13.955] },
  { code: 'TH-11', nameTh: 'สมุทรปราการ', nameEn: 'Samut Prakan', bbox: [100.455, 13.445, 100.945, 13.705] },
  { code: 'TH-20', nameTh: 'ชลบุรี', nameEn: 'Chon Buri', bbox: [100.78, 12.55, 101.68, 13.5] },
  { code: 'TH-21', nameTh: 'ระยอง', nameEn: 'Rayong', bbox: [101.05, 12.55, 101.9, 13.05] },
  { code: 'TH-24', nameTh: 'ฉะเชิงเทรา', nameEn: 'Chachoengsao', bbox: [100.95, 13.28, 101.95, 13.95] },
  { code: 'TH-74', nameTh: 'สมุทรสาคร', nameEn: 'Samut Sakhon', bbox: [100.15, 13.35, 100.55, 13.7] },
  { code: 'TH-75', nameTh: 'สมุทรสงคราม', nameEn: 'Samut Songkhram', bbox: [99.9, 13.2, 100.15, 13.5] },
  { code: 'TH-76', nameTh: 'เพชรบุรี', nameEn: 'Phetchaburi', bbox: [99.3, 12.55, 100.15, 13.3] },
  { code: 'TH-77', nameTh: 'ประจวบคีรีขันธ์', nameEn: 'Prachuap Khiri Khan', bbox: [99.15, 10.9, 100.1, 12.3] },
]

/** ค่า option สำหรับรีเซ็ตกลับไปดูพื้นที่ศึกษาทั้งหมด */
export const ALL_CODE = 'ALL'

/** ขอบเขตรวมของพื้นที่ศึกษา (ครอบทั้ง 4 สถานี) */
export const STUDY_AREA_BBOX: [number, number, number, number] = [99.5, 12.2, 101.3, 13.9]

export function findProvince(code: string): Province | undefined {
  return PROVINCES.find((p) => p.code === code)
}
