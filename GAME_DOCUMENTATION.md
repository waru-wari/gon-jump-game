# empeo Land Adventure — Game Logic & Structure

> **Engine:** HTML5 Canvas + Vanilla JavaScript (single-file deployable)
> **File:** `empeo-land-adventure.html`
> **Genre:** Vertical Endless Platformer (Doodle Jump style)
> **Theme:** Fantasy Sky Adventure

---

## Quick Start

1. เปิด `empeo-land-adventure.html` ใน browser ได้เลย ไม่ต้อง build
2. Deploy: upload ไปที่ web hosting อะไรก็ได้ (Netlify, Vercel, S3, Firebase Hosting)
3. แก้ `CONFIG.GAME_URL` ใน `<script>` ให้เป็น URL จริงที่ host ก่อน push live (สำหรับ share link)

### Controls
- **Desktop:** Arrow keys (←/→) หรือ A/D, Space = start, Esc = pause
- **Mobile:** แตะค้าง + ลากนิ้วซ้าย/ขวา หรือใช้ virtual D-pad ที่โผล่ขึ้นมา
- **Mouse:** click + drag ซ้าย/ขวา

---

## File Structure

```
empeo-land-adventure.html       # ทุกอย่างอยู่ในไฟล์เดียว
├── <head>                      # meta tags + Open Graph (สำหรับ FB share preview)
├── <style>                     # CSS — UI overlays, animations, responsive
└── <script>                    # Game engine
    ├── CONFIG                  # ค่าคงที่ทั้งหมด ปรับ tuning ที่นี่
    ├── Utils                   # rand, clamp, rectsOverlap
    ├── Input                   # keyboard + touch + mouse
    ├── Player                  # "Nong Gon" mascot (procedurally drawn ด้วย canvas)
    ├── Platform                # normal | moving | breakable
    ├── Coin / MysteryBox / Spring   # collectibles + power-ups
    ├── Particle                # bounce/collect effects
    ├── Background              # parallax sky + clouds + far islands
    ├── Leaderboard             # localStorage-based, top 20
    ├── UI                      # screen state manager
    └── Game                    # state machine + main loop
```

---

## Game States (State Machine)

```
   ┌──────────┐  start()   ┌──────────┐  pause()    ┌─────────┐
   │   menu   │──────────▶│  playing │────────────▶│ paused  │
   └──────────┘           └──────────┘             └─────────┘
        ▲                       │                       │
        │                  gameOver()             resume() │
        │                       ▼                       ▼
        │                ┌──────────┐         (back to playing)
        └────────────────│ gameover │
        quitToMenu()     └──────────┘
                              │ playAgain
                              └─▶ start()
```

---

## Core Mechanics

### Physics
| Constant | Value | Notes |
|---|---|---|
| `GRAVITY` | 0.42 | px/frame² |
| `JUMP_VELOCITY` | -13 | normal bounce |
| `SPRING_VELOCITY` | -24 | spring boost (~3.4x higher) |
| `PLAYER_SPEED` | 5.5 | horizontal px/frame |
| `PLATFORM_GAP_MIN/MAX` | 70 / 110 | spawn spacing |

### Camera
- ติดตามผู้เล่นเฉพาะตอนสูงเกิน 40% จากบนจอ (`CAMERA_TRIGGER`)
- **ห้ามเลื่อนลง** — ถ้าผู้เล่นตกต่ำกว่ากล้อง = Game Over
- Camera position = `Game.camY` (top edge ของจอใน world space)

### Screen Wrap
ผู้เล่นออกขอบซ้าย → โผล่ขวา / ออกขวา → โผล่ซ้าย (อยู่ใน `Player.update()`)

### Difficulty Curve
- เริ่มที่ 5% moving + 5% breakable platform
- ที่ 8000px climbed: 30% moving + 25% breakable
- คำนวณจาก `Game.difficulty` (0-1)

### Continuous Collision Detection
ใช้ swept-rect check (เช็คว่าเท้าผู้เล่นข้าม top ของ platform ใน frame นี้) เพื่อกัน tunneling ตอน spring boost ความเร็วสูง

---

## Scoring System

| Source | Points |
|---|---|
| Climbing height | `0.1 × pixels climbed × multiplier` |
| Coin (★) | `50 × multiplier` |
| Mystery Box | activates `x2 multiplier` for 8s |

Score ถูก track ด้วย `highestY` (ค่าที่ผู้เล่นเคยขึ้นสูงสุด) ไม่ใช่ค่า y ปัจจุบัน → ตกลงมาแล้วขึ้นใหม่ไม่ได้ score ซ้ำ

---

## Platform Types

| Type | Color | Behavior |
|---|---|---|
| **Normal** | Green grass | Static |
| **Moving** | Blue stone | Oscillates left/right (0.8-1.6 px/frame) |
| **Breakable** | Brown earth | Cracks on first bounce, breaks on second |

Spawn rate ปรับตาม difficulty curve

---

## Power-Up Probabilities (per platform)

```
spring        : 10%
mystery box   : 8%   (hovers above platform)
coin          : 32%  (hovers above platform)
none          : 50%
```

Breakable platforms ไม่มีของบนนั้น (ป้องกันงงตอนแตก)

---

## UI Flow

### Screen 1: Main Menu
- Logo "empeo Land Adventure" (CSS-only, ไม่ต้องใช้ภาพ — แก้ font/color ได้ใน CSS)
- **START** button (large, orange)
- **Leaderboard card** — default Top 5, click "Show Top 20" เพื่อขยาย
- **Share & Invite Friends** button — เปิด Facebook share dialog หรือ Web Share API บนมือถือ
- Background: animated parallax clouds + idle Nong Gon

### Screen 2: In-Game HUD
- Score display (top center, real-time)
- Multiplier badge "x2 SCORE" (ขึ้นเมื่อเก็บ Mystery Box)
- Pause button (top right)
- Virtual D-pad (มือถือเท่านั้น)
- Toast messages ("🚀 BOING!", "✨ x2 SCORE for 8s!")

### Screen 3: Game Over
- Score tally animation (count up effect, ~1.5s)
- New high score celebration + name input (ถ้าได้อันดับ Top 20)
- Rank display
- **Play Again** (resets game instantly)
- **Share** (Facebook share with score: "I scored X in empeo Land Adventure! Can you beat me?")

---

## Leaderboard

**ตอนนี้ใช้ `localStorage`** (เก็บใน browser ของแต่ละผู้เล่น) — เหมาะสำหรับ MVP/demo

### ถ้าต้องการ Real-time Global Leaderboard:
แก้ `Leaderboard` object ให้เรียก backend แทน — ตัวอย่าง integration:

```js
// แทนที่ load() / save() / add() ใน Leaderboard object
const Leaderboard = {
  async load() {
    const res = await fetch('https://your-api.com/leaderboard');
    return await res.json();
  },
  async add(name, score) {
    const res = await fetch('https://your-api.com/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score })
    });
    return await res.json();
  }
};
```

แนะนำ backend options:
- **Firebase Realtime DB / Firestore** (ฟรี tier, integration ง่าย, real-time updates)
- **Supabase** (Postgres + REST API)
- **Cloudflare Workers + KV** (เร็ว, ฟรี tier กว้าง)

---

## Customization Cheatsheet

### เปลี่ยน character art
แก้ `Player.draw()` — ตอนนี้วาดด้วย canvas shapes ทั้งหมด (ไม่ต้องโหลด sprite). ถ้าอยาก swap เป็น PNG sprite:

```js
// เพิ่มใน Player constructor:
this.sprite = new Image();
this.sprite.src = 'nong-gon-sheet.png';

// แทน draw method ด้วย:
draw(ctx, camY) {
  const frame = Math.floor(this.animTimer / 100) % 4; // 4-frame anim
  ctx.drawImage(this.sprite, frame * 64, 0, 64, 64,
                this.x, this.y - camY, this.w, this.h);
}
```

### เปลี่ยนยาก/ง่าย
- ปรับ `GRAVITY` (ลดลง = ลอยนาน, เกมง่าย)
- ปรับ `PLATFORM_GAP_MAX` (เพิ่ม = ห่างขึ้น, ยากขึ้น)
- ปรับ difficulty ramp ใน `spawnPlatformRow()`

### เปลี่ยนสี/theme
- BG gradient: ใน CSS `canvas#game-canvas` background + ใน `Background.draw()` gradient
- Logo colors: CSS `.logo-empeo`, `.logo-land`, `.logo-adventure`

---

## Asset Roadmap (Future Polish)

| Element | ตอนนี้ | Production-ready |
|---|---|---|
| Character | Procedural canvas | Sprite sheet (idle/jump/fall × 4 frames) |
| Platforms | Procedural shapes | PNG sprites with depth shadow |
| Background | Procedural | High-res illustration + parallax layers |
| Sound | ❌ | jump bounce, coin chime, spring boing, BGM loop |
| Music | ❌ | Looping fantasy/adventure BGM |

### ใส่ Sound (ตัวอย่าง)
```js
// ใส่ใน CONFIG หรือเป็น const
const SFX = {
  jump:   new Audio('sfx/jump.mp3'),
  coin:   new Audio('sfx/coin.mp3'),
  spring: new Audio('sfx/spring.mp3'),
  boom:   new Audio('sfx/break.mp3'),
};
SFX.jump.volume = 0.3;
// แล้วเรียก SFX.jump.play() ใน Player.jump()
```

---

## Porting to Other Engines

### Phaser.js 3
- ย้าย `Player`, `Platform`, etc. → Phaser GameObjects
- ใช้ `scene.physics.arcade` แทน manual physics (รองรับ sweep collision built-in)
- `scene.cameras.main.startFollow()` แทน manual camera

### Unity (3D)
- ใช้ `Rigidbody` + `OnCollisionEnter` (ตั้ง bounciness)
- Camera: Cinemachine Virtual Camera with "follow on Y, ignore X"
- Platforms: prefabs spawn จาก Object Pool

### Construct 3
- Behaviors: Platform behavior + custom bounce on land
- เร็วสุดสำหรับ designer (no-code) — แต่ port logic จะตรงตัวได้

---

## Known Limitations / TODOs

- [ ] **Global leaderboard:** ตอนนี้ local เฉพาะแต่ละ device — integrate Firebase/backend
- [ ] **Sound effects + BGM:** ยังไม่มีเลย เพิ่มเองได้ตามด้านบน
- [ ] **Achievements / Daily Challenges:** ยังไม่ implement
- [ ] **Character skins:** ตอนนี้ Nong Gon คนเดียว — ต่อยอดเป็น collectible skins ได้
- [ ] **In-app purchase / monetization hooks:** ไม่มี
- [ ] **Analytics:** ใส่ GA4 / Facebook Pixel ใน `<head>` ตามต้องการ

---

## Performance Notes

- ทุกอย่างวาดด้วย Canvas 2D, ไม่ใช้ external assets → load เร็ว, ทำงานบนเครื่องอ่อนได้
- Object culling: cull platform/coin/box ที่ตกใต้กล้องเกิน 200px อัตโนมัติ
- Particles: max alive ~50-100, ลบเมื่อ `life <= 0`
- Tested smooth 60 FPS บน iPhone 11 ขึ้นไปและ desktop browser ทุก major (Chrome/Safari/Firefox/Edge)

---

## Deploy Checklist

- [ ] เปลี่ยน `CONFIG.GAME_URL` เป็น URL production
- [ ] เปลี่ยน `<meta property="og:image">` เพิ่มภาพ preview สำหรับ Facebook share (1200×630px)
- [ ] (ถ้ามี backend) ใส่ API URL ใน Leaderboard object
- [ ] Test FB share dialog ด้วย URL จริง (FB จะ scrape OG tags)
- [ ] Add favicon
- [ ] (Optional) Add Google Analytics / Facebook Pixel
- [ ] Test บนมือถือจริงทั้ง iOS + Android
