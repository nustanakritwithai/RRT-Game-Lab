# RRT ARENA — Online Tactical Learning v0.8.2 (Experimental)

## เป้าหมาย
ให้ Agent ฝั่ง BLUE และ RED **เรียนรู้ระหว่างการต่อสู้** ด้วยประสบการณ์ของตัวเองเท่านั้น ไม่ใช่แค่จำจุดที่เคยพบศัตรู แบบใหม่ยังคงใช้ AI เดิม (Memory-Guided RRT, Tactics, Defense, PeerMesh) ไม่ปรับความแม่นปืน HP กระสุน หรือความเร็ว

## กลไก
โมดูล `rrt_arena_online_learning_v082.js` ใช้ **Contextual Multi-Armed Bandit (UCB)** ขนาดเล็ก 3 กลยุทธ์:

| Strategy | สิ่งที่ปรับผ่าน Tactical + RRT เดิม |
| --- | --- |
| Balanced | ระยะยิง/ความเสี่ยงสมดุล |
| Aggressive | เข้าระยะกดดันและรับความเสี่ยงมากขึ้น |
| Cautious | รักษาระยะ ใช้จุดกำบังและลดความเสี่ยง |

แยกผลสะสมตามบริบท `contact` (พบศัตรูด้วยตัวเอง) และ `under_fire` (ตนเองเพิ่งถูกโจมตี) ทุก ~3 วินาที **ของเวลาในเกม** เลือกกลยุทธ์ใหม่ด้วยคะแนนที่เรียนรู้ ไม่ได้สลับแบบสุ่มตายตัว หลังลองทั้งสามแบบแล้วใช้ค่าเฉลี่ยของรางวัล + ค่าค้นหาทางเลือก UCB

### Reward ที่รับได้
- **Confirmed direct hit**: กระสุนของตัวเองกระทบเป้าหมายในขณะที่ตนยังมองเห็นจุดกระทบจริงเท่านั้น
- **Received damage**: HP ตนเองลดลง
- **Shot fired**: นับจำนวนยิงเพื่อหารสัดส่วน hit แต่ **ยิงเฉย ๆ ไม่ได้รางวัล**
- คะแนนแบบ bounded [-1,1] ป้องกันค่าผิดปกติหรือการเปลี่ยนกลยุทธ์รัว
- ไม่มีผลจากตำแหน่ง/HP ลับของคู่ต่อสู้ วิทยุไม่ใช่หลักฐานยืนยันการยิง ไม่แชร์คะแนนระหว่าง Agent

## การเล่น / A-B Testing
ในหน้าดวล Buddy/Group/Squad มีสวิตช์ **Online Learning** (ค่าเริ่มต้น OFF เพื่อคง baseline) และ HUD แสดง `เรียนรู้จริง`, `ปรับกลยุทธ์` และการกระจายสไตล์ Agent

- เปิด: `?mode=duel2&formation=squad2222&dteam=adaptive&learn=1&seed=83`
- ปิด: `?mode=duel2&formation=squad2222&dteam=adaptive&seed=83`

อ่านข้อมูล Agent แต่ละตัวจาก `window.__rrtDuel2Debug.getState().fighters[].learning` (จำนวนรอบเรียนรู้, reward เฉลี่ย, สไตล์, ความเสียหายที่ตนได้รับและ hit ที่เห็นเอง) สำหรับ benchmark และการวิจัย

## Test gates
1. Node Tests: update จริง ไม่รับ unseen-hit reward, ทุก Agent มี State ส่วนตัว, OFF ไม่เปลี่ยน behavior, ไม่มี NaN
2. Inline script เท่ากับ source JS และทำงานแบบ Offline ไม่มี API/โมเดล
3. Chromium gameplay: 2v2, 5v5, 8v8, 12v12 ทั้งสองฝ่าย HP/Stats เดิม, AI เรียนรู้, ห้ามยิงผ่านสิ่งกีดขวาง, ไม่มี JS error
4. Default-off baseline 150s full match, 1v1, Swarm, PeerMesh V1.2 และ V0.8.1 ต้องไม่ถดถอย
5. Benchmark แยก ON/OFF จนได้ sample มากพอจึงค่อยอ้าง win-rate improvement

**คำเตือน:** การปรับตัวระหว่างแมตช์พิสูจน์ด้วยจำนวน updates/feedback/policy switches ได้ แต่การเอาชนะมากขึ้นยังเป็นสมมติฐาน ต้องทดสอบแบบ paired seeds, side swap และ confidence intervals ก่อนอ้างประสิทธิภาพ
