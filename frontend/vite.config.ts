import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const page = (name: string) => resolve(import.meta.dirname, name)

// GitHub Pages เสิร์ฟใต้ /<repo>/ ส่วน FastAPI เสิร์ฟที่ราก
// จึงตั้ง base ผ่าน env ตอน build (ดู .github/workflows/deploy-pages.yml)
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        leaflet: page('leaflet.html'),
        maplibre: page('maplibre.html'),
        cesium: page('cesium.html'),
      },
    },
  },
})
