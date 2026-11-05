import type { Vector3 } from '../orientation/index.ts';
import { discBasis } from '../sky/frame.ts';
import { dot, normalized } from '../sky/vector.ts';

/// The sky as the Enhanced planner draws it: the `SkyPass` every Title fills (#969), and the
/// one place, `skyPassTriangles`, that turns it into the triangles that paint it over the sky
/// fill with the depth test off (#803).
///
/// A pass is drawn in layers, back to front: the gradient dome, the stars, then the Bodies in
/// list order. Damocles and Mercenary III fill it with what their sky pass measures in the
/// ST's screen pixels: star pixels, and discs drawn as screen rows split at a terminator.
/// Targ fills it with what its orrery gives (#956): a twilight dome, stars by direction, and
/// Orbs, discs of fixed angular size facing the eye whose rim and terminator are feathered over
/// an output pixel (#968). A feathered edge blends into whatever the layers before it put
/// there, so a moon's rim over the sun blends into the sun, not into the sky.

type Channels = readonly [number, number, number];

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

/// A Body as Targ draws its sun and moons (#956): a disc of fixed angular size facing the eye,
/// laid out in rows across the line to the sun. A row of half-width `w` is `dark` from `−w` to
/// `−phaseCosine·w`, where the terminator of a sphere lit at that phase cosine crosses it, and
/// `lit` beyond. Its rim and terminator are feathered over an output pixel.
export interface SkyOrb {
  readonly angularRadius: number;
  /// The unlit side's colour. Absent, the disc is lit whole.
  readonly dark?: string;
  /// Toward the Body, in the sky's frame.
  readonly direction: Vector3;
  readonly id: string;
  readonly kind: 'orb';
  readonly lit: string;
  readonly phaseCosine: number;
  /// Toward the sun, in the sky's frame, which the lit side faces. Absent, the disc is the sun
  /// itself and its rows lie as `discBasis` puts them.
  readonly sun?: Vector3;
}

export type SkyItem = SkyBody | SkyComet | SkyOrb;

/// A gradient over the sky from `horizon` at the horizon to `zenith` `SKY_DOME_TOP` above it, by
/// `smoothstep`, and `zenith` above that: Targ's twilight (#956).
export interface SkyDome {
  readonly horizon: string;
  readonly zenith: string;
}

/// A star placed by direction, `alpha` of the way from the sky behind it to `colour`, two
/// output pixels across.
export interface SkyStarPoint {
  readonly alpha: number;
  readonly colour: string;
  readonly direction: Vector3;
}

/// One frame's sky pass: its Bodies, and the two static facts the frame measures them by.
export interface SkyPass {
  /// Every Body the current Body's draw list names, in the list's order, which is the order the
  /// engine draws them in with no depth sort. DAMOCLES is its comet, and is gone once the
  /// impact clock reaches zero.
  readonly bodies: readonly SkyItem[];
  /// The sky's colour by direction, behind everything else, which feathered edges blend into.
  /// One colour from horizon to zenith is the sky fill itself, and no dome is drawn.
  readonly dome?: SkyDome;
  /// `$045A0C`: a disc narrower than this many pixels at its widest row has no row at all.
  readonly halfWidthDivisor: number;
  /// `$05309A`'s clip row `$042C74`: `$44`, the view's centre row, in ground contact over land
  /// (`$7AAA ≠ 0`, `$78A6 ≥ 0`), where no Body or comet row is drawn below it. Otherwise `$88`,
  /// the view's last row, and aboard the ground fill covers what lies below the horizon.
  readonly horizonCut: boolean;
  /// `$7964`: the projection scale a disc's `size / depth` pixel radius is measured against.
  readonly projectionScale: number;
  /// Stars placed by direction (#956), drawn with the star pixels.
  readonly starPoints?: readonly SkyStarPoint[];
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

/// The gradient reaches the zenith's colour this far above the horizon, by `smoothstep`.
export const SKY_DOME_TOP = (30 * Math.PI) / 180;
/// Rings between the horizon and `SKY_DOME_TOP`, each a step of the smoothstep.
const DOME_RINGS = 15;
const DOME_SEGMENTS = 48;
/// Rows across an Orb.
const ORB_ROWS = 32;

/// The ST screen's centre column, about which `$05668A` places a Body at `160 − F·u/d`.
const SKY_CENTRE_COLUMN = 160;

const mix = (from: Channels, to: Channels, amount: number): Channels => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount
];

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/// `centre` moved `u` along `right` and `v` along `up`.
const across = (
  centre: Vector3,
  right: Vector3,
  up: Vector3,
  u: number,
  v: number
): Vector3 => ({
  x: centre.x + right.x * u + up.x * v,
  y: centre.y + right.y * u + up.y * v,
  z: centre.z + right.z * u + up.z * v
});

/// How a Title's view sees its sky pass.
export interface SkyView {
  /// How far out the sky is drawn, in view depth. The sky is painted with the depth test off and
  /// writes no depth, so this only has to lie inside the frustum.
  readonly depth: number;
  /// A direction in the sky's frame, as the view sees it.
  readonly direction: (direction: Vector3) => Vector3;
  /// Where the horizon cuts the discs and the comet, as a tangent row of the view: no row of
  /// either is drawn below it. `−Infinity` cuts nothing.
  readonly horizonRow: number;
  /// A point given as its offset from the eye in the sky's frame, as the view sees it.
  readonly offset: (offset: Vector3) => Vector3;
  /// One output pixel, as a tangent of the view.
  readonly pixel: number;
}

export interface SkyDrawing {
  /// Each listed disc and comet's place (#530), in draw order, whether or not any of it is drawn.
  readonly placements: readonly SkyBodyPlacement[];
  /// How many stars, star pixels and star points, the vertices draw.
  readonly starCount: number;
  /// The dome, the stars, then the Bodies, in the plan's ten-float vertices, at the sky's depth.
  readonly vertices: Float32Array;
}

/// The one place a sky pass becomes triangles.
export const skyPassTriangles = (pass: SkyPass, view: SkyView): SkyDrawing => {
  const { depth } = view;
  const values: number[] = [];
  const push = (vertex: Vector3, colour: Channels): void => {
    // The sky is drawn with depth off; its plane is the one its discs are laid out on.
    values.push(
      vertex.x,
      vertex.y,
      vertex.z,
      colour[0],
      colour[1],
      colour[2],
      0,
      0,
      1,
      -depth
    );
  };
  /// A point in the sky's frame, its direction scaled out to the sky's depth.
  const emit = (point: Vector3, colour: Channels): void => {
    const seen = view.direction(point);
    push({ x: seen.x * depth, y: seen.y * depth, z: seen.z * depth }, colour);
  };
  const triangles = (
    corners: readonly Vector3[],
    colours: readonly Channels[],
    order: readonly number[]
  ): void => {
    for (const index of order) {
      emit(corners[index]!, colours[index]!);
    }
  };

  // The dome: the layer every feathered edge first blends into.
  const dome = pass.dome;
  const domeColour = (direction: Vector3): Channels =>
    dome === undefined
      ? [0, 0, 0]
      : mix(
          channels(dome.horizon),
          channels(dome.zenith),
          smoothstep(
            0,
            SKY_DOME_TOP,
            Math.asin(Math.max(-1, Math.min(1, direction.y)))
          )
        );
  if (dome !== undefined && dome.horizon !== dome.zenith) {
    // From the horizon, below which the ground covers the sky, up to the zenith.
    const elevations = [
      ...Array.from(
        { length: DOME_RINGS + 1 },
        (_, index) => (index / DOME_RINGS) * SKY_DOME_TOP
      ),
      (50 * Math.PI) / 180,
      (70 * Math.PI) / 180,
      Math.PI / 2
    ];
    const around = (elevation: number, segment: number): Vector3 => {
      const azimuth = (segment / DOME_SEGMENTS) * 2 * Math.PI;
      return {
        x: Math.cos(elevation) * Math.cos(azimuth),
        y: Math.sin(elevation),
        z: Math.cos(elevation) * Math.sin(azimuth)
      };
    };
    // A skirt from straight down to the horizon in the horizon's colour, so no sliver of the
    // fill shows between the ground's edge and the dome.
    const rings = [-Math.PI / 2, ...elevations];
    for (let ring = 0; ring + 1 < rings.length; ring += 1) {
      for (let segment = 0; segment < DOME_SEGMENTS; segment += 1) {
        const corners = [
          around(rings[ring]!, segment),
          around(rings[ring]!, segment + 1),
          around(rings[ring + 1]!, segment + 1),
          around(rings[ring + 1]!, segment)
        ];
        triangles(corners, corners.map(domeColour), [0, 1, 2, 0, 2, 3]);
      }
    }
  }

  // The stars, so every Body covers them: the ST's pixels (#578), each one ST pixel square, and
  // the stars placed by direction, each two output pixels across.
  const projectionScale = pass.projectionScale;
  // The ST pixels a unit tangent spans at the view's scale exponent (#628).
  const pixelScale = projectionScale * (pass.zoom ?? 1);
  skyStarTriangles(pass.stars, pixelScale, depth, push);
  const starPoints = pass.starPoints ?? [];
  for (const { alpha, colour, direction } of starPoints) {
    const centre = normalized(direction);
    const [right, up] = discBasis(centre, undefined);
    const shade = mix(domeColour(centre), channels(colour), alpha);
    const { pixel } = view;
    const corners = [
      across(centre, right, up, -pixel, -pixel),
      across(centre, right, up, pixel, -pixel),
      across(centre, right, up, pixel, pixel),
      across(centre, right, up, -pixel, pixel)
    ];
    triangles(
      corners,
      corners.map(() => shade),
      [0, 1, 2, 0, 2, 3]
    );
  }

  // What the layers drawn so far show toward a direction: the dome, then each Orb over it.
  // A feathered edge blends into this, so a moon's rim over the sun blends into the sun.
  let behind = domeColour;
  const orb = (body: SkyOrb): void => {
    const under = behind;
    const centre = normalized(body.direction);
    const phased = body.sun !== undefined;
    const [axisX, axisY] = discBasis(
      centre,
      body.sun === undefined ? undefined : normalized(body.sun)
    );
    const angularRadius = body.angularRadius;
    const centreScale = Math.cos(angularRadius);
    const rimScale = Math.sin(angularRadius);
    const at = (u: number, v: number): Vector3 => ({
      x: centre.x * centreScale + (axisX.x * u + axisY.x * v) * rimScale,
      y: centre.y * centreScale + (axisX.y * u + axisY.y * v) * rimScale,
      z: centre.z * centreScale + (axisX.z * u + axisY.z * v) * rimScale
    });
    const lit = channels(body.lit);
    const dark = channels(body.dark ?? body.lit);
    // One output pixel in the disc's own units, its radius being 1: the width of the rim's and
    // the terminator's feather, as `fwidth` gave the Targ renderer's sky shader.
    const feather = Math.min(
      1,
      view.pixel / Math.tan(Math.max(angularRadius, 1e-6))
    );
    const inner = 1 - feather;
    const phasedDark = phased && body.dark !== undefined;
    const shade = (u: number, v: number): Channels =>
      mix(
        dark,
        lit,
        phasedDark
          ? smoothstep(
              -feather,
              feather,
              u + body.phaseCosine * Math.sqrt(Math.max(0, 1 - v * v))
            )
          : 1
      );
    const coverage = (u: number, v: number): number =>
      1 - smoothstep(inner, 1, Math.hypot(u, v));
    const colourAt = (u: number, v: number): Channels =>
      mix(under(at(u, v)), shade(u, v), coverage(u, v));
    // Each row's columns: the rim, the rim's feather, and the terminator's band, in order, so
    // rows pair column by column. The lit side faces the sun along +u.
    const rows = Array.from({ length: ORB_ROWS + 1 }, (_, row) => {
      const v = -Math.cos((row / ORB_ROWS) * Math.PI);
      const outer = Math.sqrt(Math.max(0, 1 - v * v));
      const within = Math.sqrt(Math.max(0, inner * inner - v * v));
      const clamp = (u: number): number => Math.max(-outer, Math.min(outer, u));
      const split = -body.phaseCosine * outer;
      const columns = (
        phasedDark
          ? [
              -outer,
              -within,
              clamp(split - feather),
              clamp(split),
              clamp(split + feather),
              within,
              outer
            ]
          : [-outer, -within, 0, within, outer]
      ).sort((a, b) => a - b);
      return columns.map(u => ({ colour: colourAt(u, v), corner: at(u, v) }));
    });
    for (let row = 0; row < ORB_ROWS; row += 1) {
      const low = rows[row]!;
      const high = rows[row + 1]!;
      for (let column = 0; column + 1 < low.length; column += 1) {
        const quad = [
          low[column]!,
          low[column + 1]!,
          high[column + 1]!,
          high[column]!
        ];
        triangles(
          quad.map(({ corner }) => corner),
          quad.map(({ colour }) => colour),
          [0, 1, 2, 0, 2, 3]
        );
      }
    }
    // This Orb is now what lies behind the layers after it, where it covers.
    behind = direction => {
      const toward = normalized(direction);
      const facing = dot(toward, centre);
      if (facing <= 0) {
        return under(direction);
      }
      // Where `direction` meets the disc's plane, in the disc's units.
      const onPlane = centreScale / facing / rimScale;
      const u = dot(toward, axisX) * onPlane;
      const v = dot(toward, axisY) * onPlane;
      const cover = coverage(u, v);
      return cover <= 0
        ? under(direction)
        : mix(under(direction), shade(u, v), cover);
    };
  };

  // `$04FBAE` skips a Body whose screen x does not fit a signed word less its top bit
  // (`cmpi.w #$4000`), about the centre column 160.
  const onScreen = (x: number): boolean => {
    const column = SKY_CENTRE_COLUMN + x * pixelScale;
    return column >= -0x40_00 && column < 0x40_00;
  };
  const { horizonRow } = view;
  // `$045928`'s rows are `⌊√(r² − dy²) / 0.84375⌋` wide, so a disc under that many pixels
  // across has no row at all.
  const discDrawn = (placement: Omit<SkyBodyPlacement, 'drawn'>): boolean =>
    placement.radius * pixelScale >= pass.halfWidthDivisor &&
    placement.y + placement.radius > horizonRow;
  const placements: SkyBodyPlacement[] = [];
  for (const body of pass.bodies) {
    if (body.kind === 'orb') {
      orb(body);
      continue;
    }
    const seen = view.offset(body.offset);
    const placement =
      seen.z > 0
        ? {
            id: body.id,
            radius:
              (body.kind === 'disc' ? body.size : (body.head?.size ?? 0)) /
              (projectionScale * seen.z),
            x: seen.x / seen.z,
            y: seen.y / seen.z
          }
        : { id: body.id, radius: 0, x: 0, y: 0 };
    if (body.kind === 'comet') {
      // Pass 2 lets the comet through with its centre behind the eye (`$05315A`), since its
      // tail may still be in front, and draws the head disc only where the centre is not.
      if (seen.z > 0 && !onScreen(placement.x)) {
        placements.push({ ...placement, drawn: false });
        continue;
      }
      let drawn = skyCometTriangles(
        body,
        body.points.map(view.offset),
        1 / pixelScale,
        depth,
        push,
        horizonRow
      );
      if (seen.z > 0 && body.head !== null && discDrawn(placement)) {
        const { colour } = body.head;
        skyDiscTriangles(
          { colour, first: 'lit', shadow: colour, split: 1 },
          { ...placement, drawn: true },
          depth,
          push,
          horizonRow
        );
        drawn = true;
      }
      placements.push({ ...placement, drawn });
      continue;
    }
    if (seen.z <= 0) {
      placements.push({ ...placement, drawn: false });
      continue;
    }
    const drawn = onScreen(placement.x) && discDrawn(placement);
    placements.push({ ...placement, drawn });
    if (drawn) {
      skyDiscTriangles(body, { ...placement, drawn }, depth, push, horizonRow);
    }
  }
  return {
    placements,
    starCount: pass.stars.length + starPoints.length,
    vertices: new Float32Array(values)
  };
};
