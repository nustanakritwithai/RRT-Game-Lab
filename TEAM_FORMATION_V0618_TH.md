# RRT ARENA — Hierarchical Buddy / Group / Squad Experiment

**สถานะ:** V0.8.0 Release Candidate — ยืนยันสถานะ Production เฉพาะเมื่อ Merge + Pages Deploy + Live Readback ผ่าน  
**ฐาน:** main PeerMesh Tactical V0.7 + PeerMesh Lab V1.2, SHA 501458e548abee73ae149944709347ed14fcac2b

## สมมติฐานการทดลอง

ขยายความร่วมมือของ Agent โดยไม่เพิ่มพลัง ไม่สลับโมเดล และไม่สร้างผู้บัญชาการกลาง
ทุกตัวใช้ Memory-Guided RRT, direct visual sensing, private enemy-memory, evidence-ledger,
threat-aware targeting, fire-lane protection, BID / ACK negotiation แบบเดียวกับ Duel 2v2

### โครงสร้างที่ผู้ใช้กำหนด

- **Buddy Team** = 2 หรือ 3 Agent
- **Group** = 2 Buddy Teams; รองรับ 2+2, 2+3, 3+3
- **Squad (หมู่)** = 2 Groups; รองรับ (2+2)+(2+2), (2+3)+(2+3), (3+3)+(3+3)

| URL \`formation\` | องค์ประกอบต่อฝ่าย | โหมดจำลอง |
|---|---|---|
| buddy2 | 2 | 2v2 — Legacy default |
| buddy3 | 3 | 3v3 |
| group22 | 2+2 | 4v4 |
| group23 | 2+3 | 5v5 |
| group33 | 3+3 | 6v6 |
| squad2222 | (2+2)+(2+2) | 8v8 |
| squad2323 | (2+3)+(2+3) | 10v10 |
| squad3333 | (3+3)+(3+3) | 12v12 |

ตัวอย่าง URL บน Branch Preview เมื่อทดสอบผ่าน:
\`?mode=duel2&formation=group23&dteam=coop&seed=83\`

## สถาปัตยกรรม

### 1. Organizational topology ไม่ใช่ command hierarchy

\`rrt_arena_formation_v0618.js\` สร้าง roster, membership, และคู่เชื่อม \`links\` โดยรับแค่
ชื่อ preset และ side เท่านั้น **ไม่มี** ตำแหน่งศัตรู สถานะสุขภาพ รายงานภาพโลกจริง
ประวัติหน่วยอื่น หรือ commander

Topology ใช้การเชื่อมแบบ peer-to-peer:
- ทุกคนภายใน Buddy สื่อสารถึงกันโดยตรง
- สมาชิกของ Buddy สองทีมใน Group เชื่อมเป็นคู่ทางขวาง
- สมาชิกจาก Group สองกลุ่มใน Squad เชื่อมเป็นคู่ทางขวาง
- ลดปริมาณคู่สื่อสารเทียบกับการส่งถึงทุกคนทุกครั้ง
- ไม่มีการ relay รายงานแหล่งเดิมให้กลายเป็นพยานอิสระอีกคน

### 2. Per-agent independence

Agent ฝ่าย BLUE/RED ทุกตัวมี memory, sensor, RRT, evidence, target history และ inbox
แยกจากกัน เขารู้ **ข้อกำหนดสมาชิกของหน่วยตน** โดยไม่เห็น Private Memory ของเพื่อน

การรับข้อมูลจากวิทยุไม่สร้าง visible track และไม่ให้สิทธิ์ยิงที่ไม่เห็นตรงด้วยตัวเอง
หากวิทยุสูญหาย 100% แต่ละ Agent ต้องยังทำงานแบบ Independent ได้

### 3. Symmetric match

ทั้งสองฝ่ายใช้ instance AI / ค่าพลังแบบเดียวกัน การตัดสินผลแพ้ชนะนับ HP รวมของ
สมาชิกที่เหลือหรือกำจัดฝ่ายตรงข้ามหมดตามกติกา Duel2 เดิม
ไม่มีการ Buff หรืออ่าน hidden enemy registry เป็น input เป้าหมาย

### 4. Scale safeguards

- จำกัดจำนวนรายงาน sighting จากภาพที่เห็นตรงต่อหนึ่งรอบเมื่อมากกว่า 2v2
- Packet Loss, Delay, TTL และ evidence provenance ยังใช้โครงเดิม
- เพิ่ม queue cap เฉพาะในโหมดที่จำนวนมาก โดยคง 240 ใน baseline 2v2
- คำนวณ focus overlap แบบ pairwise เพื่อเปรียบเทียบขนาดทีมที่ต่างกัน
- ห้ามใช้ topology metadata เป็นคำสั่งเลือกเป้าหมายจากศูนย์กลาง


## หลักฐาน Full-match Pilot

- Seed 83, 311 × Formation Buddy2 / Group23 × Independent / Adaptive = 8 simulations
- ทุกแมตช์จบก่อนหรือภายใน 150 วินาที หลังแก้จุดเชื่อม RRT จากตำแหน่งที่เคลื่อนระหว่างวางแผน
- ตรวจทุก ๆ 5 วินาที: ตัวละครไม่หลุดพื้นที่ที่อนุญาต, เส้นทางคง collision-safe
- พบจุดบกพร่องจากการทดสอบ RED: เส้นทางระหว่าง 30 และ 55 วินาทีใน Adaptive ก่อนแก้ไข; GREEN หลังแก้ไขผ่าน 8/8
- Seed เดียวกันข้ามโหมด (paired) แต่ยังไม่มีการสลับฝั่งหรือ Confidence Interval; ห้ามสรุปความเหนือกว่าด้าน Win Rate
- Script: \`tools/benchmark_formation_fullmatch.cjs\`; artifacts จาก GitHub Actions

## Test / Release requirements

1. Node unit tests: 8 presets × 2 sides, unique private IDs, degree bounded, connectivity, invalid inputs, cross-side packet rejection
2. Inline module parity: duel2, leaderless และ formation ต้องตรงกับ Source JS
3. Chromium: 320/393/1365, spawn collision-safe, no console error, same stats, no mobile overflow
4. No-radio fallback (100% loss) and successful direct P2P on active link
5. Legacy 1v1, 2v2, Multi-target, PeerMesh V1.2 unchanged in behavior
6. Seed-paired evaluation Independent vs Cooperative: equal stats, duration, deaths, damage efficiency, network messages, target-switch/focus
7. **อย่า Merge จนกว่า CI ของ exact PR HEAD PASS** รวม Browser/PeerMesh และ Review แล้ว

## ข้อจำกัดการวิจัยที่ต้องรายงาน

จำนวน Agent เพิ่มขึ้นทำให้ RRT replanning, สัญญาณวิทยุ, line-of-fire blocking
และ browser compute สูงขึ้น ผลจำลองเบื้องต้นไม่ใช่หลักฐานว่าประสิทธิภาพการต่อสู้สูงขึ้น
และ PeerMesh topology ของห้องทดลอง network-lab เป็น **ระบบคนละส่วน** กับ Buddy topology
ในโหมด Duel นี้ ไม่อ้างว่ารวมเป็น protocol เดียวกันแล้ว

คำว่า Squad ในที่นี้หมายถึง "หมู่" เชิงการจัดกลุ่ม Agent ภายในเกม ไม่ได้เป็น
หน่วยบัญชาการหรือโครงสร้างที่ส่งคำสั่งการยิงไปยังสมาชิก
