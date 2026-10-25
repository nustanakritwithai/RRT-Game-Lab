# RRT Arena V0.6.12 — Communication-Only Team Benchmark

**วันที่:** 25 ตุลาคม 2026 (Asia/Bangkok)  
**สถานะ:** ENGINEERING SMOKE TEST / PRELIMINARY — ไม่ใช่หลักฐานว่า Teamwork เพิ่ม Win Rate อย่างมีนัยสำคัญ  
**Code:** V0.6.12 PR #9 (Private Radio Inbox, delayed SIGHTING, TARGET_CLAIM, POSE, independent RNG streams)  
**หลักฐาน CI:** https://github.com/nustanakritwithai/RRT-Game-Lab/actions/runs/40175672027

## การตั้งค่าทดสอบ

- BLUE ตัวเดียวกันจาก V0.6.11 ทั้ง B1/B2 (ไม่เพิ่ม HP/อาวุธ/ความเร็ว/ดาเมจ)
- ศัตรูยิงไกล 12 ตัว, difficulty balanced, ฉาก ruins, จอ 393 × 852
- Seed 1001–1020 จำนวน 20 แมตช์ต่อกลุ่ม (Independent 20 + Cooperative 20)
- Independent: ไม่มีข้อความส่งถึงกัน ไม่มี Team Advisor
- Cooperative: ส่งเฉพาะข้อมูลจาก own sensor และ own position ด้วยคิววิทยุ — `SIGHTING` / `TARGET_CLAIM` / `POSE`; กลยุทธ์จาก Inbox ชั่วคราวเท่านั้น
- Random streams: world / enemy / B1 / B2 / damage / effects แยกกัน; สถานการณ์หลังการตัดสินใจอาจยังแตกต่างกันได้

## ผลจริงจาก GitHub Actions

| Metric | Independent | Cooperative |
|---|---:|---:|
| ชนะ | 20/20 | 20/20 |
| Win Rate | 100% | 100% |
| Wilson 95% interval | 83.9–100% | 83.9–100% |
| HP ทีมเหลือเฉลี่ย | 166.5 | 174.4 |
| จำนวน BLUE รอดเฉลี่ย | 2 | 2 |
| สัดส่วนช่วงเวลา focus ซ้ำกัน | 48.0% | 36.5% |
| กระสุนหยุดที่เพื่อนเฉลี่ย | 1.9 | 1.3 |
| จำนวนหยุดยิงตามข้อจำกัดแนวยิง | 0 | 3.2 |
| การแบ่งเป้าหมายโดย Advisor | 0 | 5.8 |
| การเสนอจุดเปลี่ยนแนวยิง | 0 | 1.1 |
| ข้อความวิทยุที่ได้รับเฉลี่ย | 0 | 271.6 |
| เวลาจบแมตช์เฉลี่ย | 19.1 วินาที | 19.8 วินาที |
| RRT Plan Failures เฉลี่ย | 0 | 0.1 |

**ผลสังเกต:** การร่วมทีมลด Focus Overlap และจำนวนกระสุนที่ถูกบล็อกโดยเพื่อนในชุดจำลองนี้ แต่ Win Rate เท่ากัน (ชนะ 100% ทั้งคู่) และเวลาดำเนินการ Cooperative ไม่ได้เร็วกว่าเสมอไป ไม่สรุปว่าทีมเก่งขึ้นทั่วไป

## Quality / Isolation Gates

- Node Unit Tests ผ่าน รวม POSE ส่งจากพิกัดตัวเอง, ปฏิเสธข้อมูล world_truth/NaN, ข้อความหน่วงเวลา, อายุข้อมูล, การแยกหน่วยความจำและ RNG
- Chromium Browser Regression ผ่าน 320/393/1365px ทั้งโหมดเดิม/ใหม่
- ตรวจในเบราว์เซอร์: ก่อนครบ latency 0.3s ไม่มีพิกัดเพื่อนใน Inbox; หลังส่งถึง B1/B2 มี POSE ที่ถูกจำกัดอายุ; ทดสอบว่ามีวงแหวนเขียวทั้งสองตัว
- ข้อมูล POSE และ SIGHTING อยู่ที่ `radioInbox` เท่านั้น ไม่อัปเดต `danger`, `encounters`, `lastSeen` หรือ Local Sensor Tracks โดยอัตโนมัติ
- ระบบฟิสิกส์ยังอ่านตำแหน่งจริงเพื่อห้ามตัวละคร/กระสุนผ่านกัน อนุญาตเฉพาะระดับ World Collision ไม่ใช่การรับรู้ทางยุทธวิธี

## ข้อจำกัดและงานวิจัยถัดไป

- การทดสอบนี้เป็น engineering smoke test ขนาด 20 ต่อกลุ่ม และอยู่ในช่วง ceiling effect
- การแยก named RNG ทำให้ initial world และ random sequence ของ subsystems แยกจากกัน แต่ **ไม่ได้ล็อกการเคลื่อนที่หรือการใช้ RNG ของศัตรูภายใต้ทุก counterfactual หลังการเปลี่ยนกลยุทธ์**
- จำเป็นต้องทดสอบฝูง 16/24 ตัว, แผนที่ต่างกัน, 100–200 seeds ต่อกลุ่ม, รวม packet loss และวิเคราะห์ paired deltas / ความไวของผลตามเงื่อนไข
- ห้ามอ้างว่าระบบใหม่มี Win Rate สูงขึ้นจากผลชุดนี้

**วิธีรันซ้ำ** (มี Playwright/Chromium ใน CI):

```bash
node tools/benchmark_swarm.cjs --seeds 1001-1020 --count 12 --difficulty balanced --enemy ranged --team independent --width 393 --height 852 --jobs 3 --out independent.json
node tools/benchmark_swarm.cjs --seeds 1001-1020 --count 12 --difficulty balanced --enemy ranged --team cooperative --width 393 --height 852 --jobs 3 --out cooperative.json
```
