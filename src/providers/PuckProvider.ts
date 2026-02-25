export type PuckPoint = { x: number; y: number };
export type PuckVelocity = { x: number; y: number };

export interface PuckProvider {
  update(dt: number): void;
  getPosition(): PuckPoint;
  getVelocity(): PuckVelocity;
  getConfidence(): number;
  destroy?(): void;
}

