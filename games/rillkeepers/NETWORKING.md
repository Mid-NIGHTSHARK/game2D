# Rillkeepers — Networking Architecture & P2P Specification

This document details the serverless, host-authoritative peer-to-peer (P2P) networking architecture for **Rillkeepers** using **Trystero**, **Nostr signaling**, and **WebRTC DataChannels**.

---

## 1. High-Level Architecture

```
                          Peer-to-Peer Mesh (1–4 Players)
                     ┌──────────────────────────────────────┐
                     │          WebRTC DataChannels         │
                     └──────┬────────────────────────┬──────┘
                            │                        │
             ┌──────────────▼──────────┐  ┌──────────▼──────────────┐
             │       Host Player       │  │       Guest Player      │
             │  - HostAuthority        │  │  - GuestClient          │
             │  - 20 Hz Authoritative  │  │  - Client Prediction    │
             │    ValleySimulation     │  │  - Remote Interpolation │
             │  - 10 Hz State Broadcast│  │  - 20 Hz Input Stream   │
             │  - Event Sequencing     │  │  - State Synchronization│
             └─────────────────────────┘  └─────────────────────────┘
                            ▲                        ▲
                            └──────────┬─────────────┘
                                       │ Public Relay Swarm
                         ┌─────────────▼──────────────┐
                         │   Nostr Signaling Relays   │
                         │ (Peer Discovery & SDP/ICE) │
                         └────────────────────────────┘
```

---

## 2. Serverless Signaling via Nostr

- **Strategy:** Uses Trystero's default package (`import { joinRoom, selfId } from 'trystero'`), backed by `@trystero-p2p/nostr`.
- **Function:** Decentralized Nostr relays are used solely to exchange ephemeral WebRTC connection offers, answers, and ICE candidates during initial peer discovery and connection handshakes.
- **Data Path:** Once the WebRTC peer connection is established, all gameplay packets, player inputs, and state snapshots flow directly over encrypted **WebRTC DataChannels** peer-to-peer.
- **Zero Backend Costs:** No backend servers, Cloudflare accounts, API credentials, secrets, or paid hosting are required. Rillkeepers is served as a 100% static site on GitHub Pages.

---

## 3. Dual Cryptographic Room Secret Architecture

To protect signaling privacy and prevent unauthorized peer eavesdropping on Nostr relays, Rillkeepers implements two independent cryptographically generated values:

1. **Room ID (`roomId`):**
   - Public identifier used as the topic identifier for peer discovery.
   - Generated via browser `crypto.getRandomValues()` (10 characters, Crockford Base32 alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, excluding ambiguous characters `0, 1, I, O`).
   - Passed as the second argument to `joinRoom(config, roomId)`.

2. **Room Secret (`roomSecret`):**
   - Private shared signaling encryption key.
   - Generated independently via `crypto.getRandomValues()` (16 characters, Crockford Base32 alphabet).
   - Passed exclusively through `joinRoom({ appId, password: roomSecret }, roomId)`.
   - Never transmitted as plaintext over Nostr or WebRTC.
   - Trystero derives an internal encryption challenge from `roomSecret + appId + roomId` so peers without the correct secret are cryptographically rejected during signaling.

### Invitation URL Format

```
https://mid-nightshark.github.io/game2D/rillkeepers/?room=ROOM_ID#key=ROOM_SECRET
```

- **Query String (`?room=ROOM_ID`):** Identifies the target valley room.
- **Fragment Identifier (`#key=ROOM_SECRET`):** Contains the private encryption secret.
- **Privacy Guarantee:** Under RFC 3986 and HTTP specifications, URL fragments (`#...`) are processed purely on the client side in the browser and are **never sent over HTTP request lines or stored in web server access logs**.
- **No Console Leakage:** The secret key is never emitted into `console.log`, analytics, or error reporting.

### Manual Join Input Options

Guests joining without clicking a direct link can connect using:
1. **Combined Invite Code:** `ROOM_ID.ROOM_SECRET` (e.g. `7K2M9X4B3J.A8W9K2M4P6Q7R8T9`).
2. **Pasted URL:** Pasting the full URL automatically extracts both components.
3. **Separate Inputs:** Entering Room ID and Secret Key in dedicated fields.
4. **Mandatory Secret Enforcement:** A guest **cannot** join with only a Room ID. If a secret is missing, connection is immediately blocked with an informative message.

---

## 4. Peer Admission & Host Authority Topology

Gameplay authority is strictly **host-authoritative**:

1. **Peer Admission (`onPeerHandshake`):**
   - Host uses Trystero's native `onPeerHandshake` callback to validate incoming peers during the WebRTC signaling phase.
   - The host enforces a strict **4-player capacity limit** (Host + up to 3 Guests).
   - If the room is already full, `onPeerHandshake` rejects the peer, triggering connection termination before the peer ever becomes active.
   - A redundant application-layer check in `handleJoinRequest` rejects unauthorized join attempts with `Valley crew is full (Max 4 Keepers)`.

2. **Host Authority:**
   - Host runs the fixed 20 Hz simulation step (`ValleySimulation.step()`).
   - Authoritatively validates movement bounds, obstacle collisions, and speeds (`applyPlayerInput`).
   - Enforces interaction proximity limits: guests cannot operate sluice gates, clear debris, or trigger mechanisms without being within interaction range ($50$ px).
   - Authoritatively calculates water flow, channel water levels, floating raft displacement, and waterwheel activation.
   - Assigns player slots and unique tunic colors ($0$: Teal, $1$: Rust, $2$: Olive, $3$: Ochre).
   - Broadcasts authoritative world snapshots at 10 Hz and sequenced events.

3. **Guest Client:**
   - Captures local inputs (`WASD`, arrow keys, `E` interact, `Space` carry).
   - Applies responsive local client-side prediction (`ClientPredictor`).
   - Streams input frames to the host at ~20 Hz (`guest_input`).
   - Reconciles local position against host snapshots and smoothly interpolates remote peers over 100–150 ms (`RemoteInterpolator`).
   - Requests full state resynchronization (`resync_request`) if snapshots or events are missed.

4. **Reconnection & Slot Preservation:**
   - Disconnected guests receive a temporary browser `reconnectToken` in `sessionStorage`. Reconnecting with the same token restores their previous player slot and tunic color.

5. **Host Departure:**
   - If the host disconnects or closes their tab, guests receive an honest "Valley Session Ended" dialog. No silent or corrupt authority migration occurs.

---

## 5. NAT Traversal & Real-World Network Verification

- **STUN / Direct P2P:** Trystero connects peers directly using public STUN servers for ICE candidate gathering.
- **Direct Connection Success:** Most residential, mobile, and broadband connections with Full Cone or Restricted Cone NAT establish direct WebRTC peer connections successfully.
- **Symmetric NAT / Strict Firewalls:** Networks with symmetric NAT or corporate firewalls may fail direct peer connection without a TURN relay. If a connection cannot be established, the game surfaces an informative notice. TURN relay configuration can be passed via `JoinRoomConfig.turnConfig`.
- **Verification Status:**
  - Automated P2P integration and unit test suite: **32/32 PASSING**.
  - Dual Room ID + Room Secret cryptographic isolation: **VERIFIED**.
  - In-browser multi-instance headless Chrome WebRTC evaluation: **VERIFIED**.
  - Separate physical network testing across differing ISPs / restrictive carrier networks: **NOT VERIFIED** (due to local single-host development environment constraints).

---

## 6. Monorepo & Package Management

- Monorepo package manager: **pnpm** (with `pnpm-workspace.yaml`).
- All Rillkeepers source code, assets, audio synthesizers, and tests reside strictly in `games/rillkeepers/`.
- The shared arcade hub at the repository root links to Rillkeepers at `/game2D/rillkeepers/`.
