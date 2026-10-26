# RRT ARENA V0.6.17 — Combat Target & Information Efficiency

## เป้าหมาย
ต่อยอดจาก Production V0.6.16 (SHA `393be33c47ae0fcf7662dd66f44880c567c4ad01`) ให้ B1, B2, R1, R2 รับรู้ภัยที่กำลังเคลื่อนเข้าหาได้ดีขึ้น แยกข้อมูลเก่าออกจากการพบจริง และลดการส่งรายงานตำแหน่งซ้ำที่ไม่เพิ่มหลักฐาน โดยยังใช้ตัวละคร AI รุ่นเดียวกันทุกฝ่ายและ **ห้ามปรับพลัง HP / Damage / Speed / Ammo / Fire Rate**.

## หลักฐาน Baseline จาก GitHub Actions
CI: https://github.com/nustanakritwithai/RRT-Game-Lab/actions/runs/40239040628

Duel2 quality artifact 4 seeds × 3 รูปแบบ = 12 simulations, 25 seconds / match:
- Independent: BLUE 42.5 shots, RED 45.25 shots, sidestep 1.25/match, friendly blocks 1.0/match
- Cooperative: BLUE 44.25 shots, RED 42.0 shots, sidestep 1.5/match, friendly blocks 1.0/match; accepted radio evidence 625 pieces / 4 matches
- 100% packet loss: no delivered radio. ทุก 12 แมตช์ยังไม่จบภายใน 25 วินาที — ไม่สามารถอ้าง Win Rate ได้
- เป้าหมายรุ่นเดิม: เลือก visible ที่ใกล้ที่สุดเป็นหลัก โดยไม่มี relative closing-speed threat score
- ข่าวสารรุ่นเดิม: ส่งทุก ๆ ~0.65s ต่อ sighting แม้ไม่มีข้อมูลตำแหน่งใหม่

## สิ่งที่ปรับ
1. **Local closing-threat priority** — ใช้การเปลี่ยนแปลงระยะทางจาก sensor ที่แต่ละตัวเห็นจริงสองครั้งติดต่อกัน; เป้าหมายที่กำลังปิดระยะอย่างรวดเร็วสามารถมีความเร่งด่วนสูงกว่าเป้าที่อยู่ใกล้แต่กำลังถอย
2. **Target persistence / freshness** — ยังคงเป้าหมายก่อนเมื่อคะแนนต่างกันน้อย; เป้าที่มองเห็นจริงยังมีลำดับเหนือ memory; ข้อมูลจำที่เก่าเกินไปถูกลดน้ำหนัก
3. **Delta + bounded heartbeat radio** — ไม่ส่งรายงานตำแหน่งที่ขยับไม่ถึง threshold ซ้ำ เพียงเพราะครบ interval แต่ต้องส่ง heartbeat ใหม่ภายใน 2.25 วินาทีเพื่อรองรับ Packet Loss (ข้อความเดิม TTL 3.5s)
4. **Symmetry** — ทั้ง BLUE และ RED ใช้ policy และค่าที่สมมาตรกัน; ไม่เปลี่ยนการยิง สิทธิ์มองเห็น ระยะอาวุธ ฟิสิกส์ หรือเซนเซอร์ของอีกฝ่าย
5. **Telemetry** — เก็บจำนวนครั้งเปลี่ยนเป้า ความซ้ำการเลือกเป้าหมายภายในทีม และจำนวนรายงานซ้ำที่ไม่ส่ง; แสดงผ่าน Debug, Replay และ Benchmark เพื่อวัดการเปลี่ยนแปลงจริง

## TDD & Release Gate
- RED: PR #17 commit `0be17243b7603b7217cca502c36fa1d7b8e5c24b` Unit Tests ล้มเหลวที่ threat ranking / stale memory / duplicate packet / missing instrumentation ตามคาด
- GREEN: ต้องผ่าน targeted tests และ regression บน exact HEAD ล่าสุด ทั้ง Node, Chromium 320/393/1365, original 1v1/swarm, PeerMesh และ Independent/Cooperative simulations
- Release: Merge โดยตรวจ expected head SHA, GitHub Pages Deploy success, public title V0.6.17 และตรวจหน้าจอแบบ live
- รายงานผลแยก SIMULATION ออกจาก PRODUCTION READBACK — ไม่มีการอ้างว่ารุ่นใหม่ชนะมากขึ้นหรือเกิด intelligence แบบเรียนรู้ด้วยตนเองหากไม่มีหลักฐาน

## ข้อจำกัด
- Closing rate คือ **relative range change** ที่ประมวลจากภาพที่เห็น ไม่ใช่ velocity ของศัตรูใน World State; จึงอาจรวมผลการเคลื่อนที่ของเจ้าของเซนเซอร์เอง
- การลดส่งข้อมูลอาจเปลี่ยนความสดของ radio hints; heartbeat คือ fallback มีขอบเขต ไม่ใช่รับประกัน delivery
- 4 seeds × 25 วินาทีเป็น exploratory sample เท่านั้น ต้องขยาย paired trials 100–200 seeds, 16–24 bots, 1v2/2v2 และใช้ confidence intervals ก่อนสรุปประสิทธิภาพ
