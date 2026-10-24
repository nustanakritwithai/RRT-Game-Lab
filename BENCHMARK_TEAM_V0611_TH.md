# RRT Arena V0.6.11 — การทดลอง Team Coordination V2

**วันที่:** 25 ตุลาคม 2026 (Asia/Bangkok)  
**Status:** `PRELIMINARY SIMULATION` — ผลจำลองจาก Chromium / ไม่ใช่ Win Rate ที่สรุปเหนือกว่าอย่างมีนัยสำคัญ  
**Code base:** V0.6.10 `28bd90f` + Team V2 candidate `feat/v0611-team-coordination`  
**GitHub Actions:** https://github.com/nustanakritwithai/RRT-Game-Lab/actions/runs/40133127349

## 1. วิธีทดลอง

- เกมเดียวกัน `index.html`, BLUE B1/B2 ใช้ Memory-Guided RRT + Predictive + Ranged Threat Defense + Keep Moving รุ่นล่าสุดเท่ากัน
- ศัตรู **ยิงไกล 12 ตัว**, ระดับ `balanced`; แผนที่ค่าเริ่มต้น `ruins`; viewport **393×852 px**
- `Independent` ปิด radio และ Team V2 ทั้งหมด / `Cooperative` เปิด radio + split focus + hold friendly fire + lateral fire lane
- Seed **1001–1020** (20 แมตช์ต่อโหมด) รันบน Chromium headless ที่อัตราเวลาเกมคงที่
- ไม่มีการเพิ่ม HP/ดาเมจ/ความเร็วหรือเปลี่ยนพฤติกรรมบอตพื้นฐานเพื่อให้ทีมชนะ

### คำสั่งรันซ้ำ

```bash
node tools/benchmark_swarm.cjs --seeds 1001-1020 --count 12 --difficulty balanced --enemy ranged --team independent --width 393 --height 852 --jobs 3 --out benchmarks/team-v0611/independent.json
node tools/benchmark_swarm.cjs --seeds 1001-1020 --count 12 --difficulty balanced --enemy ranged --team cooperative --width 393 --height 852 --jobs 3 --out benchmarks/team-v0611/cooperative.json
```

## 2. ผลที่บันทึกได้

| Metric | Duo Independent | Duo Cooperative V2 |
|---|---:|---:|
| ชนะ / จำนวนแมตช์ | 20/20 | 20/20 |
| Win Rate | 100% | 100% |
| Wilson 95% interval | 83.9–100% | 83.9–100% |
| อัตราการเลือกเป้าหมายซ้ำ (frame ที่ทั้งสองมี focus) | 42.6% | **24.8%** |
| กระสุนที่ชน/ถูกบล็อกโดยเพื่อนต่อแมตช์ | 1.8 | **0.6** |
| เหตุการณ์หยุดยิงเพื่อรักษาความปลอดภัย (นับสูงสุดครั้ง/0.35s) | 0 | 1.2 |
| การแบ่งเป้าหมายโดย advisor ต่อแมตช์ | 0 | 11.6 |
| การแนะนำตำแหน่งยิงทางข้างเข้าระบบ RRT ต่อแมตช์ | 0 | 0.9 |
| HP ของทีมรวมหลังจบ | 164.3 | **174.4** |
| BLUE รอดเฉลี่ย | 2 | 2 |
| เวลาเฉลี่ยจบแมตช์ | 21.0 วินาที | **19.2 วินาที** |
| ข้อผิดพลาด RRT plan failures เฉลี่ย | 0 | 0 |

**อ่านผลอย่างระมัดระวัง:** การแบ่งเป้าหมายและหลีกเลี่ยงยิงผ่านเพื่อนส่งผลเชิงพฤติกรรมตามที่ทดสอบ แต่อัตราชนะเท่ากันและขนาดตัวอย่างน้อย จึงไม่อาจสรุปได้ว่า Win Rate ดีกว่า 20/20 ต่อโหมดเป็นเพียง smoke/engineering benchmark

## 3. ข้อจำกัดที่ต้องระบุ

- จำนวน 20 แมตช์ต่อโหมดไม่พอพิสูจน์ข้อได้เปรียบด้าน Win Rate เมื่อทุกแมตช์ชนะอยู่แล้ว (ceiling effect)
- แม้ใช้ seed หมายเลขเดียวกัน **ลำดับใช้ RNG ทั่วทั้งเกมอาจต่างกันหลัง Agent เลือกการกระทำต่างกัน** จึงยังไม่ใช่ A/B แบบ common-random-numbers จริงสำหรับทุกเหตุการณ์ ต้องแยก random streams ของ World/Enemy/B1/B2 ในงานวิจัยถัดไป
- ไม่ได้เก็บสถานการณ์ 16/24 ศัตรู และ Mixed ใน benchmark ชุดนี้ แม้ Browser Regression ของโหมดนั้นผ่าน
- Metrics “แยกเป้า” คือเหตุการณ์เปลี่ยนการเลือกเป้าหมาย และ “แนะนำตำแหน่ง” คือการเสนอจุดหมายให้ RRT มิได้แปลว่าทุกครั้งเคลื่อนที่ถึงเป้าหมายหรือกำจัดศัตรูเพิ่ม

## 4. Quality Gate

- Unit tests: pure observation-only, hidden/stale target rejection, teammate obstruction cone, swept-collision callback requirement, no-stat-buffs
- Chromium browser tests: 320/393/1365px สำหรับ Duel, Solo, Melee, Ranged, Mixed, Duo Independent, Duo Cooperative และ visual GREEN rings
- Independent mode: `heldFire=0`, `laneMoves=0`, `focusSplits=0` และ radio ไม่ส่งข้อมูล
- Cooperative mode: live telemetry ค่า finite, ส่งข้อมูล radio จาก sightings ที่ตรวจพบจริง, B2 อยู่ต่อได้หลัง B1 ถูกกำจัด

**หลักฐาน:** Workflow run: https://github.com/nustanakritwithai/RRT-Game-Lab/actions/runs/40133127349  
Artifacts: `team-v0611-independent`, `team-v0611-cooperative` (เก็บเป็น JSON จาก 20 แมตช์ต่อโหมด; retention 30 วัน)

**งานวิจัยถัดไป:** แยก RNG streams; ทดสอบ 100–200 seeds แบบคู่สนามกับศัตรู 16–24 ตัว และรายงาน effect sizes / confidence intervals ก่อนสรุปประสิทธิภาพการร่วมทีม
