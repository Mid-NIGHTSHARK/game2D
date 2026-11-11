// Deterministic Graph-Based Water Network for Rillkeepers
// Pure TypeScript - Independent of Phaser or rendering engine.

export type WaterNodeType = 'source' | 'channel' | 'junction' | 'gate' | 'pool' | 'debris' | 'waterwheel';

export interface WaterNode {
  id: string;
  type: WaterNodeType;
  name: string;
  x: number; // World tile X coordinate
  y: number; // World tile Y coordinate
  width?: number; // In tiles
  height?: number;
  inflow: number;  // Current incoming flow (0 - 100)
  outflow: number; // Current outgoing flow (0 - 100)
  level: number;   // Current water depth/level (0.0 to 1.0)
  capacity?: number;
}

export interface WaterEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  maxFlow: number;
  currentFlow: number;
  flowDirection: { x: number; y: number }; // Normalized flow vector for currents
}

export interface GateNode extends WaterNode {
  type: 'gate';
  isOpen: boolean;
  openPercent: number; // 0.0 to 1.0
}

export interface DebrisNode extends WaterNode {
  type: 'debris';
  isCleared: boolean;
  blockagePercent: number; // 1.0 = fully blocked, 0.0 = cleared
}

export interface WaterWheelNode extends WaterNode {
  type: 'waterwheel';
  isSpinning: boolean;
  rpm: number;
  activationThreshold: number; // Minimum inflow needed to spin (e.g., 40)
}

export interface PoolNode extends WaterNode {
  type: 'pool';
  fillProgress: number; // 0.0 to 1.0
  isFilled: boolean;
}

export interface WaterNetworkState {
  nodes: Record<string, WaterNode>;
  edges: Record<string, WaterEdge>;
  tick: number;
}

export class WaterNetwork {
  private nodes: Map<string, WaterNode> = new Map();
  private edges: Map<string, WaterEdge> = new Map();
  private tickCount: number = 0;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.nodes.clear();
    this.edges.clear();
    this.tickCount = 0;
  }

  public addNode(node: WaterNode): void {
    this.nodes.set(node.id, { ...node });
  }

  public addEdge(edge: WaterEdge): void {
    this.edges.set(edge.id, { ...edge });
  }

  public getNode<T extends WaterNode>(id: string): T | undefined {
    return this.nodes.get(id) as T | undefined;
  }

  public getAllNodes(): WaterNode[] {
    return Array.from(this.nodes.values());
  }

  public getAllEdges(): WaterEdge[] {
    return Array.from(this.edges.values());
  }

  public setGateState(gateId: string, isOpen: boolean): boolean {
    const gate = this.getNode<GateNode>(gateId);
    if (!gate || gate.type !== 'gate') return false;
    gate.isOpen = isOpen;
    gate.openPercent = isOpen ? 1.0 : 0.0;
    this.evaluate();
    return true;
  }

  public clearDebris(debrisId: string): boolean {
    const debris = this.getNode<DebrisNode>(debrisId);
    if (!debris || debris.type !== 'debris') return false;
    debris.isCleared = true;
    debris.blockagePercent = 0.0;
    this.evaluate();
    return true;
  }

  /**
   * Deterministic simulation step:
   * 1. Propagates flow from all sources downstream through edges.
   * 2. Evaluates gates (blocks flow when closed).
   * 3. Evaluates debris (blocks flow until cleared).
   * 4. Updates pool fill levels.
   * 5. Checks machinery activation (waterwheels).
   */
  public evaluate(): void {
    this.tickCount++;

    // Reset all non-source node inflows and outflows to 0
    for (const node of this.nodes.values()) {
      if (node.type !== 'source') {
        node.inflow = 0;
        node.outflow = 0;
      } else {
        node.inflow = 100;
        node.outflow = 100;
        node.level = 1.0;
      }
    }

    // Reset edge flows
    for (const edge of this.edges.values()) {
      edge.currentFlow = 0;
    }

    // Topological/breadth-first flow propagation starting from sources
    const queue: string[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === 'source') {
        queue.push(node.id);
      }
    }

    const visitedEdges = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentNode = this.nodes.get(currentId)!;

      // Available flow to send downstream
      let availableFlow = currentNode.inflow;

      // Gate attenuation
      if (currentNode.type === 'gate') {
        const gate = currentNode as GateNode;
        availableFlow *= gate.openPercent;
      }

      // Debris attenuation
      if (currentNode.type === 'debris') {
        const debris = currentNode as DebrisNode;
        if (!debris.isCleared) {
          availableFlow *= (1.0 - debris.blockagePercent);
        }
      }

      currentNode.outflow = availableFlow;
      currentNode.level = Math.min(1.0, availableFlow / 50.0);

      // Find all outgoing edges
      const outgoingEdges = Array.from(this.edges.values()).filter(e => e.fromNodeId === currentId);

      if (outgoingEdges.length === 0) continue;

      // Distribute flow among outgoing edges proportionally to maxFlow
      const totalMaxFlow = outgoingEdges.reduce((sum, e) => sum + e.maxFlow, 0);

      for (const edge of outgoingEdges) {
        if (visitedEdges.has(edge.id)) continue;
        visitedEdges.add(edge.id);

        const share = totalMaxFlow > 0 ? (edge.maxFlow / totalMaxFlow) : (1 / outgoingEdges.length);
        const flowToSend = Math.min(edge.maxFlow, availableFlow * share);
        edge.currentFlow = flowToSend;

        const targetNode = this.nodes.get(edge.toNodeId);
        if (targetNode) {
          targetNode.inflow += flowToSend;
          if (!queue.includes(targetNode.id)) {
            queue.push(targetNode.id);
          }
        }
      }
    }

    // Secondary pass: Update pools and waterwheels
    for (const node of this.nodes.values()) {
      if (node.type === 'pool') {
        const pool = node as PoolNode;
        if (pool.inflow > 10) {
          pool.fillProgress = Math.min(1.0, pool.fillProgress + 0.2);
        } else {
          pool.fillProgress = Math.max(0.0, pool.fillProgress - 0.05);
        }
        pool.isFilled = pool.fillProgress >= 0.8;
        pool.level = pool.fillProgress;
      } else if (node.type === 'waterwheel') {
        const wheel = node as WaterWheelNode;
        if (wheel.inflow >= wheel.activationThreshold) {
          wheel.isSpinning = true;
          wheel.rpm = Math.min(60, (wheel.inflow / 100) * 60);
        } else {
          wheel.isSpinning = false;
          wheel.rpm = 0;
        }
      }
    }
  }

  public serialize(): WaterNetworkState {
    const nodes: Record<string, WaterNode> = {};
    for (const [id, node] of this.nodes.entries()) {
      nodes[id] = { ...node };
    }
    const edges: Record<string, WaterEdge> = {};
    for (const [id, edge] of this.edges.entries()) {
      edges[id] = { ...edge };
    }
    return {
      nodes,
      edges,
      tick: this.tickCount
    };
  }

  public deserialize(state: WaterNetworkState): void {
    this.nodes.clear();
    this.edges.clear();
    for (const [id, node] of Object.entries(state.nodes)) {
      this.nodes.set(id, { ...node });
    }
    for (const [id, edge] of Object.entries(state.edges)) {
      this.edges.set(id, { ...edge });
    }
    this.tickCount = state.tick;
  }
}
