import { expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import { ENHANCED_PRESENTATION } from '../src/enhanced/presentation.ts';

test("every Title's Enhanced camera and light are Damocles's", async () => {
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  expect({
    camera: {
      farPlane: doc.camera.farPlane,
      nearPlane: doc.camera.nearPlane,
      verticalFieldOfViewDegrees: doc.camera.verticalFieldOfViewDegrees
    },
    ground: { fillDropUnits: doc.ground.fillDropUnits },
    lighting: {
      ambientGround: doc.lighting.ambientGround,
      ambientSky: doc.lighting.ambientSky,
      sunColour: doc.lighting.sunColour
    },
    orientation: { modelZ: doc.orientation.modelZ }
  }).toEqual(ENHANCED_PRESENTATION);
});
