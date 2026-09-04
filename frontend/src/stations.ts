export type Station = {
  id: string
  name: string
  lat: number
  lon: number
}

/** 4 สถานีศึกษาในอ่าวไทยตอนบน (ตรงกับที่ใช้ในโน้ตบุ๊ก) */
export const STATIONS: Station[] = [
  { id: 'khun_samut_chin', name: 'Wat Khun Samut Chin', lat: 13.5061216, lon: 100.5312743 },
  { id: 'laem_chabang', name: 'Laem Chabang Port', lat: 13.047551, lon: 100.868826 },
  { id: 'upper_gulf_offshore', name: 'Upper Gulf Offshore', lat: 12.625, lon: 100.375 },
  { id: 'phetchaburi_bangkawe', name: 'Phetchaburi Bangkawe', lat: 13.099714, lon: 100.065466 },
]

/** จุดกึ่งกลางพื้นที่ศึกษา */
export const CENTER = { lat: 13.07, lon: 100.46 }

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors'
