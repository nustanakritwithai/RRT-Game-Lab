# PeerMesh Lab — Decentralized Communication Simulation (1 → 1,000 agents)

**[เปิดเกม PeerMesh Lab](https://nustanakritwithai.github.io/RRT-Game-Lab/network-lab.html)** · [กลับไปเล่น RRT Arena](https://nustanakritwithai.github.io/RRT-Game-Lab/)

PeerMesh เป็นหน้าเกมวิจัย **แยกจาก** RRT Arena เดิม ใช้ JavaScript/Canvas ทำงานได้บนมือถือโดยไม่ต้องติดตั้งอะไรเพิ่ม และเปรียบเทียบ 4 แนวทางการแพร่ข่าวระหว่าง Agent ที่มีความจำส่วนตัว: **Flooding, Gossip, Fanout, Anti-Entropy**. ปรับ Agent ตั้งแต่ 10–1,000 ตัว, Range, Packet Loss, Latency, การเคลื่อนที่, จำนวน Tick, Seed และฉากข้อมูลซ้ำ/ขัดแย้งกันได้

- **ทดลอง:** เลือกสถานการณ์ → Start / Pause / Step / Reset. แตะจุด Agent เพื่อดูสถานะและต้นทางหลักฐานในเครื่องนั้น. ปรับค่าจะรีเซ็ตการทดลองใหม่.
- **Benchmark:** กด *เทียบ 4 วิธี* ให้เล่นด้วย Seed, agent count, topology, packet loss, latency เหมือนกัน (protocol ต่างกัน) แล้วเปรียบเทียบ Coverage, Transmission count, Duplicates, Dropped messages, P90 arrival tick, estimated payload bytes. ปุ่ม Export ดาวน์โหลด replay JSON จาก simulation ปัจจุบัน.
- **Dedup/ความถูกต้อง:** retransmit/relay ของต้นทางเดียวกันไม่เพิ่ม independent-source count. 1 พยาน = UNKNOWN, หลายพยานอิสระเห็นเหมือนกัน = CORROBORATED, หลายพยานอิสระที่ขัดแย้ง = CONFLICT. CORROBORATED **ไม่ใช่การยืนยัน Ground Truth**.
- **Architecture:** `network_lab_core.js` เป็น deterministic discrete-time simulation; หน่วยความจำ Agent แต่ละตัวเป็น `Map` ของตัวเอง ไม่มี shared decision state. ตัวประมวลผลกลางของ *เกมจำลอง* ใช้นัดเวลา packet และคำนวณคะแนนเท่านั้น ไม่ใช่ผู้บังคับบัญชาหรือ consensus oracle. ทุก Agent ปัจจุบันใช้ protocol ตามกฎ ไม่ใช่การเรียก LLM 1,000 ตัวจริง.
- **Research limits:** ที่นี่เป็น single-process simulation ไม่ใช่เครือข่ายอินเทอร์เน็ตจริง; ไม่มีการพิสูจน์ตัวตน, Byzantine consensus หรือการจัดการผู้ส่งที่จงใจปลอมแปลง; Seed เดียวเป็นการเปรียบเทียบเชิงสำรวจ ไม่ใช่หลักฐานเชิงสถิติ. การนับ Bytes คือ approximation ของ packet payload ไม่รวม overhead จริง.
- **Validation:** `node --test network_lab_core.test.cjs` และ `node tools/network_lab_browser.cjs` (ต้องมี Playwright + Chromium). Browser smoke ตรวจหน้าจอ 320/393/1365px, ปุ่มหลัก, กรณี Conflict, Compare และ JSON download.

**Pages requirement:** workflow `.github/workflows/deploy-pages.yml` ต้องส่งทั้ง `network-lab.html`, `network_lab_core.js`, `network_lab_ui.js` ขึ้น Pages; ห้าม deploy เพียง `index.html` เพราะจะทำให้หน้า PeerMesh 404.

---

## V0.6.14 — Distributed Evidence & Provenance Lab

**Research question:** How should independent BLUE agents judge overlapping and contradictory radio reports without a leader or shared truth table?

- Each BLUE has its **own Evidence Ledger**, populated from its own visible tracks and actually delivered peer radio sightings. No read of another agent's hidden target state or private memory.
- Evidence is keyed by sensor origin and observation ID; retransmissions or relayed copies never become independent votes. Incorrect receiver, future delivery, TTL expiry, invalid coordinates, confidence, or origin mismatch are rejected.
- Local verdicts are **UNKNOWN** (no independent corroboration), **CONFLICT** (independent, spatially incompatible reports) or **CORROBORATED** (independent, temporally comparable reports agree). *CORROBORATED does not establish ground truth.*
- Conflicting radio coordinates are quarantined from exploration hints; radio never authorizes shooting. BLUE tactics, HP, ammo, movement, original RRT and friendly-fire collision remain unchanged.
- Multi-target HUD now reports evidence accepted, duplicates, conflicts and rejections. Replay JSON and the read-only `window.__rrtMultiDebug.getState().team.evidence` expose counters and per-BLUE provenance summaries.
- **Research limits:** this is a 2-agent simulated radio transport, *not* cryptographic identity or Byzantine fault tolerance. Verifying a sender's real identity is out of scope. Stale but physically plausible reports can remain UNKNOWN.

Run `node --test *.test.cjs` and `node tools/browser_regression.cjs` (Chromium) for acceptance.

# RRT Arena V0.6.13 — Leaderless Communication Lab

เป้าหมาย: ให้ B1 และ B2 เจรจาเลือกเป้าหมายผ่านข้อความเท่านั้น **ไม่มีหัวหน้าถาวรหรือ Shared Memory** และยังใช้ BLUE รุ่นล่าสุดที่มีวงแหวนเขียวทุกโหมด ไม่เปลี่ยน HP, ความเร็ว, กระสุน, การยิง, RRT หรือการป้องกัน

## ใหม่ใน V0.6.13

- **Symmetric BID:** ทั้ง B1 และ B2 ส่งคะแนนความพร้อมรับเป้าหมายที่ตนเองมองเห็นจริง ผ่านวิทยุที่มีระยะ ความหน่วง และวันหมดอายุ ผู้รับเปรียบเทียบกับคะแนนจากการมองเห็นของตัวเอง ไม่อ่านความจำหรือ focus เพื่อนโดยตรง
- **Peer negotiation:** เมื่อเสนอเป้าเดียวกัน ฝ่ายที่เหมาะสมน้อยกว่าพิจารณาเป้าหมายอื่นที่มองเห็นเอง หากเป้าปัจจุบันอยู่ใกล้หรือไม่มีตัวเลือกปลอดภัยก็สามารถปฏิเสธ ไม่มีการบังคับแบ่งเป้าเสมอไป
- **ACK / NACK:** ผลการยอมเปลี่ยนเป้า/การปฏิเสธเป็นข้อความวิทยุที่มีความหน่วงและอายุข้อมูลเช่นกัน ไม่มีการแต่งตั้ง B1 เป็นผู้บัญชาการ
- **Radio faults:** หน้าเกมตั้งข้อความสูญหาย 0%, 20%, 50%, 100% และหน่วงเพิ่ม 0, 0.3, 0.6, 1.2 วินาทีได้ โดยใช้ RNG ของ Radio แยกจาก World/Enemy/B1/B2
- **Independent fallback:** เมื่อวิทยุใช้ไม่ได้ BLUE ยังยิงจากข้อมูลที่เห็นเองได้ และระบบฟิสิกส์ห้ามกระสุนทะลุเพื่อน/กำแพง ข้อความที่มาไม่ถึงไม่เพิ่มข้อมูลเซนเซอร์หรือความจำ
- **Audit & Replay:** เก็บ bidsSent, bidsReceived, negotiatedYields, radioDropped, peerAcks และสรุปผลต่อแมตช์ใน Debug/Replay JSON

## เปิดสนาม

- [B1/B2 เจรจา P2P vs Ranged](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2&team=coop)
- [B1/B2 เจรจา vs Mixed](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=mixed&blue=2&team=coop)
- [วิทยุสูญหาย 50% เพิ่มหน่วง 0.3 วินาที](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2&team=coop&loss=50&delay=0.3)
- [วิทยุดับ 100%](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2&team=coop&loss=100)
- [Duo Independent ชุดควบคุม](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2)

## ขอบเขตของระบบกระจายศูนย์

เอนจินกลางยังคำนวณฟิสิกส์และการส่ง Packet เพื่อความยุติธรรมของเกม แต่การตัดสินใจของ BLUE ไม่มีผู้นำกลาง ใช้เฉพาะเซนเซอร์ตัวเองกับข้อความที่ได้รับจริงและยังไม่หมดอายุ B1/B2 ต่างมี PrivateMemory, RadioInbox และ BID Inbox ของตัวเอง

**ขีดจำกัด:** ยังเป็น protocol ที่กำหนดกติกาไว้ ไม่ใช่ภาษาที่ Agent เรียนรู้ขึ้นมาเอง ยังไม่มีหลักฐานว่า Win Rate ดีขึ้นจนกว่าจะผ่านชุด paired benchmark ที่ยากขึ้น

## Quality Gates

Unit Tests, Chromium 320/393/1365px, radio 0/50/100% loss, message delay, Solo/Duel/Independent/Cooperative, GREEN ring และ simulation benchmark ต้องผ่านก่อน merge/deploy

---
## ประวัติ V0.6.12 — Private Memory + Communication-Only

## หลักการ: BLUE ไม่มี Shared Memory อีกต่อไป

B1 และ B2 ยังคงใช้ AI ความสามารถล่าสุด (วงแหวนเขียว) ที่เหมือนกัน พร้อม Memory-Guided RRT, Ranged Threat Defense, Keep Moving, Predictive และ Team V2. **หน่วยความจำแต่ละตัวแยกจากกันทั้งในแมตช์และเมื่อเปิด Carry Memory ข้ามรอบ** ข้อความวิทยุไม่ถูกเขียนลง `danger`, `encounters` หรือ `lastSeen` ใน PrivateMemory ของผู้รับ และไม่ถูกผสานลง `multi.tracks` ซึ่งสงวนไว้สำหรับเซนเซอร์ท้องถิ่นของตัวนั้น

### POSE — ข้อมูลตำแหน่งเพื่อนทางวิทยุ

- `POSE` ส่งเฉพาะพิกัดของผู้ส่งเอง (own_position) ไปยังผู้รับที่อยู่ในระยะผ่านคิว Radio จริง ทุกประมาณ 0.25 วินาที; latency 0.30 วินาที, TTL 0.75 วินาที
- ระบบ Tactical Fire-Lane และการเลือกมุมยิงใช้ **POSE ที่รับแล้วเท่านั้น** ถ้าตำแหน่งเพื่อนขาดหายจะไม่อนุมานพิกัดใหม่จากสถานะโลก และหยุดยิงอย่างระมัดระวังเมื่อไม่สามารถตรวจความปลอดภัย
- การชนของตัวละคร/กระสุนยังคงใช้โลกจริงใน Physical Collision Engine เท่านั้น (เพื่อไม่ให้เดินหรือยิงทะลุตัวเพื่อน)
- Tests ตรวจว่าก่อนส่งถึงไม่เห็นเพื่อนใน inbox, หลังส่งถึงมีข้อมูลทั้ง B1/B2, หมดอายุแล้วลบ และรับ payload ปลอมแบบ `world_truth` ไม่ได้

### Message-only team coordination

- `SIGHTING`: ข้อมูลพิกัดที่เจ้าของมองเห็นจริง ผ่านวิทยุ `latency=0.3s`, จำกัดระยะ `0.95*S` และ TTL 3.5s; เก็บใน **RadioInbox เฉพาะตัวชั่วคราว** เท่านั้น
- `TARGET_CLAIM`: Agent ที่เห็นและกำลังเลือกเป้าหมาย ส่ง ID ไปยังเพื่อนผ่าน queue หน่วงเวลาและมีวันหมดอายุ; B2 แบ่งเป้าหมายเมื่อได้รับข้อความจาก B1 แล้วเท่านั้น **ไม่อ่าน `team.primaryFocus` โดยตรง**
- ข้อความหมดอายุจะถูกตัดจาก Inbox. การรายงาน SIGHTING ใช้เป็น **คำแนะนำค้นหาพื้นที่** ผ่าน RRT ของผู้รับ; ไม่ทำให้เซนเซอร์มองเห็นเป้า, ไม่เขียนประวัติ และไม่ให้สิทธิ์ยิงทะลุกำแพง
- `Independent` และ `Solo` ไม่รับส่งข้อความ ไม่มี Team V2 Advisor ส่วน Cooperative เท่านั้นที่ใช้ Inbox + Fire Lane/Focus Advisor ปัจจุบัน
- เมื่อ B1 ถูกกำจัด B2 ยังคงทำงานจาก private memory และ inbox ที่ได้รับจริงจนหมดอายุตามกฎ

### การสุ่มและความยุติธรรมของการทดลอง

ใช้ named seeded RNG streams แยก `world` (สนาม/เกิดศัตรู), `enemy` (พฤติกรรมศัตรู), `B1`, `B2`, `damage`, `effects` และสงวน `radio` สำหรับการทดลอง packet loss ในอนาคต. ทำให้การใช้ตัวเลขสุ่มเพิ่มของ B2 ไม่ทำให้ World หรือ Enemy เปลี่ยนลำดับสุ่ม. ตั้ง `?seed=311` หรือใช้ `window.__rrtMultiDebug.reseed(311)` ใน regression harness. **แม้แยก streams แล้ว การตัดสินใจที่ต่างกันยังอาจทำให้ศัตรูพบสถานการณ์ไม่เหมือนกัน** จึงห้ามตีความว่าเป็น causal proof โดยอัตโนมัติ

**ผลทดลองจริงรอบแรก:** [BENCHMARK_TEAM_V0612_TH.md](BENCHMARK_TEAM_V0612_TH.md) — 20 seeds/โหมด, 12 Ranged. Independent 20/20 และ Cooperative 20/20; Focus Overlap 48.0% → 36.5%, กระสุนถูกบล็อก 1.9 → 1.3 ต่อแมตช์. ยังไม่ใช่หลักฐานการเพิ่ม Win Rate หรือผลเชิงสาเหตุทั่วไป

### Quality gates

- Unit tests: `rrt_arena_private_radio_v0612.test.cjs` และ `rrt_arena_private_runtime_v0612.test.cjs`, source-inline consistency และทุกชุดทดสอบเก่า
- Chromium: Duel, Melee, Ranged, Mixed, Solo, Independent และ Cooperative บน 320/393/1365px; ตรวจ Inbox แยกจริง, ส่งข้อความจริง, การชนและหน้าจอคงที่
- Regression: เกมยังใช้ BLUE ต้นฉบับ มีวงแหวนสีเขียว B1/B2 ไม่เปลี่ยน HP, ammo, velocity หรือ cooldown เพื่ออ้างว่าการสื่อสารมีประสิทธิภาพ
- Benchmark: 20 seeds × Independent/Cooperative รักษา smoke pass; **ตัวเลขรุ่นเก่า V0.6.11 ไม่ใช่ผลทดลองของรุ่นใหม่นี้**

### ลิงก์เกม

- [Cooperative vs Ranged](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2&team=coop)
- [Independent vs Ranged](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2)
- [Cooperative vs Mixed](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=mixed&blue=2&team=coop)

### ขอบเขตถัดไป

V0.6.13: เพิ่ม Message Protocol สำหรับ ACK, NEED_SUPPORT, RELOADING, LANE_BLOCKED และ packet loss โดยไม่แทรกการมองเห็นหรือความจำลับ. V0.7.0: 100–200 seeds ในสนาม 16–24 ตัว พร้อมสถิติ effect size, confidence interval และ replay ของข้อความ/การตอบสนอง

---
## อ้างอิง — V0.6.11 Team Coordination V2

เพิ่มระบบประสานงานเชิงยุทธวิธีเหนือ BLUE ล่าสุด V0.6.10 โดย **ไม่เปลี่ยน HP/ความเร็ว/คูลดาวน์/กระสุน/โมเดลตัดสินใจ** ของ B1 หรือ B2. SOLO และ Duo Independent ยังเป็นชุดควบคุม และเฉพาะ Duo Cooperative เท่านั้นที่มีการตัดสินใจร่วมทีมแบบใหม่

## ใหม่: แยกเป้าหมายอย่างระมัดระวัง + ไม่ยิงผ่านเพื่อน

- **Visible-target splitting:** B2 หลีกการเลือกศัตรูตัวเดียวกับ B1 *เฉพาะเมื่อ* ตนเองมีเป้าหมายอื่นที่มองเห็นอยู่จริงในระยะใกล้เคียง และไม่ต้องผละจากศัตรูที่ประชิดอันตราย ระบบไม่ใช้พิกัดศัตรูจริงที่หลบอยู่หลังฉาก และไม่ไล่ตามข่าววิทยุเก่าแทนเป้าหมายที่มองเห็น
- **Smart friendly-fire hold:** ถ้า B1/B2 อยู่ในแนวยิงของอีกตัว ตัวที่ยิงจะตรวจแนวกระสุนจาก **ตำแหน่งเป้าหมายที่ตนเองมองเห็น** และวงความคลาดเคลื่อนของการเล็งก่อนยิง ไม่เสียกระสุนหรือ cooldown โดยเปล่าประโยชน์เมื่อเพื่อนขวาง; กระสุนจริงยังคงหยุดชนเพื่อนด้วย swept collision เป็นชั้นสุดท้าย
- **Cooperative firing-lane reposition:** หากเพื่อนขวางแนวยิงและไม่มีเหตุฉุกเฉินจากการถูกล้อม/ถูกยิง BLUE จะเสนอจุดย้ายด้านข้างด้วย pure advisor ที่คัดเฉพาะพิกัด free, LOS, ความสามารถยิงถึงเป้า, ไม่ชนทางเดิน/เพื่อน แล้วส่งจุดนั้นเข้า **Memory-Guided RRT รุ่นเดิม**; ไม่มีเทเลพอร์ต
- **Team telemetry:** สถิติ `focusSplits`, `focusSamples`, `focusOverlap`, `heldFire`, `laneMoves`, `shotsFired` แยก B1/B2 บันทึกใน read-only debug, wave history และ Replay JSON. แถบสถานะบนมือถือสูงคงที่
- **Fair A/B:** ไม่มี Team V2 advisor ใน Solo/Duo Independent และไม่มีการเพิ่มข้อมูลตำแหน่งลับผ่านการสื่อสาร กลไก radio latency/range/TTL ของ V0.6.9 ยังเหมือนเดิม

## เปิดทดลอง

- [Duo Cooperative vs Ranged](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2&team=coop)
- [Duo Independent vs Ranged (ชุดควบคุม)](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2)
- [Duo Cooperative vs Mixed](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=mixed&blue=2&team=coop)
- [Solo vs Melee (ฐานเดิม)](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=melee)

## Tests

`node --test *.test.cjs` + `node tools/browser_regression.cjs`: unit tests รูปแบบ TDD, ความปลอดภัยของแนวยิง, การแยกเป้าหมาย, บอตประชิด/ยิงไกล, ความจำแยก B1/B2, และ Chromium บนหน้าจอ 320/393/1365px

**ผลทดลองรอบแรก:** [BENCHMARK_TEAM_V0611_TH.md](BENCHMARK_TEAM_V0611_TH.md) (20 seeds ต่อโหมด, 12 ranged, 393px) — ทั้ง Independent และ Cooperative ชนะ 20/20; การเลือกเป้าหมายซ้ำ 42.6% → 24.8%, กระสุนชนเพื่อน 1.8 → 0.6 ต่อแมตช์ แต่ยังไม่พิสูจน์ว่า Win Rate ดีขึ้น และยังต้องแยก RNG streams ก่อนอ้างผลเชิงสาเหตุ; ตัวเลข BLUE/RED 1v1 ไม่ใช่ผลของระบบทีม

---

## อ้างอิง — V0.6.10 Unified BLUE

**ทุกโหมดใช้ BLUE ความสามารถล่าสุดชุดเดียวกัน** ไม่ย้อนกลับไปรุ่นเก่า: Predictive Anti-Encirclement, Ranged Threat Defense, Keep Moving, Tactical Positioning, Memory-Guided RRT และระบบความจำตามข้อมูลที่ตนเองพบ

### BLUE ที่มีวงแหวนสีเขียว

วงแหวนสีเขียวรอบ BLUE ตามภาพอ้างอิงคือเอกลักษณ์ภาพของ Unified BLUE ที่เปิดได้ใน **Duel / Melee / Ranged / Mixed / Solo / Duo Independent / Duo Cooperative** รวมถึง Replay. สีเขียวพื้นฐานระบุรุ่นของ BLUE เท่านั้น **ไม่ได้แปลว่าเส้นทางปลอดภัยเสมอไป**; ส่วนแดงและช่องหนีที่เรืองแสงจาก Predictive แสดงตาม threat map จริงของ B1 หรือ B2 แยกกัน

ใน V0.6.9 ระบบ Predictive ถูกปิดเมื่อเลือก Ranged-only และ Ranged Threat Defense/Keep Moving ถูกปิดเมื่อเลือก Melee-only. V0.6.10 เปลี่ยนเป็น **เปิดใช้กลไกเดียวกันตามภัยที่ตรวจพบ** ไม่ขึ้นกับชื่อชนิดศัตรู; เมื่อไม่มีภัยประชิดหรือกระสุน ก็ไม่มีการสร้างตำแหน่งศัตรูหรือสั่งหลบปลอม

ในโหมดดวล BLUE ยังใช้ฟังก์ชันเดิม `spawnBot('blue')`, `currentIntent`, `chooseGoal`, `beginPlan`, `runPlanner`, `moveBot`, `shoot` แต่เพิ่ม Ranged Defense และ Keep Moving ผ่านข้อมูล **RED ที่ BLUE ตรวจพบ/จำตำแหน่ง**; ไม่มีการอ่านตำแหน่ง RED ที่มองไม่เห็นเป็นข้อมูลให้ BLUE. ฝ่าย RED และกติกาการยิงเหมือนเดิม

### เข้าเกม

- [BLUE 2 ตัว Cooperative ต่อสู้ศัตรูผสม](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=mixed&blue=2&team=coop)
- [BLUE 2 ตัว Independent ต่อสู้ศัตรูยิงไกล](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2)
- [BLUE 1 ตัว vs Melee](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=melee)
- [BLUE ดวล RED 1 ต่อ 1](https://nustanakritwithai.github.io/RRT-Game-Lab/)

### Validation

`node --test *.test.cjs` และ `node tools/browser_regression.cjs` ตรวจเวอร์ชัน ความสามารถ พฤติกรรมต่างโหมด วงสีเขียวที่แสดงจริงบน Canvas และตำแหน่ง HUD บน 320/393/1365px

**Baseline note:** การเปิด Keep Moving ให้โหมดประชิดและโหมดดวลอาจเปลี่ยน Win Rate จากเวอร์ชันก่อนหน้า ต้องเก็บผลทดลองใหม่ก่อนอ้างว่าเก่งขึ้น

---
## อ้างอิง — V0.6.9 BLUE Team Combat Lab

## ทดลอง BLUE สองตัวด้วย AI ต้นฉบับ V0.6.8

- [🔷 BLUE 1 ตัว · Solo](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged)
- [🔷🔷 BLUE 2 ตัว · Independent](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2)
- [📡 BLUE 2 ตัว · Cooperative](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged&blue=2&team=coop)
- [⚔️🔫 BLUE 2 ตัว vs Mixed Bots](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=mixed&blue=2&team=coop)
- [โหมดดวลเดิม](https://nustanakritwithai.github.io/RRT-Game-Lab/)

ทั้ง **B1 และ B2** สร้างจาก `spawnBot('blue')` ของ V0.6.8 และรันชุด `sense → currentIntent → chooseGoal → beginPlan → runPlanner → moveBot → shoot` เดิมทุกขั้น ไม่สร้าง AI ตัวใหม่หรือให้ความสามารถแอบแฝง เรียกใช้ `Ranged Threat Defense`, `Keep Moving`, `Memory-Guided RRT`, `Dynamic Defense`, `Predictive Swarm` เหมือนกัน

### แยก Solo / Duo Independent / Duo Cooperative

- **Solo:** โหมดเดียวกับ V0.6.8 อย่างเดิม ใช้ baseline เดิมได้ ไม่สร้าง B2
- **Duo Independent:** B1/B2 มี HP, ammo, memory, target focus, observations, RRT tree, active plan, defensive state และ explore coverage เป็นของตนเอง ไม่มีข้อมูลส่งต่อกัน
- **Duo Cooperative:** ยังใช้ BLUE เดิมสองตัว แต่มี radio ที่ส่งเฉพาะ sightings ที่เจ้าของมองเห็นจริง โดยมี latency 0.3 s, max range 0.95·S, TTL 3.5 s. ผู้รับเก็บเป็น `memory` ความมั่นใจต่ำกว่า 1 และ **ยิงใส่ข้อมูลที่เพื่อนเล่าอย่างเดียวไม่ได้**; B2 พยายามหลีกการเลือกเป้าหมายซ้ำเมื่อมีทางเลือกที่ตนเองรู้จริง
- **Basic enemies unchanged:** Sentry / Patrol / Hunter และ melee bots เลือก BLUE ที่เห็นตาม LOS และระยะจริง ไม่ได้อัปเกรด AI และไม่รู้ตำแหน่งของ BLUE ที่ซ่อนตัว
- **Friendly safety:** ทั้ง BLUE และศัตรูตรวจการชนจริง; กระสุน BLUE ชนเพื่อนแล้วหยุดโดยไม่สร้างดาเมจ ไม่สามารถทะลุเพื่อน; HP หรือ ammo ของ BLUE ไม่เปลี่ยนเพื่อเอื้อผลการทดลอง
- **Team outcome:** BLUE ฝ่ายทีมชนะเมื่อกำจัดศัตรูทั้งหมดและมี BLUE อย่างน้อยหนึ่งตัวรอด. จะจบแพ้เมื่อ B1+B2 ตายทั้งหมดหรือครบ 150 วินาทีโดยยังมีศัตรู
- **Research:** ห้ามสรุป Teamwork ทำให้ win rate ดีขึ้นเพียงจาก 2 ตัว; เปรียบเทียบ Duo Independent/Cooperative ที่ใช้ seeds, enemy loadouts และ viewport เหมือนกัน พร้อมรายงานความแปรปรวน

### การควบคุม

หน้า `?mode=multi` มีเมนู **ทีม BLUE** ให้เลือก 1 ตัว / 2 ตัวอิสระ / 2 ตัวร่วมมือ บริเวณการตั้งค่าศัตรู รองรับศัตรู 4–24 ตัว โหมดประชิด / ระยะไกล / ผสม และความยากเดิม

แถบสถานะแสดง HP และจำนวนกระสุนของ B1/B2 ความสูงคงที่บนมือถือ, Replay JSON มีทั้งสองตัวและค่า Team Mode, และ `?seed=42` ยังรองรับการทดลองซ้ำ

### Tests และหลักฐาน

```bash
node --test *.test.cjs
node tools/browser_regression.cjs
```

GitHub Actions ทดสอบ Source-inline Integrity, Unit Cases, และ Chromium Browser Regression บน viewport 320/393/1365px รวมการตรวจ Solo/Duo สองแบบ, การสื่อสารที่ส่งจริง, การตายของ B1 แล้ว B2 ยังเล่นต่อ, เส้นทาง/การชน และโหมดดวลเดิม

โหมดเดิมยังเป็น baseline; ผลสรุปประสิทธิภาพ Duo ต่อศัตรู 24 ตัวจะต้องมาจากการทดลองหลาย seeds ไม่ใช่ตัวเลขคาดการณ์

---

## อ้างอิง — V0.6.8 Ranged Threat Defense

## ใหม่ใน V0.6.8

BLUE ตัวเดิมรับมือฝูงศัตรูยิงระยะไกลด้วย **Ranged Threat Defense** (`rrt_arena_rangeddef_v068.js`, pure functions + 26 unit tests) โดยไม่เพิ่มสเตตัสใด ๆ

- **Exposure map** — ใช้เฉพาะศัตรูยิงที่ BLUE เห็นหรือจำได้ (ไม่เกิน 6 วินาที, ใช้ตำแหน่งที่เห็นล่าสุด ไม่เดาตำแหน่งจริง) + ระยะยิงตามกติกาความยาก + แนวสายตาของแผนที่
- **เลือกจุดยิง** — หาจุดที่ถูกเล็งจากศัตรูอื่นน้อยที่สุด เส้นทางไปจุดนั้นถูกเล็งน้อย และถ้าทำได้ยืนใน *standoff band* (BLUE ยิงถึง 0.54·S แต่ศัตรูระดับสมดุลยิงถึง 0.51·S)
- **ยิงจากที่กำบัง** — ถ้ามีแค่เป้าที่กำลังยิงที่เห็น BLUE จะยืนยิงแทนการเดินออกไปโดนยิงหลายทาง; ถูกเล็งจากตัวอื่น/รีโหลด → ย้ายจุด; เส้นทางเริ่มถูกเล็ง → เปลี่ยนจุด
- จุดหมายยังวางเส้นทางด้วย Memory-Guided RRT เดิม และทุกก้าวตรวจการชน
- สวิตช์ **🛡️ Ranged Threat Defense** ปิดแล้วได้พฤติกรรม V0.6.7 (+ การแก้บั๊ก) ทุกประการ — ยืนยัน 30/30 seeds
- **แก้บั๊กเดิม 2 ตัว** ที่ทำให้ BLUE ค้าง: แผน RRT ถูกล้างทุก 0.12 s ตอนยังไม่รู้จักศัตรู (ตั้งแต่ V0.6.4) และ RRT วนไม่จบเมื่อยืนชิดกำแพง (ตั้งแต่ V0.5)

- **Keep Moving** (สวิตช์ 🏃) — ระหว่าง RRT คำนวณ BLUE เดินตรงไปยังจุดหมายถ้าทางโล่ง แล้วต่อเส้นทางใหม่ที่จุดที่ไปถึงได้ไกลสุด; ขณะยืนยิงหรือถูกเล็งจะส่ายตั้งฉากกับแนวยิงโดยไม่เข้าแนวยิงเพิ่ม · **Exploration memory** — จำว่าพื้นที่ไหนเคยมองเห็น แล้วค้นหาพื้นที่ที่ไม่ได้ดูนานที่สุด

| ยิงไกล · สมดุล (held-out 100 seeds) | V0.6.7 | V0.6.8 |
|---|---:|---:|
| 8 ตัว · 393 px | 46% | **100%** |
| 12 ตัว · 393 px | 9% | **77%** |
| 12 ตัว · 320 px | 6% | **77%** |
| 12 ตัว · 1365 px | 24% | **96%** |
| 16 ตัว · 393 px | 0% | 31% |
| 24 ตัว · 393 px | 0% | 0% |
| ผสม 12 ตัว · 393 px | 43% | **100%** |

16–24 ตัวยังแพ้เกือบหมด; Keep Moving ลดเวลายืนนิ่งได้ครึ่งหนึ่งแต่จำนวนครั้งที่ถูกยิงแทบไม่ลด — รายละเอียด: [BENCHMARK_V068_TH.md](BENCHMARK_V068_TH.md) · ประชิด 24 ตัวไม่แย่ลง (80% → 82%)

---

## V0.6.7 — Basic Ranged Enemy Lab (ระบบเดิมที่ยังอยู่ครบ)

**BLUE Agent ตัวเดิม** (Memory-Guided RRT + Tactical Positioning + Dynamic Defense + Predictive Anti-Encirclement) ต่อสู้กับบอตพื้นฐานที่ยิงระยะไกลได้จริง โดยไม่เพิ่ม AI Agent ใหม่หรือโกงตำแหน่งศัตรู

## เล่นเกม / เลือกโหมด

- [🔫 BLUE vs Ranged Bots (Sentry / Patrol / Hunter)](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=ranged)
- [⚔️🔫 BLUE vs Mixed Swarm (ประชิด + ยิงไกล)](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi&enemy=mixed)
- [⚔️ BLUE vs Melee Swarm (V0.6.6 เดิม)](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi)
- [🔷 โหมดดวล BLUE vs RED 1 ต่อ 1](https://nustanakritwithai.github.io/RRT-Game-Lab/)

ในหน้าเว็บเลือก **ประเภทศัตรู** ได้จากเมนู: ประชิด / ยิงไกล / ผสม และเลือกจำนวน 4–24 ตัว ความยาก ฝึกซ้อม/สมดุล/ยาก เปลี่ยนคำสั่งให้บอตแต่ละตัวได้ (Sentry, Patrol, Hunter) ปิดการต่อสู้เพื่อกลับไปโหมดติดตามพื้นฐานโดยไม่สร้าง BLUE ใหม่

## ระบบศัตรูยิงไกล V0.6.7

- **Sentry:** เฝ้าตำแหน่ง ถ้าเห็น BLUE อยู่ในระยะและไม่มีผนังบังจึงยิง
- **Patrol:** เดินจุดตรวจด้วย local steering พื้นฐาน หยุดและยิงเมื่อเห็น BLUE
- **Hunter:** เข้าหา/รักษาระยะจาก BLUE ที่ตรวจพบ หรือเดินตรวจตำแหน่งที่เคยเห็นเป็นเวลาจำกัด; ไม่รู้ตำแหน่งที่มองไม่เห็น
- **Physical projectiles:** ยิงกระสุนจริง มี cooldown/reload/ammo/accuracy; ตรวจชนกำแพงและ BLUE ด้วย swept collision; ไม่มีการโดนยิงจากการเรียกฟังก์ชัน shoot โดยตรง
- **Fairness:** ศัตรูไม่ใช้ RRT/LLM, ยิงไม่ได้หาก BLUE หลุดสายตา; BLUE ยังใช้เซนเซอร์และ Memory เดิม ตรวจเห็นกระสุนได้ตามการมองเห็นเท่านั้น ไม่เพิ่มเลือด ดาเมจ หรือความเร็ว
- **Mixed:** ส่วนที่เป็นประชิดยังใช้ Predictive Anti-Encirclement V0.6.6, ส่วนที่เป็น ranged ใช้ FSM พื้นฐาน ไม่ถูกประเมินเป็นผู้โจมตีประชิด
- **Replay & seeded mode:** `?mode=multi&enemy=ranged&seed=42` สำหรับผลทดลองทำซ้ำ; Replay JSON มีประเภทศัตรู จำนวนยิง/โดน/ความเสียหาย และสถานะเกม

## การทดสอบ

```bash
node --test *.test.cjs
node tools/browser_regression.cjs   # ต้องติดตั้ง Playwright + Chromium
```

GitHub Actions บน Pull Request จะรัน Unit Tests, source-inline integrity, syntax verification และ Chromium gameplay regression สำหรับ 320px / 393px / 1365px ครอบคลุม Duel, Tracking, Melee, Ranged และ Mixed

ชุดสถานการณ์ที่เสนอไว้ใน `RANGED_LAB_V067_MATRIX.json` เป็น **แผนการวิจัย** ยังไม่ใช่ผลอัตราชนะของ V0.6.7 และไม่มีการรับประกัน BLUE ชนะทุกครั้ง

---

## อ้างอิง — V0.6.6 Predictive Swarm Defense

- 🎮 **[เปิดเกมบน GitHub Pages](https://nustanakritwithai.github.io/RRT-Game-Lab/?mode=multi)**
- ⚔️ **[โหมดดวล 1 ต่อ 1](https://nustanakritwithai.github.io/RRT-Game-Lab/)**

## ใหม่ใน V0.6.6 — Predictive Anti-Encirclement

BLUE ตัวเดิมไม่รอให้ฝูงประชิดเข้ามาก่อนแล้วค่อยหลบ แต่ **คาดการณ์ล่วงหน้าว่ากำลังจะถูกล้อม** แล้วเลือกช่องว่างที่ยังเปิดอยู่ให้ RRT วางเส้นทางจริง (`rrt_arena_swarm_v066.js`, pure functions + 35 unit tests)

1. **Perceived threat map** — ใช้เฉพาะ track ที่ BLUE เห็นจริง + ความจำ last-seen ที่อายุไม่เกิน 2.4 วินาที (คาดตำแหน่งจากความเร็วที่เคยเห็น พร้อมลดความเชื่อมั่นตามอายุ) ไม่ใช้พิกัดจริงของศัตรูที่ถูกบัง
2. **Time-to-contact** — ประเมินเวลาที่แต่ละตัวจะเข้าระยะตี จากความเร็วตามกติกาความยาก (ข้อมูลสาธารณะ) หรือความเร็วเข้าหาที่สังเกตได้ ถ้ามากกว่า; ตัวที่จำได้ถูกประเมินแบบระวังไว้ก่อน
3. **Encirclement risk** — แผนที่เชิงมุม 32 ทิศ: ทิศที่ศัตรูจะปิดภายใน 2.6 วินาที + ทิศที่กำแพงกั้น → หาช่องว่างใหญ่ที่สุดและระดับ `ปลอดภัย / เฝ้าระวัง / เสี่ยงถูกล้อม / ถูกปิดล้อม`
4. **Open-corridor scoring** — ให้คะแนนจุดหมาย 75 จุดด้วย *race margin* (BLUE ถึงแต่ละจุดบนทางก่อนศัตรูกี่วินาที), ความโล่งรอบปลายทาง (กันทางตัน), ขอบสนาม, ความร้อนจากความจำ และทิศของช่องว่าง
5. **Preemptive repositioning + hysteresis** — ย้ายเมื่อระดับ ≥ เสี่ยงถูกล้อม; ถ้าเส้นทางหนีปัจจุบันยังปลอดภัยจะไม่ replan ทุกเฟรม; ถ้าศัตรูกำลังตัดเส้นทาง (margin < 0.1 s) จะเปลี่ยนมุมหลบใหม่
6. **RRT + local reflex** — จุดหมายถูกส่งให้ Memory-Guided RRT เดิม (สุ่มตามแนว corridor และรับเส้นทางแรกที่ปลอดการชนเร็วขึ้นเมื่อหนี เพราะการปรับเส้นทางเพื่อหลบกระสุน RED ไม่มีประโยชน์กับศัตรูไม่มีปืน); micro-step ฉุกเฉินยังทำงานเมื่อเส้นทางถูกตัด ทุกก้าวตรวจการชน ไม่มีเทเลพอร์ต
7. **Explainability** — HUD แสดง `เสี่ยงถูกล้อม → หลบล่วงหน้า`, `ทางหนีไม่ปลอดภัย → เปลี่ยนมุมหลบ` พร้อมองศาช่องว่างและเวลาเผื่อ; เปิด “แสดงภัย” จะเห็นวงแดงรอบ BLUE (ทิศที่ถูกปิด) และส่วนโค้งสีเขียว (ช่องหนี) — กล่องสถิติมีความสูงคงที่ ไม่ทำให้สนามเลื่อน

สวิตช์ **🔮 Predictive Anti-Encirclement** อยู่ใต้ Kiting: ปิดแล้วจะได้พฤติกรรม V0.6.5 เดิมทุกประการ (ยืนยันแล้วว่าผลตรงกัน 30/30 seeds) · ไม่มีการเพิ่ม HP/ดาเมจ/ความเร็ว BLUE หรือลดความสามารถศัตรู

### ผล benchmark (held-out seeds 1001–1100, 100 แมตช์/เงื่อนไข) — รายละเอียด: [BENCHMARK_V066_TH.md](BENCHMARK_V066_TH.md)

| 24 ศัตรู · สมดุล · Kiting เปิด | V0.6.5 (Predictive ปิด) | V0.6.6 (Predictive เปิด) |
|---|---:|---:|
| มือถือ 393 px | 51% (CI 41–61) | **80% (CI 71–87)** |
| มือถือ 320 px | 51% (CI 41–61) | 64% (CI 54–73) |
| เดสก์ท็อป 1365 px | 95% (CI 89–98) | 98% (CI 93–99) |

ยังไม่ถึง 70% ที่ 320 px และระดับยาก 24 ตัวยังชนะเพียง 7% — เป็นงานรอบถัดไป

### ทดลองซ้ำ / reproducibility

- `node tools/benchmark_swarm.cjs --seeds 1001-1100 --width 393 --height 852 --predictive on` (ต้องมี Playwright + Chromium) หรือ `./tools/run_benchmark_matrix.sh` สำหรับทั้งตาราง
- หน้าเกมรองรับ `?mode=multi&seed=42` เพื่อสุ่มแบบกำหนด seed (ค่าเริ่มต้นยังสุ่มจริง); Replay JSON บันทึก `seed`, สนาม, difficulty, จำนวน, flags ของ Kiting/Predictive, จำนวนการหลบล่วงหน้า และ RRT plan failures
- `node tools/browser_regression.cjs` ตรวจโหมดดวล, ติดตามหลายเป้าหมาย, ฝูงประชิด, การชน, HUD นิ่ง และไม่มี horizontal scroll ที่ 320/393/1365 px

---

## V0.6.5 — Ranged BLUE vs Melee Swarm (ระบบเดิมที่ยังอยู่ครบ)

โหมดทดลองการต่อสู้ระหว่าง **BLUE Agent รุ่นเดิม** (ยิงระยะไกล, Memory-Guided RRT, กลยุทธ์ V0.6.3 และการรับรู้หลายเป้าหมาย V0.6.4) กับบอตพื้นฐาน 4–24 ตัวที่สามารถ **โจมตีระยะประชิดได้จริง** ไม่ได้เพิ่มโมเดลภาษา, AI Agent ตัวใหม่ หรือ API Key

## การทดลองใหม่

1. เปิดโหมด `?mode=multi` และเปิด **⚔️ โหมดโจมตีระยะประชิด** (เปิดค่าเริ่มต้น)
2. เลือกจำนวน **4 / 8 / 12 / 16 / 24** ตัว และระดับ **ฝึกซ้อม / สมดุล / ยาก**
3. ให้บอตพื้นฐานทำคำสั่งง่าย ๆ เช่น **ไล่ล่าตามตำแหน่งที่เคยเห็น, ลาดตระเวน, เดินสุ่ม, หนี, ยืนนิ่ง, เดินเข้า BLUE**; ทุกตัวสามารถตีได้เมื่ออยู่ใกล้พอ ถึงแม้มีคำสั่งเดินอื่น
4. บอตศัตรูต้อง **เข้าใกล้จริง**, มีระยะโจมตีและคูลดาวน์ และไม่สามารถโจมตีทะลุกำแพง
5. เมื่อเปิด **Swarm-Aware Kiting** BLUE ใช้ *เฉพาะเป้าหมายที่มองเห็นจริง* เพื่อคัดเลือกจุดถอยให้ RRT และหลบฉุกเฉินระยะก้าวสั้น ๆ เมื่อศัตรูประชิดมาก (ทุกก้าวตรวจการชน)
6. BLUE **ชนะก็ต่อเมื่อกำจัดศัตรูทุกตัวก่อนหมด 150 วินาที**; หาก HP หมดหรือหมดเวลาโดยยังเหลือศัตรู ถือว่าแพ้ ไม่มีการฟื้นคืนชีพศัตรูในโหมดคลื่นทดสอบ
7. เมื่อจบรอบ สามารถดู Replay และกด **รอบต่อไป** เพื่อทดลองซ้ำ หรือเปิด **เริ่มรอบใหม่อัตโนมัติ** เพื่อสะสมจำนวนชนะ/แพ้ในการตั้งค่าเดิม; กด **รีเซ็ตทั้งหมด** เพื่อล้างสถิติ

**โหมดติดตามหลายเป้าหมาย V0.6.4** ยังอยู่: ปิดสวิตช์โจมตีประชิดจะกลับสู่โหมดบอตพื้นฐานที่มีการเกิดใหม่โดยไม่ทำร้าย BLUE; สนามดวลเดิมคงเดิม

## สถาปัตยกรรม / ความเป็นธรรม

- `spawnBot('blue')`, `currentIntent`, `chooseGoal`, `beginPlan`, `runPlanner`, `moveBot`, `shoot` ยังเป็น BLUE Agent เดิมที่ต่อยอดมาตลอด (โหมดประชิดปรับคุณสมบัติการยิงและเคลื่อนที่ให้เหมาะกับสนามทดลอง)
- `RRTArenaMulti.observe` แปลงสถานการณ์จริงเป็น observation; ความจำเก็บตำแหน่ง last seen เมื่อหลุดสายตา
- `RRTArenaMelee` เป็นชุด **pure functions** สำหรับ damage cooldown, threat assessment, ก้าวหลบฉุกเฉินแบบสั้น, เลือกจุดหนีจากข้อมูลที่มองเห็น และเงื่อนไขแพ้ชนะ
- ตัวประชิดต้องเห็น BLUE หรือจำตำแหน่งที่พบได้เมื่อมีการบังสายตา; เมื่อความจำหมดจะกลับไปสุ่มสำรวจ
- RRT ทำหน้าที่วางเส้นทางหลัก; การหลบฉุกเฉินเป็นระดับ reflex เมื่อถูกประชิด ไม่ได้ให้บอตทราบตำแหน่งของศัตรูที่ซ่อนอยู่ และไม่ใช่การเทเลพอร์ต
- บอตพื้นฐาน **ไม่มีปืน**; BLUE เป็นฝ่ายเดียวที่โจมตีระยะไกล
- ระบบยังเป็น **AI แบบใช้กฎ/heuristic** ไม่ได้ต่อ LLM / Typhoon

## ผลการทดลองเบื้องต้น (จำลองในเบราว์เซอร์)

การทดสอบตัวอย่างด้วย 10 random seeds ต่อรูปแบบ บนสนามค่าตั้งต้นเดียวกัน สลับเปิด/ปิด Kiting แล้วจำลองแมตช์สูงสุด 150 วินาที (ผลสุ่ม ไม่รับประกันทุกครั้ง):

| สถานการณ์ | เปิด Kiting | ปิด Kiting |
|---|---:|---:|
| 12 บอตประชิด · สมดุล | BLUE ชนะ 10/10 | ชนะ 9/10 |
| 24 บอตประชิด · สมดุล | BLUE ชนะ 5/10 | ชนะ 0/10 |

การทดลองเดี่ยวแสดงว่า BLUE อาจกำจัดบอตระดับฝึกซ้อมได้ครบ 24 ตัว และอาจแพ้กลุ่ม 24 ตัวระดับยาก ความแตกต่างนี้มีไว้สำหรับปรับสมดุล ไม่ใช่การล็อกฝ่ายที่ชนะ

## คุณภาพ / ตรวจสอบ

- CI: `node --test` 9 ไฟล์ (V0.5–V0.6.6 + ตรวจว่าโมดูลที่ inline ใน `index.html` ตรงกับไฟล์ที่ทดสอบ) รวม **154 unit cases**
- ทดสอบ browser Chromium บน viewport 320, 393 และ 1365 px, การเกิด damage จริง, การสลับโหมด, การเล่นหลายรอบ และ stable HUD
- การประลองซ้ำด้วย seeded `Math.random` ใน *test harness เท่านั้น*; หน้าเกมผู้ใช้ทั่วไปยังสุ่มจริง ไม่ได้ล็อก seed
- GitHub Actions ทดสอบและ deploy ด้วย `index.html` แบบ offline-safe; แสดงหน้าเกมได้โดยไม่โหลดไฟล์ JS จากภายนอก

## การพัฒนาต่อ

วิเคราะห์เหตุผลการแพ้ต่อฝูง 24 ตัวระดับสมดุล, เก็บ metrics การถูกล้อม/ระยะยิง, ปรับความปลอดภัยของที่กำบัง, เพิ่มการสุ่มแบบ deterministic ภายในเกมเพื่อ benchmark ทำซ้ำ, แล้วเชื่อม LLM Tool Calling เฉพาะชั้นตัดสินใจ (ไม่ให้ควบคุมฟิสิกส์ทุกเฟรม)
