# Rillkeepers — Game Design Document

## 1. Vision & Core Philosophy

**Rillkeepers** is an environmental cooperative game where water is an active physical and topological system that transforms the playable world.

Rather than static puzzle triggers, opening a sluice gate changes the state of the entire water network: channels fill, dry canals overflow, floating platforms drift along currents, and downstream machinery awakens.

Players must coordinate in real time:
- One player holds open a heavy gate while another guides a floating platform across a flooded basin.
- Clearing storm debris restores channel pressure to power the high flume.
- The ultimate goal is delivering sufficient pressurized flow to activate the historic valley waterwheel.

---

## 2. World & Environmental Design

### The Handcrafted Valley
- **Top Plateau (Spring Source):** Cold mountain spring with constant inflow (100 flow units).
- **Upper Aqueduct:** Stone canal with the first primary control: **Upper Sluice Gate**.
- **Central Water Splitter (Junction):** Diverts flow between the Western Raft Basin and the Eastern Mill Flume.
- **Raft Basin (Pool 1):** A recessed lake bed currently clogged with storm debris. Clearing debris allows water to raise the pool level, floating the timber raft across to bridge an impassable gorge.
- **Eastern Cliff & Mill Sluice:** Accessible only via the floating raft bridge. Houses the winch for the Mill Race Sluice.
- **Watermill & Great Waterwheel:** Historic timber-and-iron mill wheel requiring $\ge 40$ flow units to activate its gear train.

---

## 3. Water Network Simulation

Water propagation is evaluated deterministically using a directed graph model:
- **Node Types:**
  - `Source`: Inflow generator ($100$ flow units).
  - `Channel`: Transports flow with direction vector.
  - `Gate`: Binary or fractional flow attenuator ($0.0$ to $1.0$).
  - `Debris`: Obstruction node reducing flow to $0$ until cleared.
  - `Pool`: Accumulates inflow over time, driving floating platform buoyancy.
  - `Waterwheel`: Machine requiring minimum inflow to spin.
- **Edge Types:**
  - Carries flow limits and flow velocity vectors.

---

## 4. Visual Aesthetics & Atmosphere

- **Palette:** Moss green, river blue, warm weathered timber, slate grey, weathered ochre, and parchment cream.
- **Art Direction:** Native 16×16 pixel foundation rendered with integer scaling and crisp edges.
- **Tone:** Peaceful, tactile, rustic indie ambiance.
