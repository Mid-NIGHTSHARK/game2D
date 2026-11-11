// Remote player interpolation for smooth rendering

export interface PositionSample {
  x: number;
  y: number;
  direction: 'down' | 'up' | 'left' | 'right';
  isMoving: boolean;
  time: number;
}

export class RemoteInterpolator {
  private samples: Map<string, PositionSample[]> = new Map();
  private interpolationDelayMs: number = 100; // 100ms interpolation buffer

  public pushSample(playerId: string, x: number, y: number, direction: 'down' | 'up' | 'left' | 'right', isMoving: boolean): void {
    let list = this.samples.get(playerId);
    if (!list) {
      list = [];
      this.samples.set(playerId, list);
    }

    list.push({
      x,
      y,
      direction,
      isMoving,
      time: Date.now()
    });

    // Keep up to 20 recent samples
    if (list.length > 20) {
      list.shift();
    }
  }

  public getInterpolatedPosition(playerId: string, renderTime: number): { x: number; y: number; direction: 'down' | 'up' | 'left' | 'right'; isMoving: boolean } | null {
    const list = this.samples.get(playerId);
    if (!list || list.length === 0) return null;

    const targetTime = renderTime - this.interpolationDelayMs;

    // If targetTime is older than first sample, clamp
    if (targetTime <= list[0].time) {
      return {
        x: list[0].x,
        y: list[0].y,
        direction: list[0].direction,
        isMoving: list[0].isMoving
      };
    }

    // If targetTime is newer than latest sample, extrapolate or clamp
    if (targetTime >= list[list.length - 1].time) {
      const latest = list[list.length - 1];
      return {
        x: latest.x,
        y: latest.y,
        direction: latest.direction,
        isMoving: latest.isMoving
      };
    }

    // Find bounding pair
    for (let i = 0; i < list.length - 1; i++) {
      const s0 = list[i];
      const s1 = list[i + 1];
      if (targetTime >= s0.time && targetTime <= s1.time) {
        const span = s1.time - s0.time;
        const progress = span > 0 ? (targetTime - s0.time) / span : 1;
        return {
          x: s0.x + (s1.x - s0.x) * progress,
          y: s0.y + (s1.y - s0.y) * progress,
          direction: s1.direction,
          isMoving: s1.isMoving
        };
      }
    }

    const latest = list[list.length - 1];
    return {
      x: latest.x,
      y: latest.y,
      direction: latest.direction,
      isMoving: latest.isMoving
    };
  }

  public removePlayer(playerId: string): void {
    this.samples.delete(playerId);
  }
}
