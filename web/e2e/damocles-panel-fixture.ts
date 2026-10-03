import { readDamoclesPanelDocument } from '../src/damocles/panelDocument.ts';
import {
  damoclesReadoutWords,
  drawDamoclesPanel,
  type DamoclesPanelView
} from '../src/damocles/panelWriter.ts';
import { panelRgba } from '../src/shell/panelPixels.ts';

/// Fixed writer inputs for ADR 0011 review, independent of the browser's clock.
/// The first three attitudes/readouts are the #716/#740 captured values. This
/// fixture claims the same bounded windows as the captured-plane unit tests.
const document = readDamoclesPanelDocument(
  await (await fetch('/payload/damocles/panel.json')).json()
);
const initial: DamoclesPanelView = {
  ...damoclesReadoutWords({
    eyeY: 63,
    floor: 0,
    panelSpeed: 0,
    rangeAltitude: null,
    speed: 0
  }),
  cash: '00000900000',
  centre: { from: null, steps: 0, to: null },
  clockSeconds: -8583,
  gauges: { inventory: 0, p: 36, t: 23 },
  grid: [7, 8],
  heading: 0x6_00,
  inventory: 'EMPTY',
  lamps: { attack: false, ground: false, run: false },
  location: 'ERIS',
  mask: 0,
  message: {
    cells: ' '.repeat(48),
    planes: Array(48).fill(0),
    scrollPixels: 0
  },
  pitch: 0x1_ff,
  position: [17, 290]
};
const file = {
  item: 'PROBLEM',
  kind: 'document' as const,
  parameter: null,
  slot: 151
};
const computer = {
  item: '139',
  kind: 'computer' as const,
  parameter: 1,
  slot: 101
};
const states: Record<string, Partial<DamoclesPanelView>> = {
  aboard: {
    clockSeconds: -8492,
    heading: 0x1_e4,
    lamps: { attack: false, ground: true, run: false }
  },
  airborne: {
    ...damoclesReadoutWords({
      eyeY: 70_084,
      floor: 0,
      panelSpeed: 107,
      rangeAltitude: null,
      speed: 0x6_1a_c2
    }),
    clockSeconds: 6996,
    heading: 0x2_98,
    pitch: 0x2_5f
  },
  computer: {
    centre: { from: computer, steps: 0, to: computer },
    inventory: 'AUTHORS COMPUTER',
    mask: 0x33
  },
  document: {
    centre: { from: file, steps: 0, to: file },
    inventory: 'DAMOCLES FILE'
  },
  'on-foot': {},
  reveal: {
    centre: { from: null, steps: 16, to: file },
    inventory: 'DAMOCLES FILE'
  },
  space: {
    ...damoclesReadoutWords({
      eyeY: 63,
      floor: 0,
      panelSpeed: 804_318_406,
      rangeAltitude: 95_027,
      speed: 0x9_e1_76
    }),
    location: 'DION',
    pitch: 0x2_40
  }
};
const state = new URLSearchParams(location.search).get('state') ?? 'on-foot';
if (states[state] === undefined) {
  throw new Error(`Unknown panel state: ${state}`);
}
const canvas = globalThis.document.querySelector<HTMLCanvasElement>('#panel')!;
const context = canvas.getContext('2d')!;
const image = context.createImageData(320, 64);
panelRgba(
  drawDamoclesPanel(document, { ...initial, ...states[state] }),
  image.data
);
context.putImageData(image, 0, 0);
globalThis.document.querySelector('#state')!.textContent = `Damocles: ${state}`;
canvas.dataset['state'] = 'ready';
