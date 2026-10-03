import { panelRgba } from '../src/shell/panelPixels.ts';
import { readTargPanelDocument } from '../src/shell/targPanelDocument.ts';
import {
  drawTargPanel,
  targPanelReadouts
} from '../src/shell/targPanelWriter.ts';

/// Deterministic C64-adapter inputs for maintainer review, independent of time.
const doc = readTargPanelDocument(
  await (await fetch('/payload/targ-st/panel.json')).json()
);
const states = {
  airborne: {
    altitude: '00123',
    altitudeLamp: true,
    compassDegrees: 90,
    elevationDegrees: 30,
    groundLamp: false,
    locationLabel: '12-34',
    message: '    PRESTINIUM ABOARD   ',
    runLamp: false,
    speed: '+0240'
  },
  arrival: {
    altitude: '*****',
    altitudeLamp: false,
    compassDegrees: 0,
    elevationDegrees: 0,
    groundLamp: false,
    locationLabel: '**-**',
    message: 'M E R C E N A R Y',
    runLamp: false,
    speed: '*****'
  },
  'on-foot': {
    altitude: '00000',
    altitudeLamp: false,
    compassDegrees: 0,
    elevationDegrees: 0,
    groundLamp: false,
    locationLabel: '08-08',
    message: '    AIRCRAFT ON PAD     ',
    runLamp: false,
    speed: '+0000'
  },
  reverse: {
    altitude: '99999',
    altitudeLamp: true,
    compassDegrees: 270,
    elevationDegrees: -30,
    groundLamp: true,
    locationLabel: '99-99',
    message: '     ALTITUDE ALERT    ',
    runLamp: false,
    speed: '-0123'
  },
  room: {
    altitude: '00001',
    altitudeLamp: false,
    compassDegrees: 359.9,
    elevationDegrees: 0,
    groundLamp: false,
    locationLabel: 'RM 09',
    message: '     PRESS TO EXIT     ',
    runLamp: true,
    speed: '+10000'
  }
};
const state = new URLSearchParams(location.search).get('state') ?? 'on-foot';
if (state !== 'pristine' && !(state in states)) {
  throw new Error(`Unknown Targ state ${state}`);
}
const canvas = document.querySelector<HTMLCanvasElement>('#panel')!;
const context = canvas.getContext('2d')!;
const image = context.createImageData(320, 64);
panelRgba(
  state === 'pristine'
    ? { palette: { lower: doc.palette, upper: doc.palette }, pixels: doc.art }
    : drawTargPanel(
        doc,
        targPanelReadouts(states[state as keyof typeof states])
      ),
  image.data
);
context.putImageData(image, 0, 0);
document.querySelector('#state')!.textContent = `Targ: ${state}`;
canvas.dataset['state'] = 'ready';
