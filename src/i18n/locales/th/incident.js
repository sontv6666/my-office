// เหตุขัดข้อง, push, CI และการรายงาน
export default {
  banner: 'เกิดเหตุ: ล้มเหลว 3 ครั้งใน 5 นาที',
  bubble: 'เกิดเรื่องแล้ว!',
  pushed: '🚀 {name} เพิ่ง push ขึ้น {branch}',
  ciRed: '🚨 CI แดง: {label} · {repo}',
  ciRedDefault: 'เทสต์ไม่ผ่าน',
  ciGreen: '✅ CI กลับมาเขียวแล้ว: {label} · {repo}',
  deployed: '🚀 {name} เพิ่ง deploy {label}',
  againFail: 'อีกแล้วเหรอ! {text}',
  report: 'รายงาน: ทำ “{task}” เสร็จแล้ว',
  // a finished turn told with its numbers (life/finish.js): "done · 12 min · 5 file edits"
  finish: { done: 'เสร็จแล้ว', report: 'รายงาน: เสร็จแล้ว', edits: { one: 'แก้ {n} ไฟล์', other: 'แก้ {n} ไฟล์' } },
  reportLeft: 'วางไว้บนโต๊ะผู้อำนวยการแล้ว',
  turn: {
    done: '{name} ทำเสร็จแล้ว',
    body: 'ตาคุณแล้ว: มาดูผลงานหน่อย',
    none: 'ไม่มี session ไหนรอคุณอยู่',
  },
};
