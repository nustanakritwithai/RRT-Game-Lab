# RRT Arena V0.6.4 — Original BLUE Agent + Multi-Target Lab

🎮 **[เล่นสนามดวล 1 ต่อ 1](https://nustanakritwithai.github.io/RRT-Game-Lab/)**  
🎯 **[เปิด Multi-Target Lab](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi)**

## สิ่งที่เปลี่ยนใน V0.6.4

**ไม่สร้าง Agent ตัวใหม่** แต่ขยาย **BLUE Agent ตัวเดิมของ V0.6.3** ผ่านโค้ดเส้นทางการทำงานเดียวกัน ได้แก่ `spawnBot('blue')`, `currentIntent`, `chooseGoal`, `beginPlan`, `runPlanner`, `moveBot`, `shoot`, `RRTArenaMemory`, `RRTArenaGuided`, `RRTArenaTactics` และ `RRTArenaDefense`.

- เลือกโหมดได้: **ดวล 1 ต่อ 1** (คงระบบ BLUE vs RED เดิม) หรือ **Multi-Target** (BLUE ตัวเดิม + บอตพื้นฐาน 4–24 ตัว)
- บอต T01–T24 เป็น **scripted targets ไม่ใช่ AI Agent ใหม่**: ลาดตระเวน, เดินสุ่ม, หนี, หยุดนิ่ง, เดินเข้าหา BLUE
- เป้าหมายแต่ละตัวมี ID, สถานะการมองเห็น, Last-Seen, ความมั่นใจ, ความจำแยก ID และบันทึกประวัติการตรวจพบ
- BLUE เลือกเป้าหมายจาก **เห็นชัดก่อน / ใกล้ที่สุด / ตัวหนี / ความจำ** หรือผู้เล่นล็อกได้เฉพาะตัวที่เคยตรวจพบแล้ว
- Anti-flapping: คะแนนเลือกเป้าหมายเดิมได้รับ hysteresis เพื่อลดการสลับเป้าหมายบ่อย
- สมอง BLUE เดิมยังใช้ Tactical Positioning, Memory-Guided RRT, Dynamic Defense (ในโหมด Multi ปิดค่าเริ่มต้นเนื่องจากบอตเป้าหมายไม่มีอาวุธ), Path Smoothing และการยิงจริง
- เมื่อกำจัดบอตพื้นฐานได้ บอตจะออกจากสนามและกลับมาใหม่หลังพักหนึ่งช่วง; สถิติจำนวนครั้งที่กำจัดแสดงบน HUD
- บอตที่ไม่เคยถูกเห็นจะ **ไม่มี track**; บอตที่หายไปหลังสิ่งกีดขวางเก็บแค่ตำแหน่งล่าสุดและคาดการณ์สั้น ๆ จากความเร็วที่เคยวัดได้เท่านั้น ไม่มีการแอบอ่านพิกัดจริงขณะมองไม่เห็น

## การทดลองที่แนะนำ

1. เข้า `?mode=multi` กดเริ่มทดลอง เปิด Memory-Guided RRT 85% แล้วชมว่าตัว BLUE ยังคงวางแผนเส้นทางด้วยอัลกอริทึมเดิม
2. เลือก **เดินสุ่ม** ทุกเป้าหมาย ทดลอง Priority แบบ **เห็นชัดก่อน** และเปรียบเทียบกับ **ตัวที่กำลังหนี**
3. แตะปุ่ม 🎯 บนบอตที่ BLUE รู้ตำแหน่งแล้วเพื่อล็อกเป้าหมาย ทดลองวางกำแพงระหว่างทาง เพื่อดู Memory-Guided RRT วางแผนใหม่
4. เพิ่มจำนวนเป้าหมายเป็น 24 ตัวและตรวจว่าสนามเดิมยังคงสมรรถนะที่ยอมรับได้บนมือถือ
5. กลับโหมด **ดวล 1 ต่อ 1** ยืนยันว่ายังมี Dynamic Defense และระบบต่อสู้ V0.6.3 ไม่เปลี่ยน

## แยกบทบาทของข้อมูล

- **World truth:** ตำแหน่งจริงของบอตพื้นฐานจำลองใช้สำหรับการแสดงผลผู้ชม การเดินของบอตนั้นเอง และตรวจการชนของกระสุน
- **Perception:** `RRTArenaMulti.observe` สร้าง tracks เฉพาะจากตำแหน่งที่เซนเซอร์ BLUE มองเห็นผ่านกำแพงและอยู่ในระยะ
- **Memory:** เมื่อมองไม่เห็นใหม่ จะเก็บตำแหน่งที่ตรวจพบครั้งสุดท้ายและ confidence ลดลงตามเวลา หมดอายุแล้วลบทิ้ง
- **Decision:** `RRTArenaMulti.rank` เลือกเป้าหมายเฉพาะจาก tracks แล้วเชื่อมสมองความจำราย ID กับ BLUE ตัวเดิม
- **Actuator:** `runPlanner`, `moveBot`, `shoot` จากเอนจิน BLUE เดิม ใช้ข้อมูลเป้าหมายที่มาจากการรับรู้เท่านั้น
- **Debug only:** debug inspection สามารถอ่าน world truth ในการทดสอบ แต่ข้อมูลนี้ **ไม่ถูกส่งให้การตัดสินใจของ BLUE**

## โครงสร้างโค้ด

- `index.html` — เกมหลักหน้าเดียวสลับได้สองโหมด, HTML/JS offline-safe ไม่มี CDN และไม่มี API Key
- `rrt_arena_multi_v064.js` / `.test.cjs` — core บริสุทธิ์สำหรับระบบการรับรู้/จัดลำดับเป้าหมาย, ฝังสำเนาใน HTML ใช้ logic เดียวกัน
- โมดูล V0.6.3 เดิม (`rrt_arena_v05_core`, `rrt_arena_memory_v061`, `rrt_arena_guided_v061`, `rrt_arena_tactics_v062`, `rrt_arena_defense_v063`) ไม่ถูกเขียนทับ
- `.github/workflows/tests.yml` — รัน unit tests ทั้งเก่าและใหม่
- `.github/workflows/deploy-pages.yml` — เผยแพร่ `index.html` ผ่าน GitHub Actions

## ทดสอบ

- `node --test *.test.cjs` (Node.js 22)
- Playwright test: viewport 320, 393, 1365 px, ตรวจทั้งสองโหมด, การมองเห็นที่ไม่รั่วพิกัด, คำสั่งรายตัว/รวม, การสลับฉาก, Collision Check
- Heavy test: 24 targets, RRT plan step, ตรวจ runtime errors และ waypoints ไม่ชนกำแพง

> โหมดนี้ยังเป็นระบบ **rule-based** ยังไม่ได้ต่อโมเดลภาษา, multiplayer หรือ ROS จริง การติดตามหลายเป้าหมายไม่ได้แปลว่า AI รับรู้ตำแหน่งของทุกตัวพร้อมกันโดยอัตโนมัติ
