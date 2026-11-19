/**
 * Everything in the game reads the puck through this interface, in FEET on the floor.
 * x runs left -> right, y runs from the far edge (top of the TV picture) toward the near edge.
 */
export type PuckSample = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  /** 0..1 tracker confidence. */
  conf: number;
  /** False when the tracker has lost the puck (behind a body, off the floor, ...). */
  visible: boolean;
};

export interface PuckSource {
  readonly label: string;
  readonly sample: PuckSample;
  update(dt: number): void;
  destroy(): void;
  /** Only the scripted demo player uses this: it needs to see the fight to decide where to go. */
  drive?(ctx: { encounter: unknown; ready: { x: number; y: number } | null; passing: boolean }): void;
}

export function emptySample(x = 0, y = 0): PuckSample {
  return { x, y, vx: 0, vy: 0, speed: 0, conf: 0, visible: false };
}
