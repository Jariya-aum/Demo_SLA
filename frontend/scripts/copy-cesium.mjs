// Cesium ต้องโหลด Workers/Assets/Widgets แบบ static จาก CESIUM_BASE_URL
// จึงคัดลอกจาก node_modules มาไว้ใน public/cesium/ ก่อน dev และ build
import { cp, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/cesium/Build/Cesium')
const target = resolve(root, 'public/cesium')

await rm(target, { recursive: true, force: true })
for (const dir of ['Assets', 'ThirdParty', 'Widgets', 'Workers']) {
  await cp(resolve(source, dir), resolve(target, dir), { recursive: true })
}
console.log('copied Cesium static assets -> public/cesium/')
