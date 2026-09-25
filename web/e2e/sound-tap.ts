import type { Page } from '@playwright/test';

/// Listens where the speakers do (#513). An AnalyserNode is spliced in wherever the page
/// connects a node to its AudioContext's destination, after mute and volume, and each one is
/// kept on `window.soundTaps` in the order the page made them.

export interface SoundTapScope {
  soundTaps: AnalyserNode[];
}

export const tapDestination = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const taps: AnalyserNode[] = [];
    (window as unknown as SoundTapScope).soundTaps = taps;
    const connect = AudioNode.prototype.connect as (
      this: AudioNode,
      ...args: unknown[]
    ) => unknown;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: unknown[]
    ) {
      if (args[0] === this.context.destination) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 1024;
        connect.call(this, analyser);
        taps.push(analyser);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
};
