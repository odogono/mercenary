import { FrameRenderer } from '../src/rendering/renderer.ts';
import { renderingDescription } from '../test/rendering-description.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#frame')!;
const renderer = new FrameRenderer(canvas, { cullBackFaces: false }, () => {
  throw new Error('Lost test context');
});
const sample = (x: number, y: number): number[] => {
  const bytes = new Uint8Array(4);
  canvas
    .getContext('webgl2')!
    .readPixels(
      Math.floor(((x + 0.5) * canvas.width) / 8),
      Math.floor(canvas.height - ((y + 0.5) * canvas.height) / 6),
      1,
      1,
      WebGL2RenderingContext.RGBA,
      WebGL2RenderingContext.UNSIGNED_BYTE,
      bytes
    );
  return Array.from(bytes);
};
const api = {
  render: (resolved = false) => {
    const description = resolved
      ? {
          ...renderingDescription,
          primitives: renderingDescription.primitives.map(p =>
            p.kind === 'point'
              ? { ...p, colour: { rgb: [12, 180, 7] as const } }
              : p
          )
        }
      : renderingDescription;
    renderer.renderDescription(description);
    return {
      background: sample(0, 0),
      error: canvas.getContext('webgl2')!.getError(),
      height: canvas.height,
      line: sample(3, 3),
      lower: sample(4, 4),
      point: sample(4, 3),
      ratio: devicePixelRatio,
      upper: sample(4, 2),
      width: canvas.width
    };
  }
};
declare global {
  interface Window {
    renderingFixture: typeof api;
  }
}
window.renderingFixture = api;
api.render();
document.getElementById('result')!.textContent = 'ready';
