# 🐸 empeo Land Adventure

> Vertical endless platformer built with vanilla HTML5 Canvas — single file, no dependencies.

Play as Nong Gon, the empeo mascot, and jump as high as possible before the lava catches up!

---

## 🎮 How to Play

| Control | Action |
|---|---|
| ← → Arrow / A D | Move left / right |
| 📱 Tilt (mobile) | Analog tilt control (gyroscope) |
| Auto-jump | Land on any platform to bounce |
| 🍄 Spring | Land on spring for mega boost |
| 💎 Diamond | Rare collectible — bonus points |
| 🪙 Coin | +25 points |

---

## 🌍 Level Progression (every 2,000 pts)

| Score | Level | Theme |
|---|---|---|
| 0 | 🌤 Sky Day | Blue sky ☀️ — gentle breeze |
| 2,000 | 🌅 Sunset | Orange-red sky 🌄 |
| 4,000 | 🌙 Night | Deep purple 🌙 Moon + stars |
| 6,000 | 🌌 Aurora | Dark teal 🌌 Aurora borealis |
| 8,000 | 🚀 Space | Black space ✨ Twinkling stars |

---

## 📋 Changelog

### v1.0 — 2026-05-08

#### ✨ New Features
- **Lava gradient** — lava surface now renders with a temperature-based linear gradient (dark charcoal-red → glowing orange) covering both the wave layers and base rectangle seamlessly
- **Heat atmosphere overlay** — as `autoScrollSpeed` increases, a translucent orange-red haze rises from the lava and a radial glow emanates from the bottom-centre of the screen; intensity scales from 0 → 30% at max speed
- **Mario-style death animation** — on game-over the player sprite switches to `gon-shocked.png`, launches upward with an initial velocity of −13, then falls under gravity until off-screen before the Game Over card appears
- **`gon-shocked.png` asset** — new shocked-face sprite automatically loaded at boot alongside the normal `gon.png`

#### 🎨 Visual Polish
- **Lava wave amplitude reduced** (`waveAmp` 10 → 5, point count 48 → 20) — simulates thick, viscous lava texture instead of fluid water
- **"LAVA RISING" warning** — text now appears immediately when lava becomes visible (removed the old speed-gate threshold)
- **Contain-mode responsive layout** — `#canvas-wrap` now uses `max-width: 100vw` / `max-height: 100dvh` with `width: auto`; the 400×700 canvas is always letterboxed or pillarboxed — no stretching on any device

#### 🐛 Bug Fixes
- Fixed `const speedStage` declaration lost during a refactor — game speed scaling now works correctly again
- `gameLoop` guard updated to include `'dying'` state so the death animation renders correctly each frame

#### ⚙️ State Machine
Added `'dying'` to the game state machine (`menu | playing | countdown | paused | dying | gameover`):

| State | Behaviour |
|---|---|
| `dying` | Physics-only update (gravity, no collision); renders `gon-shocked`; transitions to `gameover` once player exits viewport |

---

### v0.5 — 2026-05-06

#### ✨ New Features
- **Dynamic theme system** — background sky, sun/moon, stars, cloud tint, and bird visibility all change per level
- **Frame-rate independent physics** — all movement normalized to 60fps baseline via `dtFactor = dt / 16.667`

#### ⚡ Game Speed System
- Speed increases every **2,000 points** (via `SPEED_STAGE_INTERVAL`)
- `SPEED_INCREMENT: 0.08` (+8% per stage), `SPEED_MAX: 1.8`
- All physics scale with `gameSpeed`: gravity, movement, moving platforms, lava scroll

#### 🦘 Jump Height Fix
- `jumpScale = √gameSpeed` applied to every jump and spring bounce
- Keeps apex height constant across all speed stages: `apex = vy² / (2 × g × gameSpeed)`

#### 🐛 Bug Fixes
- **Platform hitbox tunneling** — `prevFootBottom` now multiplied by `gameSpeed` to match actual movement distance; prevents platforms being missed at high speeds
- **Moving platforms** — now share the same green-grass style as normal platforms; directional arrows removed

#### 📱 Mobile & Responsive
- Portrait mode: `scale = h / CONFIG.HEIGHT` — canvas height always equals viewport height; lava always visible at bottom
- PC / Landscape: contain mode — no cropping on any device
- **Pause button** — `position: fixed` top-right; 52×52px tap target; `safe-area-inset` support for iPhone notch / Dynamic Island

#### ⚙️ Physics Constants
| Constant | Value | Notes |
|---|---|---|
| `GRAVITY` | 0.45 | Snappy fall feel |
| `JUMP_VELOCITY` | -15.5 | Compensates for gravity increase |
| `SPRING_VELOCITY` | -22.0 | Proportional boost |
| `SCROLL_START_SCORE` | 1000 | Lava starts at 1,000 pts |
| `SCROLL_MAX_SPEED` | 0.75 | Not too punishing |

---

## 🏗️ Architecture

Single-file HTML5 app (`index.html`) — no build step required.

```
CONFIG          — all constants, level defs, theme data
Utils           — math helpers
Input           — keyboard, touch D-pad, gyroscope tilt
Background      — dynamic sky/stars/sun/moon/clouds/birds (theme-aware)
Player          — Nong Gon mascot, dtFactor physics, shocked death sprite
Platform        — normal | moving | breakable
Spring          — mega-boost collectible
Game            — main loop, collision, camera, difficulty scaling, death animation
UI              — HUD, menus, leaderboard, share, biome banner
```

---

## 🚀 Run Locally

```bash
npx -y browser-sync start --server . --files "**/*.html" --port 3000
# then open http://localhost:3000
```

Or just open `index.html` directly in any browser — no server required for basic play.
