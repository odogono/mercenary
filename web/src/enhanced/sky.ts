import type { Vector3 } from '../orientation/index.ts';

/// The sky as the Enhanced planner draws it: the Bodies and stars a Title's sky pass places,
/// and the triangles that paint them over the sky fill with the depth test off (#803).

const channels = (colour: string): readonly [number, number, number] => [
  Number.parseInt(colour.slice(1, 3), 16) / 255,
  Number.parseInt(colour.slice(3, 5), 16) / 255,
  Number.parseInt(colour.slice(5, 7), 16) / 255
];

/// The ST's view centre, about which it projects at 256 pixels a unit tangent (#528).
const CENTRE_COLUMN = 160;
const CENTRE_ROW = 68;

/// One listed Body as the sky pass sees it this frame.
export interface SkyBody {
  /// The lit side's colour: the low word of `$0060C0 + sel`, as `system.json` expands it.
  readonly colour: string;
  /// Which colour the first span takes. `$0459CE` swaps the pair when the XZ cross product at
  /// the Body is non-negative.
  readonly first: 'lit' | 'shadow';
  readonly id: string;
  readonly kind: 'disc';
  /// The Body's centre less the eye, in the current Body's surface frame.
  readonly offset: Vector3;
  /// The unlit side's colour: the sky by day on a Body with an atmosphere, `$000` otherwise.
  readonly shadow: string;
  /// `$006040`'s decode: the disc's pixel radius is `size / depth`.
  readonly size: number;
  /// Where the terminator crosses each row, as a fraction of the row's half-width from the
  /// centre: the first span, `[−w, split·w)`, is drawn in `first`, the rest in the other colour.
  /// DIALIS's is 1, a full disc.
  readonly split: number;
}

/// The comet as the sky pass sees it this frame. Every offset is from the eye, in the current
/// Body's surface frame, as a disc's is.
export interface SkyComet {
  /// The polygons `$04F8FE` draws, in order, each naming `points` by index.
  readonly faces: readonly {
    readonly colour: string;
    readonly points: readonly number[];
  }[];
  /// The disc `$04FCE6` draws over the head once the polygons are down, where the head is in
  /// front of the eye. `$042C04 = $7FFF0000` puts its split at the rim, so it is one colour:
  /// palette slot 0, which the surface pass holds at `$000`. It is under a pixel from every
  /// surface at every clock a Session reaches before the impact, so no frame has shown it.
  readonly head: {
    readonly colour: string;
    readonly size: number;
  } | null;
  readonly id: string;
  readonly kind: 'comet';
  /// The comet's centre.
  readonly offset: Vector3;
  /// The tail tip, then the head points, in the slots `$04FBF6` projects them into.
  readonly points: readonly Vector3[];
}

export type SkyItem = SkyBody | SkyComet;

/// One frame's sky pass: its Bodies, and the two static facts the frame measures them by.
export interface SkyPass {
  /// Every Body the current Body's draw list names, in the list's order, which is the order the
  /// engine draws them in with no depth sort. DAMOCLES is its comet, and is gone once the
  /// impact clock reaches zero.
  readonly bodies: readonly SkyItem[];
  /// `$045A0C`: a disc narrower than this many pixels at its widest row has no row at all.
  readonly halfWidthDivisor: number;
  /// `$05309A`'s clip row `$042C74`: `$44`, the view's centre row, in ground contact over land
  /// (`$7AAA ≠ 0`, `$78A6 ≥ 0`), where no Body or comet row is drawn below it. Otherwise `$88`,
  /// the view's last row, and aboard the ground fill covers what lies below the horizon.
  readonly horizonCut: boolean;
  /// `$7964`: the projection scale a disc's `size / depth` pixel radius is measured against.
  readonly projectionScale: number;
  /// The starfield's pixels, in the ST's screen pixels, in plot order (#578). The stars are
  /// drawn before the sky pass, so every Body covers them.
  readonly stars: readonly StarPixel[];
  /// `2^(exponent - 8)` for the scale exponent the AUTHORS COMPUTER's option 2 writes into
  /// `$7964` (#628): the ST pixels a unit tangent spans grow with it, so a disc's pixel tests and
  /// the starfield, which does not read `$7964`, measure by it. Absent is 1.
  readonly zoom?: number;
}

export interface StarPixel {
  readonly colour: string;
  /// ST columns from the view's left edge, 0 to 319 inside it.
  readonly column: number;
  /// ST rows from the view's top edge, 0 to 135 inside it.
  readonly row: number;
}

/// Where an ST pixel's top-left corner is in the port's view, as tangents: the ST projects at
/// 256 pixels a unit tangent about column 160 and row 68 (#528), up positive.
export const starTangent = (
  column: number,
  row: number,
  projectionScale: number
): { readonly x: number; readonly y: number } => ({
  x: (column - CENTRE_COLUMN) / projectionScale,
  y: (CENTRE_ROW - row) / projectionScale
});

/// Where a sky Body's disc lies in the view, as tangents: `x` right and `y` up from the view's
/// centre, and `radius` the disc's `size / depth` pixels over the projection scale. A Body at
/// `(x, y)` is where #528's closed form puts it at `160 + scale·x`, `68 − scale·y`. The comet's
/// is its head's, and all zero where the head is behind the eye.
export interface SkyBodyPlacement {
  /// Whether any of the disc is drawn: in front of the eye, at least one row wide, and above
  /// the horizon row somewhere. For the comet, whether any of its tail or head is.
  readonly drawn: boolean;
  readonly id: string;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

/// Rows of a disc between the horizon and its top: the angles a circle is sampled at.
const SKY_DISC_SLABS = 32;

/// Where the comet's polygons are cut short of the eye, in view depth. They are projected
/// before they are drawn, so this only has to keep the divide away from zero.
const SKY_NEAR_DEPTH = 1e-6;

type Tangent = { readonly x: number; readonly y: number };

/// Sutherland–Hodgman against one half-space: keep where `side` is not negative.
const clipPolygon = <T extends Tangent>(
  polygon: readonly T[],
  side: (point: T) => number,
  between: (from: T, to: T, t: number) => T
): T[] => {
  const result: T[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index]!;
    const to = polygon[(index + 1) % polygon.length]!;
    const a = side(from);
    const b = side(to);
    if (a >= 0) {
      result.push(from);
    }
    if (a >= 0 !== b >= 0) {
      result.push(between(from, to, a / (a - b)));
    }
  }
  return result;
};

const lerp3 = (from: Vector3, to: Vector3, t: number): Vector3 => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  z: from.z + (to.z - from.z) * t
});

const lerp2 = (from: Tangent, to: Tangent, t: number): Tangent => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t
});

/// The comet's polygons, `$04F8FE`'s, in view space: cut short of the eye, projected, cut at the
/// horizon row (the `$04FB1C` fill limit, patched to row 68 on foot), and fanned into
/// triangles at the sky's depth. Returns whether any of it is left.
///
/// From a surface the head is a few hundred units across at a quarter of a million away, so
/// the triangles are under a pixel wide. The ST's scan fill still paints every row they
/// cross, and #528's frames show the comet as a streak a pixel or more wide all the way to the
/// tip. The port's pixels are finer than the ST's, so it adds that floor as a quad one ST
/// pixel wide from the head to the tip.
export const skyCometTriangles = (
  comet: SkyComet,
  view: readonly Vector3[],
  pixel: number,
  depth: number,
  emit: (view: Vector3, colour: readonly [number, number, number]) => void,
  horizonRow = 0
): boolean => {
  let drawn = false;
  const fill = (
    polygon: readonly Tangent[],
    colour: readonly [number, number, number]
  ): void => {
    const cut = Number.isFinite(horizonRow)
      ? clipPolygon(polygon, point => point.y - horizonRow, lerp2)
      : polygon;
    for (let index = 1; index + 1 < cut.length; index += 1) {
      for (const point of [cut[0]!, cut[index]!, cut[index + 1]!]) {
        emit({ x: point.x * depth, y: point.y * depth, z: depth }, colour);
      }
      drawn = true;
    }
  };
  const project = (point: Vector3): Tangent => ({
    x: point.x / point.z,
    y: point.y / point.z
  });
  for (const face of comet.faces) {
    const front = clipPolygon(
      face.points.map(index => view[index]!),
      point => point.z - SKY_NEAR_DEPTH,
      lerp3
    );
    fill(front.map(project), channels(face.colour));
  }
  const [tip, ...heads] = view;
  const colour = comet.faces[0]?.colour;
  if (tip === undefined || heads.length === 0 || colour === undefined) {
    return drawn;
  }
  const head = {
    x: heads.reduce((sum, point) => sum + point.x, 0) / heads.length,
    y: heads.reduce((sum, point) => sum + point.y, 0) / heads.length,
    z: heads.reduce((sum, point) => sum + point.z, 0) / heads.length
  };
  const segment = clipPolygon(
    [head, tip],
    point => point.z - SKY_NEAR_DEPTH,
    lerp3
  );
  if (segment.length >= 2) {
    const [from, to] = [project(segment[0]!), project(segment[1]!)];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > 0) {
      const nx = (-(to.y - from.y) / length) * (pixel / 2);
      const ny = ((to.x - from.x) / length) * (pixel / 2);
      fill(
        [
          { x: from.x - nx, y: from.y - ny },
          { x: to.x - nx, y: to.y - ny },
          { x: to.x + nx, y: to.y + ny },
          { x: from.x + nx, y: from.y + ny }
        ],
        channels(colour)
      );
    }
  }
  return drawn;
};

/// The star pixels as squares one ST pixel on a side, at the sky's depth.
export const skyStarTriangles = (
  stars: readonly StarPixel[],
  projectionScale: number,
  depth: number,
  emit: (view: Vector3, colour: readonly [number, number, number]) => void
): void => {
  const step = 1 / projectionScale;
  const at = (x: number, y: number): Vector3 => ({
    x: x * depth,
    y: y * depth,
    z: depth
  });
  for (const star of stars) {
    const corner = starTangent(star.column, star.row, projectionScale);
    const colour = channels(star.colour);
    const quad = [
      at(corner.x, corner.y),
      at(corner.x + step, corner.y),
      at(corner.x + step, corner.y - step),
      at(corner.x, corner.y - step)
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      emit(quad[index]!, colour);
    }
  }
};

/// One sky Body as horizontal slabs, `$045916`'s rows made continuous: each row from `−w` to
/// `+w` about the centre, split at `split·w`, and cut at the horizon row. On foot this is the
/// view's centre row (`$042C74 = $44`, row 68 of 136), shifted by Free Look. The disc is round
/// here where the ST's is widened by `1/0.84375`: that widening makes it round on the ST's
/// non-square pixels, and the port's pixels are square. In flight and in space (`$042C74 = $88`,
/// the view's last row) nothing is cut.
export const skyDiscTriangles = (
  body: Pick<SkyBody, 'colour' | 'first' | 'shadow' | 'split'>,
  placement: SkyBodyPlacement,
  depth: number,
  emit: (view: Vector3, colour: readonly [number, number, number]) => void,
  horizonRow = 0
): void => {
  const lit = channels(body.colour);
  const shadow = channels(body.shadow);
  const [first, second] = body.first === 'lit' ? [lit, shadow] : [shadow, lit];
  const { radius, x, y } = placement;
  const rows: {
    readonly left: number;
    readonly right: number;
    readonly split: number;
    readonly y: number;
  }[] = [];
  for (let slab = 0; slab <= SKY_DISC_SLABS; slab += 1) {
    const edge = y - radius * Math.cos((slab * Math.PI) / SKY_DISC_SLABS);
    const row = Math.max(horizonRow, edge);
    const dy = row - y;
    const w = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    rows.push({ left: x - w, right: x + w, split: x + body.split * w, y: row });
  }
  const at = (u: number, v: number): Vector3 => ({
    x: u * depth,
    y: v * depth,
    z: depth
  });
  const quad = (
    corners: readonly [Vector3, Vector3, Vector3, Vector3],
    colour: readonly [number, number, number]
  ): void => {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      emit(corners[index]!, colour);
    }
  };
  for (let index = 0; index < SKY_DISC_SLABS; index += 1) {
    const low = rows[index]!;
    const high = rows[index + 1]!;
    if (high.y <= low.y) {
      continue;
    }
    quad(
      [
        at(low.left, low.y),
        at(low.split, low.y),
        at(high.split, high.y),
        at(high.left, high.y)
      ],
      first
    );
    quad(
      [
        at(low.split, low.y),
        at(low.right, low.y),
        at(high.right, high.y),
        at(high.split, high.y)
      ],
      second
    );
  }
};
