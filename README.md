# game2D

A multi-game WebRTC subterranean multiplayer gaming platform hosted on GitHub Pages under `/game2D/`.

Built with **Phaser 3**, **Trystero (Nostr + BroadcastChannel WebRTC)**, **TypeScript**, and **Vite**.

---

## 🎮 Games in this Repository

### 1. [Deepvein: Powder & Pickaxe](./powder-and-pickaxe/)
*Route: `/game2D/powder-and-pickaxe/`*

A tactical 2D subterranean extraction and sabotage game for 2 to 8 players, featuring Crew vs. Crew, Free-For-All, or Solo/Co-op vs. Rival AI Sappers.

- **Destructible Seeded Caverns:** 72x72 tile cavern procedurally carved using Mulberry32 PRNG, Cellular Automata, and Voronoi mineral veins (Granite, Dirt, Timber Walls, Gold Seams, Water Pockets, and Volatile Swamp Gas).
- **Physical Two-Handed Carrying & Throwing:** Players hoist Gold Crates or Powder Kegs in both hands (-35% speed penalty) and throw them with velocity, wall bouncing, and sliding friction.
- **Powder Kegs & Hot-Potato Sabotage:** 4.0-second ticking fuses. Any player can run up to a lit keg on the ground, pick it up (`E`), and throw it back at the enemy! Kegs carve craters, pop gold crates, and chain-detonate adjacent kegs or gas pockets.
- **Cellular Water Flooding Simulation:** Pressurized water breaches flow into empty floor tiles, slowing movement by 25%, extinguishing lit powder keg fuses, and floating gold crates along currents.
- **Dynamic Darkness & Stealth:** Ambient darkness mask with warm amber lantern radii and directional cones. Players can shutter lanterns (`F`) for darkness stealth, while acoustic ring ripples reveal mining, sprinting, and gunshots in pitch black.
- **Serverless Peer-to-Peer WebRTC:** Connect via Trystero over Nostr relays with local-tab BroadcastChannel fallback (<5ms latency). Includes a live discovery lobby, shareable 1-click invite URLs (`?room=XXXX`), and 4-letter room codes.
- **Procedural Retro Audio:** Zero-dependency WebAudio synthesized SFX for pickaxe strikes, digging crunches, wood snapping, fuse hissing, and cavernous explosion booms.

---

## 🕹 Controls

| Action | Control |
| :--- | :--- |
| **Move Miner** | `W`, `A`, `S`, `D` / Arrow Keys |
| **Aim Angle** | Mouse Cursor |
| **Pickaxe / Flintlock / Throw** | Left Click / `Space` |
| **Switch Active Tool** | `1` (Pickaxe), `2` (Flintlock Pistol) |
| **Hoist / Throw Object** | `E` / `Space` |
| **Light Fuse (4.0s)** | `Q` / Right Click |
| **Shutter Lantern (Stealth)** | `F` |
| **Mute SFX** | Sound Toggle Button |

---

## 🏗 Multi-Game Architecture

Adding future games to this repository only requires:
1. Creating a folder under `games/<game-slug>/` with an `index.html` and entry script.
2. Adding Rollup input in `vite.config.ts`:
   ```ts
   input: {
     main: resolve(__dirname, 'index.html'),
     'powder-and-pickaxe': resolve(__dirname, 'games/powder-and-pickaxe/index.html'),
     '<game-slug>': resolve(__dirname, 'games/<game-slug>/index.html')
   }
   ```
3. Running `npm run build` generates:
   - `dist/index.html` (The Arcade Hub)
   - `dist/powder-and-pickaxe/index.html`
   - `dist/<game-slug>/index.html`

---

## 🚀 Development & Build

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Compile TypeScript and build for production
npm run build

# Preview production build locally
npm run preview
```

---

## 📜 License & Credits

All code, procedural pixel art matrices, and WebAudio synthesizer scripts are dedicated to the public domain under [CC0 1.0 Universal](./CREDITS.md).

