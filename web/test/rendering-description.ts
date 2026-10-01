import type { FrameDescription } from '../src/rendering/description.ts';

export const renderingDescription: FrameDescription = {
  background: { index: 0 },
  paletteBands: [
    {
      colours: [
        [0, 0, 0],
        [255, 0, 0],
        [0, 255, 0]
      ],
      fromRow: 0
    },
    {
      colours: [
        [0, 0, 0],
        [0, 0, 255],
        [0, 255, 0]
      ],
      fromRow: 3
    }
  ],
  primitives: [
    {
      camera: [
        { d: 4, u: 2, v: -2 },
        { d: 4, u: -2, v: -2 },
        { d: 4, u: -2, v: 2 },
        { d: 4, u: 2, v: 2 }
      ],
      colour: { index: 1 },
      kind: 'polygon',
      order: 0,
      screen: [
        [2, 1],
        [6, 1],
        [6, 5],
        [2, 5]
      ],
      source: 'face'
    },
    {
      camera: [
        { d: 4, u: 4, v: 0 },
        { d: 4, u: -3, v: 0 }
      ],
      colour: { index: 2 },
      kind: 'line',
      order: 1,
      screen: [
        [0, 3],
        [7, 3]
      ],
      source: 'line'
    },
    {
      colour: { index: 1 },
      kind: 'point',
      order: 2,
      screen: [4, 3],
      source: 'star'
    }
  ],
  projection: { centre: [4, 3], focal: 4, height: 6, near: 0.001, width: 8 }
};
