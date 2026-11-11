# Rillkeepers (game2D Arcade - Game #2)

**Rillkeepers** is an original top-down 2D cooperative multiplayer environmental adventure game built for 1–4 players.

Players are the maintenance crew of a secluded valley whose ancient water infrastructure was damaged in a major storm. Together, they must explore the handcrafted valley, operate wooden sluice gates, clear storm debris, navigate water currents on floating rafts, and redirect flow to restore the historic valley watermill.

---

## Production & Arcade URLs

- **Arcade Hub:** `https://mid-nightshark.github.io/game2D/`
- **Rillkeepers Game:** `https://mid-nightshark.github.io/game2D/rillkeepers/`

---

## Technical Stack

- **Framework:** Phaser 4.2.1
- **Language:** TypeScript 5
- **Bundler:** Vite 6
- **Architecture:** Monorepo with isolated game workspace (`games/rillkeepers/`)
- **Audio:** Custom zero-latency procedural Web Audio synthesizer
- **Multiplayer Networking:** Serverless WebRTC DataChannels + Nostr Signaling (Trystero P2P)
- **Authority Model:** Host-Authoritative Simulation (20 Hz tick, 10 Hz snapshot broadcasts)
- **Hosting:** 100% Static Web on GitHub Pages (Zero backend servers or Cloudflare credentials needed)
- **Unit & Integration Testing:** Vitest (26 automated tests)

---

## Controls

### Desktop Keyboard
- **Movement:** `W, A, S, D` or `Arrow Keys`
- **Contextual Interact:** `E` (operate sluice gates, clear debris)
- **Pick Up / Drop:** `Space` (pick up and carry crates/supplies)
- **Pause / Valley Menu:** `Escape`

### Local 2-Player Co-op
- **Player 1:** `W, A, S, D` + `E` (Interact) + `Space` (Carry)
- **Player 2:** `Arrow Keys` + `Enter` (Interact) + `M` (Carry)

### Mobile Touch
- Responsive on-screen virtual D-pad and dedicated `E` / `SPACE` touch action buttons.

---

## Running Locally

### 1. Install Dependencies
From the repository root:
```bash
npm install
```

### 2. Generate Pixel Art Assets
```bash
npm --prefix games/rillkeepers run generate-assets
```

### 3. Run Development Server
```bash
# Serves the full multi-game arcade hub + Rillkeepers
npm run dev
```
Open `http://localhost:3000/` in your browser.

### 4. Run Automated Tests
```bash
npm test
```

### 5. Build for Production
```bash
npm run build
```
Build output is generated into `dist/` and verified with GitHub Actions.
