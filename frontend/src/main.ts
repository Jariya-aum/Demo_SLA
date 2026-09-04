import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header>
    <h1>SLA Dashboard</h1>
    <p>พยากรณ์ค่าความผิดปกติของระดับน้ำทะเลรายเดือน — อ่าวไทยตอนบน</p>
  </header>
  <main id="content"></main>
`
