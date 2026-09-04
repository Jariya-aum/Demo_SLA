// คัดลอกผลลัพธ์ vite build ไปเป็น web root ของ FastAPI
// ผูกกับ npm script `postbuild` จึงทำงานอัตโนมัติทุกครั้งที่ build
import { cp, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'dist')
const target = resolve(root, '..', 'backend', 'static')

try {
  await stat(source)
} catch {
  console.error(`ไม่พบ ${source} — ต้องรัน vite build ก่อน`)
  process.exit(1)
}

// ลบของเดิมก่อน กัน asset เก่าที่ hash เปลี่ยนแล้วค้างอยู่
await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true })
console.log(`copied dist -> backend/static/`)
