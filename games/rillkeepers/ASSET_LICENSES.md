# Asset Licenses and Attribution

This document records the origin, licensing, and modifications of all artistic, graphical, and acoustic assets included in **Rillkeepers**.

---

## 1. Original Pixel Art Assets

- **valley_tiles.png** (16×16 Valley Terrain, Stone Walls, Canals, Bridges, Cottage Walls)
  - **Author:** Rillkeepers Game Team / Lead Game Engineer
  - **Source:** Original creation for Rillkeepers project via `scripts/generate-assets.js`
  - **License:** CC0 1.0 Universal (Public Domain Dedication)
  - **Modifications:** Original artwork handcrafted specifically for the valley waterworks environment.

- **water_tiles.png** (16×16 Animated Flow Frames, Shallows, Pools, Splash Droplets)
  - **Author:** Rillkeepers Game Team / Lead Game Engineer
  - **Source:** Original creation for Rillkeepers project
  - **License:** CC0 1.0 Universal (Public Domain Dedication)
  - **Modifications:** Original artwork with directional flow frames and surface shimmers.

- **mechanics.png** (32×32 Sluice Gates, 32×32 8-Frame Rotating Waterwheel, Raft, Debris, Levers)
  - **Author:** Rillkeepers Game Team / Lead Game Engineer
  - **Source:** Original creation for Rillkeepers project
  - **License:** CC0 1.0 Universal (Public Domain Dedication)
  - **Modifications:** Handcrafted mechanics sprites with states for open/closed gates and animated wheel rotation.

- **crew.png** (16×16 4-Player Character Spritesheet with 4 Directions and Walk Cycles)
  - **Author:** Rillkeepers Game Team / Lead Game Engineer
  - **Source:** Original creation for Rillkeepers project
  - **License:** CC0 1.0 Universal (Public Domain Dedication)
  - **Modifications:** Handcrafted 4-color palette crew sprites (Teal, Rust, Olive, Ochre).

---

## 2. Procedural Web Audio Engine

- **Sound Effects Engine:** Built-in procedural synthesis using Web Audio API (`AudioContext`, `OscillatorNode`, `BiquadFilterNode`, `GainNode`).
  - **Author:** Rillkeepers Game Team
  - **Source:** `src/audio/SoundEffects.ts`
  - **License:** MIT License
  - **Description:** Zero-latency, mathematically synthesized acoustic effects for water flows, wooden gate cranks, splashes, footstep thuds, stone grinding, and victory fanfare.

---

## 3. Typography

- **Cinzel**
  - **Author:** Natanael Gama
  - **License:** SIL Open Font License (OFL) 1.1
  - **Source:** Google Fonts

- **Nunito**
  - **Author:** Vernon Adams, Jacques Le Bailly
  - **License:** SIL Open Font License (OFL) 1.1
  - **Source:** Google Fonts

- **JetBrains Mono**
  - **Author:** JetBrains
  - **License:** SIL Open Font License (OFL) 1.1
  - **Source:** Google Fonts
