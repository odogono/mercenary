import {
  craftDivide,
  craftFixed,
  type CraftArithmetic
} from '../craft/pass.ts';
import type { StarPixel } from '../enhanced/sky.ts';
import type { GammaStarfield } from '../flyover/documents.ts';
import { tan } from '../math/index.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { Pose } from './world.ts';

export { starTangent, type StarPixel } from '../enhanced/sky.ts';

/// The Damocles starfields (#578), in the ST's own screen pixels
/// (docs/research/damocles-starfield.md).
///
/// There is no star in the world. Each routine plots one pixel a star from the list
/// `system.json` publishes: yaw scrolls the columns, 1,800 to a turn, pitch scrolls the rows,
/// and in flight the roll shears them. The word arithmetic is the ST's, so inside the ST's
/// 320 × 136 view every pixel is the ST's. The port's view is wider, so the same rule runs on
/// past the view's edges to fill it.
///
/// - `flight` is `$0503FE`, the flight branch's, which also runs on foot off an island's core.
///   Rows wrap at 1,024 and are sheared by the roll. It runs a main pass near level and a
///   mirrored zenith pass once the view is pitched past the vertical, and neither nose down.
/// - `onFoot` is `$0505B8`, taken standing on an island's core. Rows wrap at 512, with no roll.
/// - `space` is `$05067C`. Rows wrap at 512 from a pitch offset of its own, and nothing gates
///   it by day.

/// Numeric starfield input; provenance belongs to each Title's admitted documents.
export type Starfield = Pick<
  GammaStarfield,
  'columnsPerTurn' | 'pitchOffsets' | 'pitchScale' | 'scrollScale' | 'stars'
> & {
  readonly colours: Pick<GammaStarfield['colours'], 'entries'>;
};

export type StarRoutine = 'flight' | 'onFoot' | 'space';

export interface StarView {
  /// The row the view is clipped at, `$042C74`: 68 on foot, where the ground takes the rest,
  /// and 136 otherwise. Free Look moves the on-foot row with the horizon.
  readonly clipRow: number;
  /// The pitch word `$7AA0`: 512 level, rising nose down.
  readonly pitch: number;
  /// `$797E`'s float, tan roll, only `flight` reads it.
  readonly rollTangent: number;
  readonly routine: StarRoutine;
  /// The yaw word `$7AA2`.
  readonly yaw: number;
}

/// How far past the ST's view the port plots, in ST pixels. The port's Camera is 45° tall
/// (`eris.json` `camera.verticalFieldOfViewDegrees`), 106 rows either side of the centre at
/// the ST's 256 pixels a unit tangent, so 128 covers it. 512 columns either side is a canvas
/// up to 4.8 times as wide as it is tall. Both are under a turn of columns.
const REACH_COLUMNS = 512;
const REACH_ROWS = 128;
const CENTRE_COLUMN = 160;
const CENTRE_ROW = 68;
const VIEW_COLUMNS = 320;
const VIEW_ROWS = 136;
const ST_PIXELS_PER_TANGENT = 256;

const sx16 = (value: number): number => ((value & 0xff_ff) << 16) >> 16;

/// `$055F72`–`$055FCC`: `$797E`, the sine of the roll word over its cosine, as the log floats
/// divide them.
export const rollTangent = (
  arithmetic: CraftArithmetic,
  roll: number
): number =>
  craftDivide(
    arithmetic,
    arithmetic.sine[roll & 0x3_ff]!,
    arithmetic.sine[(roll + 0x1_00) & 0x3_ff]!
  );

/// `$050434`–`$05049C`: tan roll times 65,536 as a long, of which the shear multiplies by the
/// low word.
const shearWord = (tangent: number): number =>
  sx16(craftFixed((tangent + 0x10_00_00) >>> 0));

/// The row a pitch word scrolls off the top: `((pitch & $3FF) − offset) · 4 · scale >> 16`,
/// with the product taken as a word first, as `muls.w` sees it.
const rowScroll = (field: Starfield, pitch: number, offset: number): number =>
  Math.floor(
    (sx16(((pitch & 0x3_ff) - offset) * 4) * field.pitchScale) / 0x1_00_00
  );

/// `$0503FE`'s gates, on the pitch word: the zenith pass below `$140` or from `$3BC`, the main
/// pass from `$C0` to below `$244`. Between `$244` and `$3BC` the nose is down and neither runs.
const ZENITH_BELOW = 0x1_40;
const ZENITH_FROM = 0x3_bc;
const MAIN_FROM = 0xc0;
const MAIN_BELOW = 0x2_44;

const TURN = 2 * Math.PI;

/// The view a Pose draws the stars from: its turns as the ST's yaw, pitch and roll words, the
/// inverses of `bearingFromYaw` and `pitchFromWord`. On foot the ground takes the view below
/// the horizon row, which is the centre row until Free Look tilts the view: a star is kept
/// while its whole pixel is above the horizon, as the sky Bodies are cut there. A horizon at or
/// past the ST's last row leaves the band unclipped, and the ground covers the stars under it.
/// The port's Camera levels at pitch word 512, so its stars do too.
export const starViewOf = (
  pose: Pose,
  orientation: ErisPresentationDocument['orientation'],
  routine: StarRoutine,
  onFoot: boolean,
  arithmetic: CraftArithmetic
): StarView => {
  const units = orientation.yawUnitsPerTurn;
  const word = (turns: number): number =>
    Math.round(turns * units) & (units - 1);
  return {
    clipRow: onFoot
      ? Math.min(
          VIEW_ROWS,
          Math.floor(CENTRE_ROW + tan(pose.pitch) * ST_PIXELS_PER_TANGENT)
        )
      : VIEW_ROWS,
    pitch: word(orientation.pitchLevel / units - pose.pitch / TURN),
    rollTangent: rollTangent(arithmetic, word((pose.roll ?? 0) / TURN)),
    routine,
    yaw: word(pose.heading / TURN + orientation.yawNorth / units)
  };
};

/// Every star pixel one frame plots, in plot order, so a later star wins a shared pixel.
export const starPixels = (
  field: Starfield,
  view: StarView
): readonly StarPixel[] => {
  const turn = field.columnsPerTurn;
  const left = -REACH_COLUMNS;
  const right = VIEW_COLUMNS + REACH_COLUMNS;
  const top = -REACH_ROWS;
  const slope = view.routine === 'flight' ? shearWord(view.rollTangent) : 0;
  const out: StarPixel[] = [];
  const pass = (
    yaw: number,
    pitch: number,
    offset: number,
    rows: number,
    mirror: boolean,
    clipRow: number
  ): void => {
    // On foot the band stops at the horizon, and the ground is below it.
    const bottom = clipRow < VIEW_ROWS ? clipRow : VIEW_ROWS + REACH_ROWS;
    const scroll = Math.floor(
      ((yaw & 0x3_ff) * 2 * field.scrollScale) / 0x1_00_00
    );
    const drop = rowScroll(field, pitch, offset);
    // The scan starts at the first star at or past the scroll, as the per-yaw index does, and
    // goes on round the turn.
    let first = field.stars.findIndex(([x]) => x >= scroll);
    if (first < 0) {
      first = 0;
    }
    // The rows a pass may land on, before a mirrored pass turns them over.
    const [low, high] = mirror
      ? [VIEW_ROWS - bottom, VIEW_ROWS - top]
      : [top, bottom];
    for (let k = 0; k < field.stars.length; k += 1) {
      const [x, row, colour] = field.stars[(first + k) % field.stars.length]!;
      // `c = 319 − (x − scroll)` is the routine's own column, which runs right to left:
      // `$4FF98` numbers the bit from the right, so the main pass lands at 319 − c. The zenith
      // pass mirrors it back to c. The view is symmetric about column 160, so either way the
      // same range of `x − scroll` lands in it.
      let along = (((x - scroll) % turn) + turn) % turn;
      if (along >= right) {
        along -= turn;
      }
      if (along < left) {
        continue;
      }
      const c = VIEW_COLUMNS - 1 - along;
      const screen = mirror ? c : along;
      const sheared =
        Math.floor((slope * (c - CENTRE_COLUMN)) / 0x1_00_00) + row;
      // The ST keeps a row when `(sheared & mask) − drop` is in 0..limit as an unsigned word;
      // the port keeps the same row over its own taller range.
      const at = (sheared & (rows - 1)) - drop;
      if (at < low || at >= high) {
        continue;
      }
      out.push({
        colour: field.colours.entries[colour]!.colour,
        column: screen,
        row: mirror ? VIEW_ROWS - 1 - at : at
      });
    }
  };
  if (view.routine === 'space') {
    pass(
      view.yaw,
      view.pitch,
      field.pitchOffsets.space,
      0x2_00,
      false,
      VIEW_ROWS
    );
    return out;
  }
  if (view.routine === 'onFoot') {
    pass(
      view.yaw,
      view.pitch,
      field.pitchOffsets.flight,
      0x2_00,
      false,
      view.clipRow
    );
    return out;
  }
  const pitch = view.pitch & 0x3_ff;
  if (pitch < ZENITH_BELOW || pitch >= ZENITH_FROM) {
    // `$0502BE`: the band seen over the top, from the yaw a half turn on and the pitch mirrored
    // about the vertical. It clips at row 136 whatever `$042C74` holds (`$0503B8`).
    pass(
      view.yaw + 0x2_00,
      0x2_00 - view.pitch,
      field.pitchOffsets.flight,
      0x4_00,
      true,
      VIEW_ROWS
    );
  }
  if (pitch >= MAIN_FROM && pitch < MAIN_BELOW) {
    // `$050524`: the main pass clips at `$042C74`.
    pass(
      view.yaw,
      view.pitch,
      field.pitchOffsets.flight,
      0x4_00,
      false,
      view.clipRow
    );
  }
  return out;
};
