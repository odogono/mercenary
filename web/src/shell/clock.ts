/// The Browser Shell's fixed-step bridge from display time to Game Semantics time.
///
/// `requestAnimationFrame` supplies milliseconds at the display's cadence. The Gameplay
/// Session instead receives an ordered run of 1/60-second steps, whatever cadence the display
/// chose. A long visible stall contributes at most a quarter second, and `reset` discards both
/// the prior timestamp and any fractional remainder after focus or visibility suspension.
export class FixedStepClock {
  static readonly maximumFrameSeconds = 0.25;
  static readonly stepSeconds = 1 / 60;

  private accumulator = 0;
  private lastTimestamp: number | undefined;

  /// Display time received but not yet stepped, in seconds: less than one step. The Enhanced
  /// view counts it toward the next pass so it does not stand still on a frame with no step
  /// (ADR 0078).
  get leftover(): number {
    return this.accumulator;
  }

  reset(): void {
    this.accumulator = 0;
    this.lastTimestamp = undefined;
  }

  frame(timestamp: number, advance: (seconds: number) => void): number {
    if (!Number.isFinite(timestamp)) {
      this.reset();
      return 0;
    }
    const previous = this.lastTimestamp;
    this.lastTimestamp = timestamp;
    if (previous === undefined) {
      return 0;
    }

    const elapsed = Math.min(
      FixedStepClock.maximumFrameSeconds,
      Math.max(0, (timestamp - previous) / 1000)
    );
    this.accumulator += elapsed;

    let count = 0;
    while (this.accumulator + 1e-12 >= FixedStepClock.stepSeconds) {
      this.accumulator -= FixedStepClock.stepSeconds;
      advance(FixedStepClock.stepSeconds);
      count += 1;
    }
    return count;
  }
}
