# RRT ARENA V0.6.16 — การตรวจคุณภาพการต่อสู้ Duel 2v2

## ขอบเขต
BLUE B1/B2 และ RED R1/R2 ยังคงใช้ AI รุ่นเดียวกัน (Memory-Guided RRT, Tactical Positioning, Ranged Defense, Keep Moving, Personal Memory/Perception, Radio/Evidence). ไม่มีการเพิ่ม HP, Damage, Speed, Accuracy, Ammo, Fire Rate หรือสิทธิ์มองเห็นศัตรูที่ไม่เคยเห็น

## พบปัญหา 1: รู้ว่ามีเพื่อนขวางแนวยิง แต่ไม่เปลี่ยนมุมยิง
- **ต้นเหตุ**: `duel2Shoot` มีเงื่อนไขหยุดยิงเมื่อเพื่อนขวาง แต่ `currentIntent` และ `chooseGoal` ไม่เปิดเส้นทาง `team_lane` ใน Duel 2v2; advisor เดิมจำกัดอยู่ใน Multi Swarm
- **แก้**: ใช้ `coopCore.safeFireLine` และ `coopCore.findClearLane` ที่มีอยู่แล้ว ตรวจจาก `duelSeenPeers` ซึ่ง Agent มองเห็นเองและไม่เกิน 0.32 วินาที ให้ RRT เดินไปมุมที่ไม่ขวางเพื่อนเหมือนกันทั้ง BLUE และ RED
- **ความปลอดภัย**: การเลือกเป้าหมายและคัดกรองจุดหมายไม่อ่านตำแหน่งศัตรูที่ยังไม่เห็นจาก World State; เฉพาะ Physics/Motion Guard ตรวจชนจริงเพื่อไม่เดินหรือยิงทะลุหน่วยอื่น
- **เครื่องมือวัด**: `window.__rrtDuel2Debug.getState().laneMoves` และ `.heldFire`, แสดง `🧭 มุมยิงใหม่` บน HUD

## พบปัญหา 2: Conflict เพิ่มขึ้นบนหน้าจอขนาดใหญ่
- **ต้นเหตุ**: ตรวจความสอดคล้องของรายงานตำแหน่งใน Duel 2v2 ด้วย `maxDistance=24` พิกเซล และ `maxSpeed=80` พิกเซล/วินาทีโดยไม่คิด scale ของสนาม
- **แก้**: กำหนด `maxDistance=R*2.5`, `maxSpeed=bot.moveSpeed*S*1.8` (รวมอัตราหลบกระสุนที่มีอยู่) โดยไม่อ่าน velocity จริงของศัตรูและไม่เปลี่ยนพฤติกรรมฟิสิกส์
- **หลักฐานจาก Chromium seed 83 ใน Cooperative, map=open, 6 วินาที**:

| Viewport | ก่อน: Conflict / Accepted | หลัง: Conflict / Accepted |
|---|---:|---:|
| 320px | 0 / 38 | 0 / 38 |
| 393px | 4 / 48 | 0 / 48 |
| 1365px | 25 / 52 | 0 / 52 |

เป็นผลจำลอง **เฉพาะเงื่อนไขนี้** มิใช่การพิสูจน์ว่าแยกข้อมูลถูก/ผิดได้ครบ; รายงานตำแหน่งที่ขัดกับขีดจำกัดฟิสิกส์ยังเป็น CONFLICT และหลักฐานไม่เพียงพอยังคง UNKNOWN

## Acceptance ที่ต้องตรวจ
1. `node --test *.test.cjs` รวม TDD regression ของ RRT lane, ไม่รั่ว World State, และการเคลื่อนที่จริง/เท็จ
2. `node tools/browser_regression.cjs` ตรวจ Chromium 320/393/1365, BLUE/RED sidestep แบบไม่มีวิทยุ, 1v1/Swarm/PeerMesh regression
3. `node tools/benchmark_duel2_quality.cjs` เปรียบเทียบ Independent, Cooperative และ Loss 100% แบบ seed-paired 4 seeds, 25 วินาที/แมตช์ แล้วเผยแพร่ผล JSON
4. ตรวจ CI exact head SHA, Merge อย่างปลอดภัย และ GitHub Pages/public readback ก่อนประกาศ DONE

## ข้อจำกัดด้านงานวิจัย
- ชุด 4 seeds คือ Smoke/Exploratory เท่านั้น ไม่มีนัยเชิงสถิติหรือหลักฐานว่า Win Rate เพิ่ม
- ข้อมูลจากหลายแหล่งไม่ได้ยืนยัน Ground Truth โดยอัตโนมัติ: CORROBORATED ≠ VERIFIED
- Radio สูญหาย 100% ต้องยังให้ Agent ตัดสินด้วยเซนเซอร์ตัวเองและยิงได้เมื่อมองเห็นจริง
- โครงสร้างไม่มีหัวหน้าถาวรหรือ Shared Memory และไม่ใช้ World Truth เพื่อเลือกเป้าหมาย
