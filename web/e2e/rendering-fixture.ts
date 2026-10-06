import { FrameRenderer } from '../src/rendering/renderer.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#frame')!;
const renderer = new FrameRenderer(
  canvas,
  { cullBackFaces: false, lighting: true },
  () => {
    throw new Error('Lost test context');
  }
);
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
const quad = (
  x: number,
  y: number,
  z: number,
  colour: readonly number[],
  centre = [0, 0]
) => {
  const points = [
    [-x, -y],
    [x, -y],
    [x, y],
    [-x, y]
  ];
  return new Float32Array(
    [0, 1, 2, 0, 2, 3].flatMap(i => [
      points[i]![0]! + centre[0]!,
      points[i]![1]! + centre[1]!,
      z,
      ...colour,
      0,
      0,
      0,
      0
    ])
  );
};
const api = {
  renderDistantIsland: (enhanced = false) => {
    // A finite blue sea plane overlaps a distant white island silhouette.
    // It must not erase the land, while later foreground geometry still covers it.
    const empty = new Float32Array();
    const vertices = new Float32Array([
      ...quad(20, 10, 100, [0, 0, 0.4]),
      ...quad(2, 2, 50, [0, 1, 0], [-10, 3.5])
    ]);
    const plan = {
      clear: [0, 0, 0.4] as const,
      farPlane: 1000,
      fillTriangleCount: 2,
      groundTriangleCount: 0,
      horizonIslandVertices: quad(400, 300, 500, [1, 1, 1]),
      horizonVertices: empty,
      islandTriangleCount: 0,
      nearPlane: 1,
      skyVertices: empty,
      triangleCount: 4,
      verticalFieldOfViewDegrees: 45,
      vertices
    };
    renderer.render(
      plan,
      enhanced
        ? {
            lighting: {
              ambientGround: [1, 1, 1],
              ambientSky: [1, 1, 1],
              shadowDepth: 1,
              sunColour: [0, 0, 0],
              sunView: { x: 0, y: 1, z: 0 },
              sunWorld: { x: 0, y: 1, z: 0 }
            }
          }
        : undefined
    );
    return {
      centre: sample(4, 3),
      error: canvas.getContext('webgl2')!.getError(),
      foreground: sample(2, 2)
    };
  },
  renderViewFixed: (enhanced = false) => {
    // A red wall nearer than a green cab: the cab is fixed to the view, so it paints over
    // the wall where they overlap, and the wall still covers the clear elsewhere.
    const empty = new Float32Array();
    renderer.render(
      {
        clear: [0, 0, 0],
        farPlane: 1000,
        fillTriangleCount: 0,
        groundTriangleCount: 0,
        horizonIslandVertices: empty,
        horizonVertices: empty,
        islandTriangleCount: 0,
        nearPlane: 1,
        skyVertices: empty,
        triangleCount: 2,
        verticalFieldOfViewDegrees: 45,
        vertices: quad(30, 30, 20, [1, 0, 0]),
        viewFixedVertices: quad(2, 2, 50, [0, 1, 0], [-10, 3.5])
      },
      enhanced
        ? {
            lighting: {
              ambientGround: [1, 1, 1],
              ambientSky: [1, 1, 1],
              shadowDepth: 1,
              sunColour: [0, 0, 0],
              sunView: { x: 0, y: 1, z: 0 },
              sunWorld: { x: 0, y: 1, z: 0 }
            }
          }
        : undefined
    );
    return {
      cab: sample(2, 2),
      error: canvas.getContext('webgl2')!.getError(),
      wall: sample(4, 3)
    };
  }
};
declare global {
  interface Window {
    renderingFixture: typeof api;
  }
}
window.renderingFixture = api;
api.renderViewFixed();
document.getElementById('result')!.textContent = 'ready';
