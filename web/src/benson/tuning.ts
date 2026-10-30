/// Display timing, and the instruction budget the test oracle's interpreter runs to.
export interface BensonTunables {
  framesPerSecond: number;
  framesPerTick: number;
  instructionBudget: number;
  messageHoldSeconds: number;
  timeScale: number;
}

export const defaultTunables = (framesPerTick = 50): BensonTunables => ({
  framesPerSecond: 50,
  framesPerTick,
  instructionBudget: 512,
  messageHoldSeconds: 3,
  timeScale: 1
});
