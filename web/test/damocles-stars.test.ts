import { beforeAll, describe, expect, test } from 'bun:test';

import { type CraftArithmetic } from '../src/craft/pass.ts';
import { craftProgram } from '../src/damocles/craftProgram.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  rollTangent,
  starPixels,
  starViewOf,
  type StarView
} from '../src/damocles/stars.ts';
import {
  readGammaSystem,
  type GammaStarfield
} from '../src/flyover/documents.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

let field: GammaStarfield;
let arithmetic: CraftArithmetic;

beforeAll(async () => {
  field = readGammaSystem(
    await Bun.file(
      new URL('../../payload/damocles/system.json', import.meta.url)
    ).json()
  ).starfield;
  const craft = (await loadCatalogue()).craft;
  if (craft === null) {
    throw new Error('the Catalogue carries no craft block');
  }
  arithmetic = craftProgram(craft).arithmetic;
});

/// Hatari frames of the ST (docs/research/damocles-starfield.md). Each names the words its
/// frame was drawn from and every star pixel alone in the sky there, as column, row and ST
/// colour. `predicted` is how many pixels the ST's routine plots inside its view; the rest of
/// them are under the ground, a Body or a building. The flight frames are over LACHESIS at
/// night in `starfield-probe.py`'s runs, pitch and roll poked; the space frame is the #573
/// run's last before the landing; the on-foot frames are #528's, CRONUS and THEON at night.
const FRAMES: readonly {
  readonly frame: string;
  readonly name: string;
  readonly predicted: number;
  readonly seen: string;
  readonly view: StarView;
}[] = [
  {
    frame: 'space-flight-starfield-20260928T164926Z-8cd0bd2d/shot-00300.png',
    name: 'lachesis level',
    predicted: 75,
    seen: '4,81,246 9,73,322 10,64,322 16,94,411 18,2,322 18,77,246 21,31,322 21,60,777 26,18,246 36,9,322 38,104,246 41,60,777 42,11,322 62,60,411 67,49,411 68,6,322 73,72,322 77,34,322 78,52,411 79,30,322 83,88,777 90,11,322 91,2,322 96,86,777 100,61,322 103,49,322 105,28,411 120,96,246 122,70,246 124,9,246 129,82,322 135,29,322 135,32,246 137,2,322 137,79,411 143,23,411 144,78,411 152,39,322 161,85,322 163,5,322 171,4,411 171,37,411 175,5,322 179,11,777 187,29,322 187,57,322 189,34,322 204,80,777 205,101,322 209,54,322 211,55,322 220,91,322 222,104,322 228,39,322 230,80,322 241,44,411 256,6,322 257,7,777 268,11,322 272,101,322 280,65,322 280,83,322 284,25,322 286,63,411 287,100,246 291,49,777 308,20,322 310,86,322 314,42,322 315,62,322 317,45,322',
    view: {
      clipRow: 136,
      pitch: 487,
      rollTangent: 0xff_f7_19_22,
      routine: 'flight',
      yaw: 498
    }
  },
  {
    frame: 'space-flight-starfield-20260928T164926Z-8cd0bd2d/shot-00304.png',
    name: 'pitch 400',
    predicted: 99,
    seen: '4,102,411 5,47,777 7,12,777 7,81,322 13,68,411 14,58,322 28,134,777 29,43,322 31,53,411 31,96,322 33,95,322 44,135,322 48,104,322 52,72,322 53,74,246 53,95,411 54,75,322 56,92,777 63,8,246 73,31,246 76,76,322 78,107,777 79,11,322 79,66,411 81,15,322 83,134,322 84,109,322 85,78,322 88,39,246 92,35,246 93,95,322 95,3,246 96,88,322 96,116,411 99,82,777 102,10,322 106,22,322 109,39,777 116,31,322 117,77,777 118,112,322 122,135,246 123,45,322 126,81,322 131,34,246 131,109,777 136,114,322 137,112,322 137,121,322 139,19,322 149,9,246 150,110,322 154,8,411 159,41,322 165,55,322 165,64,322 165,106,322 170,88,322 176,63,322 177,83,246 180,115,322 183,99,411 187,72,411 189,111,411 192,15,411 193,88,322 198,79,246 199,114,322 201,20,322 209,38,322 210,4,322 214,133,322 219,61,322 226,47,322 228,124,322 231,132,322 232,17,322 232,121,411 233,61,322 234,18,246 242,63,322 243,95,777 252,0,411 252,63,246 261,31,246 262,26,322 263,2,322 271,76,322 277,37,246 277,102,322 286,121,246 295,91,322 299,83,322 301,135,322 305,42,777 309,68,322 312,67,411 314,54,322 318,54,322',
    view: {
      clipRow: 136,
      pitch: 400,
      rollTangent: 0xff_f7_19_22,
      routine: 'flight',
      yaw: 498
    }
  },
  {
    frame: 'space-flight-starfield-20260928T164926Z-8cd0bd2d/shot-00308.png',
    name: 'pitch 260',
    predicted: 89,
    seen: '0,5,411 0,135,322 4,109,411 7,65,322 9,54,322 13,134,322 14,5,246 19,89,322 19,100,411 21,67,322 22,116,777 23,30,777 25,9,411 30,77,322 31,80,322 36,108,777 38,71,246 39,22,322 40,16,777 41,113,322 44,54,322 52,105,322 52,119,322 56,23,322 63,19,322 63,100,777 67,38,322 68,105,322 74,62,777 75,82,777 76,15,322 78,68,322 83,44,411 85,44,322 86,99,246 102,55,246 103,110,322 107,8,777 111,53,322 111,87,246 113,63,322 126,89,322 127,22,322 127,121,246 130,30,246 137,3,777 137,133,777 149,135,322 152,109,322 155,92,322 160,86,322 163,101,322 170,8,411 173,85,322 174,120,411 183,0,322 183,79,322 184,123,411 192,70,322 195,39,246 195,107,246 228,5,322 229,56,246 233,113,322 236,14,322 237,95,322 240,57,322 241,63,322 242,23,246 244,132,322 251,42,322 252,131,777 253,26,777 253,92,322 256,3,411 258,76,411 270,130,322 273,131,246 280,86,322 281,134,777 287,26,322 287,76,322 289,59,322 291,77,322 292,93,322 294,8,322 296,121,777 304,71,322 316,93,322',
    view: {
      clipRow: 136,
      pitch: 260,
      rollTangent: 0xff_f7_19_22,
      routine: 'flight',
      yaw: 498
    }
  },
  {
    frame: 'space-flight-starfield-20260928T164926Z-8cd0bd2d/shot-00312.png',
    name: 'pitch 150',
    predicted: 79,
    seen: '6,119,246 8,56,322 9,39,322 10,112,322 12,42,777 17,42,322 19,98,246 35,118,411 36,71,322 42,129,322 43,52,411 46,60,246 50,38,246 54,58,411 64,96,322 67,125,246 67,131,411 68,27,777 70,54,777 82,130,411 84,118,322 87,63,322 88,38,322 88,99,777 89,117,246 93,93,322 97,54,322 102,86,322 104,31,322 106,88,411 114,29,322 119,24,777 121,63,246 126,34,411 132,101,322 132,116,322 137,89,322 141,0,777 147,12,322 147,90,777 150,99,777 154,103,322 155,123,411 157,43,322 160,101,411 165,126,322 170,58,322 175,69,322 177,1,322 180,19,777 182,30,322 188,37,322 192,86,777 193,54,411 194,134,411 202,70,322 214,57,246 215,111,322 220,68,411 223,66,322 228,128,322 238,36,322 243,131,411 244,59,322 246,97,411 250,32,322 250,46,322 253,70,777 262,5,322 265,112,322 268,30,322 271,29,777 283,113,777 285,30,777 293,69,411 299,116,322 304,20,322',
    view: {
      clipRow: 136,
      pitch: 150,
      rollTangent: 0xff_f7_19_22,
      routine: 'flight',
      yaw: 498
    }
  },
  {
    frame: 'space-flight-starfield-20260928T164926Z-8cd0bd2d/shot-00316.png',
    name: 'pitch 1000',
    predicted: 13,
    seen: '0,130,322 77,133,411 80,132,411 126,118,322 148,128,322 157,114,246 190,127,322 233,125,411 246,134,246 277,132,411 301,118,777',
    view: {
      clipRow: 136,
      pitch: 1000,
      rollTangent: 0xff_f7_19_22,
      routine: 'flight',
      yaw: 498
    }
  },
  {
    frame: 'space-flight-starfield-20260928T164926Z-8cd0bd2d/shot-00324.png',
    name: 'roll 24',
    predicted: 77,
    seen: '4,104,246 9,95,322 10,14,411 10,86,322 16,115,411 18,23,322 18,98,246 20,9,246 21,51,322 21,80,777 26,38,246 28,5,777 36,8,322 36,27,322 38,122,246 41,77,777 42,28,322 44,4,322 62,74,411 67,62,411 68,19,322 73,85,322 77,46,322 78,64,411 79,42,322 83,99,777 90,21,322 91,12,322 96,95,777 100,69,322 103,6,777 103,57,322 105,36,411 120,101,246 122,75,246 124,14,246 129,86,322 135,32,322 135,35,246 137,5,322 137,82,411 143,25,411 144,80,411 152,40,322 161,85,322 163,5,322 171,3,411 171,36,411 175,3,322 179,8,777 187,25,322 187,53,322 189,30,322 204,74,777 205,95,322 209,47,322 211,48,322 220,82,322 222,95,322 228,29,322 230,70,322 241,32,411 272,84,322 280,47,322 280,65,322 284,7,322 286,44,411 287,81,246 291,30,777 310,64,322 314,19,322 315,39,322 317,22,322',
    view: {
      clipRow: 136,
      pitch: 487,
      rollTangent: 0xff_fd_13_64,
      routine: 'flight',
      yaw: 498
    }
  },
  {
    frame: 'space-flight-starfield-20260928T164926Z-8cd0bd2d/shot-00332.png',
    name: 'roll 64',
    predicted: 72,
    seen: '4,18,411 9,135,322 10,54,411 10,126,322 18,60,322 18,135,246 20,46,246 21,88,322 21,117,777 26,73,246 28,40,777 31,1,322 36,41,322 36,60,322 41,109,777 42,59,322 44,35,322 48,2,322 62,100,411 67,87,411 68,44,322 73,107,322 77,68,322 78,85,411 79,63,322 83,17,322 83,119,777 90,39,322 91,30,322 96,112,777 100,85,322 103,21,777 103,72,322 105,50,411 120,112,246 122,2,246 122,85,246 124,23,246 128,119,777 129,94,322 135,39,322 135,42,246 137,11,322 137,88,411 143,29,411 144,84,411 152,41,322 153,0,322 161,85,322 163,4,322 171,32,411 179,3,777 187,18,322 187,46,322 189,22,322 203,88,777 204,62,777 205,82,322 209,34,322 211,34,322 220,66,322 222,78,322 228,11,322 230,51,322 241,10,411 263,63,246 272,54,322 280,15,322 280,33,322 286,10,411 287,47,246 310,23,322',
    view: {
      clipRow: 136,
      pitch: 487,
      rollTangent: 0xff_fe_1a_bc,
      routine: 'flight',
      yaw: 498
    }
  },
  {
    frame:
      'space-flight-high-altitude-20260928T161031Z-34ab1e7a/shot-00216.png',
    name: 'space',
    predicted: 86,
    seen: '0,7,322 4,36,777 5,31,322 13,6,322 27,21,246 244,5,322 252,4,777 263,11,777 268,16,322 270,3,322 273,4,246 277,17,777 281,7,777',
    view: {
      clipRow: 136,
      pitch: 487,
      rollTangent: 0xff_f7_19_22,
      routine: 'space',
      yaw: 498
    }
  },
  {
    frame: 'sky-body-20260925T131108Z-1814f2ca/lon0496.png',
    name: 'on foot 1814f2ca lon0496',
    predicted: 60,
    seen: '3,32,322 6,2,411 6,10,777 13,26,411 23,40,322 27,8,411 39,59,322 56,30,411 56,40,322 58,17,322 69,46,322 76,43,411 79,12,411 94,5,322 94,36,322 95,1,322 96,7,322 107,15,322 108,40,322 114,15,322 237,1,322 242,0,322 249,7,777 257,29,322 265,64,322 266,66,322 274,27,322 281,64,322 284,44,322 288,10,322 290,43,777 292,52,322 294,35,322 297,48,322 298,60,246 299,47,322 304,41,411 305,50,246',
    view: {
      clipRow: 68,
      pitch: 511,
      rollTangent: 0xff_f7_19_22,
      routine: 'onFoot',
      yaw: 64_810
    }
  },
  {
    frame: 'sky-body-20260925T130958Z-eadd9472/lon0448.png',
    name: 'on foot eadd9472 lon0448',
    predicted: 45,
    seen: '15,13,322 27,43,322 31,9,411 36,48,777 46,46,322 49,8,777 49,62,322 52,5,411 57,63,246 58,18,322 60,37,322 64,29,322 69,25,246 70,22,322 92,51,411 94,3,322 94,48,777 95,6,777 110,52,246 129,66,322 142,5,777 143,66,411 158,29,246 160,29,322 166,2,322 176,61,411 178,30,322 198,60,322',
    view: {
      clipRow: 68,
      pitch: 511,
      rollTangent: 0xff_f7_19_22,
      routine: 'onFoot',
      yaw: 790
    }
  }
];

const inView = (view: StarView) => {
  const pixels = new Map<string, string>();
  for (const pixel of starPixels(field, view)) {
    if (
      pixel.column >= 0 &&
      pixel.column < 320 &&
      pixel.row >= 0 &&
      pixel.row < Math.min(136, view.clipRow)
    ) {
      pixels.set(`${pixel.column},${pixel.row}`, pixel.colour);
    }
  }
  return pixels;
};

/// `#rrggbb` from the ST's three levels, as Hatari's screenshots show them.
const stColour = (levels: string) =>
  '#' +
  [...levels]
    .map(level =>
      (Number.parseInt(level, 16) * 34).toString(16).padStart(2, '0')
    )
    .join('');

describe('the starfield', () => {
  test.each(FRAMES.map(frame => [frame.name, frame] as const))(
    'plots every star the ST shows alone in the sky: %s',
    (_, { predicted, seen, view }) => {
      const pixels = inView(view);
      expect(pixels.size).toBe(predicted);
      for (const entry of seen.split(' ')) {
        const [column, row, levels] = entry.split(',');
        expect([entry, pixels.get(`${column},${row}`)]).toEqual([
          entry,
          stColour(levels!)
        ]);
      }
    }
  );

  test('draws nothing nose down, between pitch $244 and $3BC', () => {
    for (const pitch of [0x2_44, 600, 768, 0x3_bb]) {
      expect(
        starPixels(field, {
          clipRow: 136,
          pitch,
          rollTangent: rollTangent(arithmetic, 0),
          routine: 'flight',
          yaw: 498
        })
      ).toEqual([]);
    }
  });

  test('fills the port view past the ST view, in the same rule', () => {
    const view: StarView = {
      clipRow: 136,
      pitch: 487,
      rollTangent: rollTangent(arithmetic, 0),
      routine: 'flight',
      yaw: 498
    };
    const all = starPixels(field, view);
    expect(all.some(pixel => pixel.column < 0)).toBe(true);
    expect(all.some(pixel => pixel.column >= 320)).toBe(true);
    expect(all.some(pixel => pixel.row < 0)).toBe(true);
    // A yaw step scrolls every star by the same columns, so the pixels to the right of the ST
    // view at one yaw are in it a few steps on.
    const later = starPixels(field, { ...view, yaw: 498 + 64 });
    const shift =
      Math.floor(((498 + 64) * 2 * field.scrollScale) / 0x1_00_00) -
      Math.floor((498 * 2 * field.scrollScale) / 0x1_00_00);
    const moved = new Set(
      later.map(pixel => `${pixel.column + shift},${pixel.row}`)
    );
    for (const pixel of all.filter(
      p => p.column >= 320 && p.column < 320 + 100
    )) {
      expect(moved.has(`${pixel.column},${pixel.row}`)).toBe(true);
    }
  });

  test('stops at the horizon on foot', () => {
    const pixels = starPixels(field, {
      clipRow: 68,
      pitch: 512,
      rollTangent: rollTangent(arithmetic, 0),
      routine: 'onFoot',
      yaw: 0
    });
    expect(pixels.length).toBeGreaterThan(0);
    expect(Math.max(...pixels.map(pixel => pixel.row))).toBeLessThan(68);
  });
});

const levelPose = (pitch: number) => ({
  body: 'dion',
  heading: 0,
  pitch,
  position: { x: 0, y: 0, z: 0 }
});

describe('the view on foot', () => {
  test('clips at the horizon Free Look tilts, not the centre row', async () => {
    const { orientation } = readErisPresentation(
      await Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
    );
    const at = (pitch: number, routine: 'flight' | 'onFoot') =>
      starViewOf(levelPose(pitch), orientation, routine, true, arithmetic);
    expect(at(0, 'onFoot').clipRow).toBe(68);
    // Looking up moves the horizon down the view by tan pitch at 256 rows a unit tangent.
    expect(at(0.2, 'onFoot').clipRow).toBe(
      Math.floor(68 + Math.tan(0.2) * 256)
    );
    expect(at(-0.1, 'onFoot').clipRow).toBe(
      Math.floor(68 - Math.tan(0.1) * 256)
    );
    expect(at(0.5, 'flight').clipRow).toBe(136);
    for (const routine of ['flight', 'onFoot'] as const) {
      const view = at(0.2, routine);
      const pixels = starPixels(field, view);
      expect(pixels.some(pixel => pixel.row >= 68)).toBe(true);
      expect(Math.max(...pixels.map(pixel => pixel.row))).toBeLessThan(
        view.clipRow
      );
    }
  });
});

describe('the roll tangent', () => {
  test("is the ST's $797E for every roll the frames were drawn at", () => {
    // `$797E` read from the stops: roll 0, and the view roll patched to 24, −32 and 64.
    expect(rollTangent(arithmetic, 0)).toBe(0xff_f7_19_22);
    expect(rollTangent(arithmetic, 24)).toBe(0xff_fd_13_64);
    expect(rollTangent(arithmetic, -32)).toBe(0xff_fd_e6_f2);
    expect(rollTangent(arithmetic, 64)).toBe(0xff_fe_1a_bc);
  });
});
