# Rillkeepers — Technical Architecture

## 1. System Overview

```
                         Browser Clients (1–4 Players)
                        ┌────────────────────────────┐
                        │      Phaser 4 Engine       │
                        │   - BootScene & ValleyScene│
                        │   - Prediction & Lerp      │
                        │   - WebAudio Sound Synth   │
                        │   - HTML/CSS UI Overlay    │
                        └─────────────┬──────────────┘
                                      │ WebRTC DataChannels (P2P)
                                      ▼
                        Host Player Browser Instance
                        ┌────────────────────────────┐
                        │       HostAuthority        │
                        │   - 20 Hz Authoritative Sim│
                        │   - 10 Hz State Broadcast  │
                        │   - Event Sequencing       │
                        │   - 4-Player Slot Manager  │
                        └────────────────────────────┘
                                      ▲
                                      │ Nostr Ephemeral Discovery
                        ┌─────────────▼──────────────┐
                        │   Public Nostr Relays      │
                        │      (Trystero SDK)        │
                        └────────────────────────────┘
```

---

## 2. Directory Structure

```
games/rillkeepers/
  index.html                  # Game UI & canvas root
  package.json                # Workspace package definition
  vite.config.ts              # Local Vite configuration
  tsconfig.json               # Client TypeScript configuration
  README.md                   # Game overview & instructions
  DESIGN.md                   # Game design document
  ARCHITECTURE.md             # Technical architecture (this file)
  NETWORKING.md               # Detailed WebRTC P2P specification
  ASSET_LICENSES.md           # CC0 & asset attribution
  scripts/
    generate-assets.js        # Pixel-art spritesheet generator
  public/
    assets/
      tilesets/               # valley_tiles.png, water_tiles.png
      characters/             # crew.png (4-player sprites)
      mechanics/              # mechanics.png (gates, wheels, rafts)
  src/
    main.ts                   # Phaser game bootstrap
    config.ts                 # Constants & networking configuration
    game/
      scenes/
        BootScene.ts          # Texture & animation loader
        ValleyScene.ts        # Handcrafted world & gameplay scene
      ui/
        MenuManager.ts        # HTML/CSS UI overlay manager
    networking/
      Transport.ts            # ITransport interface definition
      TrysteroTransport.ts    # Real Trystero WebRTC + Nostr transport
      MockTransport.ts        # In-memory transport for deterministic testing
      NetworkManager.ts       # Unified P2P multiplayer manager
      HostAuthority.ts        # Host-authoritative 20Hz simulation & slot manager
      GuestClient.ts          # Guest prediction, interpolation & heartbeat watcher
      Protocol.ts             # Strongly typed message schemas & runtime validators
      RoomCode.ts             # Crockford Base32 room code & URL generator
      Prediction.ts           # Client-side input prediction
      Interpolation.ts        # Remote player smooth interpolation
    shared/
      Simulation.ts           # Authoritative game simulation
      WaterGraph.ts           # Deterministic water network engine
      GameState.ts            # State schemas & snapshot types
    audio/
      SoundEffects.ts         # Procedural Web Audio synthesizer
  tests/
    waterNetwork.test.ts      # Water simulation tests (7 tests)
    simulation.test.ts        # Movement, interaction & raft tests (7 tests)
    multiplayer.test.ts       # Protocol, room codes & validation tests (8 tests)
    multiplayerIntegration.test.ts # Multi-client P2P host-authority tests (4 tests)
```

---

## 3. Monorepo Isolation & Build Integration

- Rillkeepers is strictly isolated inside `games/rillkeepers/`.
- Root `vite.config.ts` dynamically registers all present games (`rillkeepers` and `powder-and-pickaxe` when present).
- Production build outputs to `dist/` with base path `/game2D/`:
  - `dist/index.html` — Arcade Hub
  - `dist/rillkeepers/index.html` — Rillkeepers Game
- GitHub Actions workflow (`.github/workflows/deploy.yml`) runs tests, generates assets, verifies build outputs, and deploys to GitHub Pages as a 100% static site without backend servers.
