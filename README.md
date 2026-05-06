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
| 📦 Mystery box | Collect for ×2 score (8 seconds) |
| 🪙 Coin | +50 points |

---

## 🌍 Level Progression (every 2,000 pts)

| Score | Level | Theme | Speed |
|---|---|---|---|
| 0 | 🌿 Lv.1 Meadow | Blue sky ☀️ Sun + birds | ×1.00 |
| 2,000 | ⛅ Lv.2 Hills | Green sky ☀️ Soft light | ×1.08 |
| 4,000 | 🌤️ Lv.3 Cliffs | Orange-red 🌅 Sunset clouds | ×1.16 |
| 6,000 | ⚡ Lv.4 Peaks | Deep purple 🌙 Moon + stars | ×1.24 |
| 8,000 | ✨ Lv.5 Heaven | Blood red ☀️ Pink clouds | ×1.32 |
| 10,000 | 🌌 Lv.6 Space | Black space 🌙 Twinkling stars | ×1.40 |

---

## 📋 Changelog

### v0.5 — 2026-05-06

#### ✨ New Features
- **Dynamic theme system** — background sky, sun/moon, stars, cloud tint, and bird visibility all change per level
- **Lv.6 Space** — dark space theme with twinkling stars and crescent moon; no birds
- **Frame-rate independent physics** — all movement normalized to 60fps baseline via `dtFactor = dt / 16.667`

#### ⚡ Game Speed System
- Speed increases every **2,000 points** (via `SPEED_STAGE_INTERVAL`)
- `SPEED_INCREMENT: 0.08` (+8% per stage), `SPEED_MAX: 1.8`
- All physics scale with `gameSpeed`: gravity, movement, moving platforms, lava scroll

#### 🦘 Jump Height Fix
- `jumpScale = √gameSpeed` applied to every jump and spring bounce
- Keeps apex height constant across all speed stages: `apex = vy² / (2 × g × gameSpeed)`

#### 🐛 Bug Fixes
- **Platform hitbox tunneling** — `prevFootBottom` now multiplied by `gameSpeed` to match actual movement distance; prevents platforms from being missed at high speeds
- **Moving platforms** — now share the same green-grass style as normal platforms; directional arrows removed

#### 📱 Mobile & Responsive
- Portrait mode: `scale = h / CONFIG.HEIGHT` — canvas height always equals viewport height; lava always visible at bottom
- PC / Landscape: `scale = Math.min(...)` contain mode — no cropping
- **Pause button** — changed to `position: fixed` top-right corner; 52×52px tap target; `safe-area-inset` support for iPhone notch / Dynamic Island; no 300ms tap delay

#### 🎨 Visual Polish
- Removed toast notifications for level changes and ×2 score (less noise)
- Rainbow removed from background
- Moving platforms use same palette as normal platforms
- Islands bob gently with subtle sine wave animation

#### ⚙️ Physics Tuning
| Constant | Value | Notes |
|---|---|---|
| `GRAVITY` | 0.45 | Snappy fall feel |
| `JUMP_VELOCITY` | -15.5 | Compensates for gravity increase |
| `SPRING_VELOCITY` | -22.0 | Proportional boost |
| `MAX_FALL_SPEED` | 20.0 | Fast landing |
| `SCROLL_START_SCORE` | 1000 | Lava starts earlier |
| `SCROLL_MAX_SPEED` | 0.75 | Not too punishing |

---

## 🏗️ Architecture

Single-file HTML5 app (`index.html`) — no build step required.

```
CONFIG          — all constants, level defs, theme data
Utils           — math helpers
Input           — keyboard, touch D-pad, gyroscope tilt
Background      — dynamic sky/stars/sun/moon/clouds/birds (theme-aware)
Player          — Nong Gon mascot, dtFactor physics
Platform        — normal | moving | breakable
Game            — main loop, collision, camera, difficulty scaling
UI              — HUD, menus, leaderboard, share
```

---

## 🚀 Run Locally

```bash
open index.html   # macOS
# or just drag index.html into any browser
```

No server required — pure vanilla HTML5 Canvas.
