import type {
  FloorLabelGlyph,
  Mesh,
  Point,
  Primitive,
  TextAnimation
} from '../catalogue/data.ts';
import type { Vector3 } from '../orientation/index.ts';

/// Which form of a model the Enhanced planner draws this frame (#805). The original chooses a
/// form per frame from the record's header and its face-list chain, and the catalogue decodes
/// each form; the planner composes the one the frame's counters name:
///
/// - `$8003` beacons are dark while bit 2 of the frame counter `$7AE8` plus the slot's phase
///   word is set, and always dark while a gated beacon's locator is not carried (`$0534B0`).
/// - `$8006` television screens take the colour cycle's entry the counter `$5343E` holds.
/// - `$0538F4` draws the first face list whose box holds the object's position less the eye's.
/// - `$0537B0` turns an articulated record's tagged vertices by the angle `$7888`.
/// - `$053EBE` steps every frame-animated vector text one character a main-loop pass.

/// The counters a frame's forms are read from.
export interface FormClock {
  /// `$7888`'s high byte: the VBL count `$7886` latched at the frame's join, mod 256.
  readonly angle: number;
  /// `$7AE8`: the main-loop passes counted since the session began.
  readonly frame: number;
  /// `$5343E / 2`: the television colour cycle's entry, 0 (dark) to 5.
  readonly television: number;
  /// Main-loop passes `$053EBE` has stepped the frame scripts by.
  readonly textStep: number;
}

/// What a placement's model offers the chooser: its decoded forms and, for a beacon, its
/// slot's phase and its gate.
export interface PlacementForms {
  /// A Title's own articulation turn: the form `id` at `angle`, 256 steps a turn. Absent, the
  /// chooser turns the form's tagged vertices as `$0537B0` does (Damocles's).
  readonly articulate?: (id: string, angle: number) => Mesh;
  readonly flash?: { readonly gateSlot: number | null; readonly phase: number };
  /// The form the Session would draw with no clock: the model's own, or its slot's.
  readonly own: string;
  readonly variants: readonly { readonly id: string; readonly mesh: Mesh }[];
}

/// The static tables the composition reads, both from the catalogue.
export interface FormTables {
  /// `$925A`'s 320 words; an articulated record stays at rest without them.
  readonly articulation?: readonly number[];
  readonly glyphs: Readonly<
    Record<string, Readonly<Record<string, FloorLabelGlyph>>>
  >;
}

/// Whether a beacon is lit this frame (`$0534C2`–`$0534F0`).
export const beaconLit = (
  flash: NonNullable<PlacementForms['flash']>,
  frame: number,
  carried: (slot: number) => boolean
): boolean =>
  (flash.gateSlot === null || carried(flash.gateSlot)) &&
  ((frame + flash.phase) & 0xff_ff & 4) === 0;

/// `$0538F4`: the first group whose box holds `offset`, compared unsigned as the 68000's `bcc`
/// does, or null for the default list.
export const viewGroupOf = (mesh: Mesh, offset: Vector3): number | null => {
  const groups = mesh.viewGroups ?? [];
  for (let index = 0; index < groups.length; index += 1) {
    const { bounds } = groups[index]!;
    const inside = [offset.x, offset.y, offset.z].every((value, axis) => {
      const [low, high] = bounds[axis]!;
      return (Math.trunc(value) - low) >>> 0 < (high - low) >>> 0;
    });
    if (inside) {
      return index;
    }
  }
  return null;
};

const word = (value: number): number => ((value + 0x80_00) & 0xff_ff) - 0x80_00;

/// `$0537B0`: the plane an articulation axis turns, in the record's source order.
const ARTICULATION_PLANES = {
  negative: [1, 2],
  positive: [0, 1],
  zero: [2, 0]
} as const;

/// The tagged vertices turned by `angle` in the native fixed point: each product's high word,
/// doubled, with the coordinates in the turning plane carried as words.
export const articulated = (
  mesh: Mesh,
  angle: number,
  table: readonly number[]
): Mesh => {
  const turn = mesh.articulation;
  if (turn === undefined || turn.vertices.length === 0) {
    return mesh;
  }
  const [first, second] =
    turn.axis < 0
      ? ARTICULATION_PLANES.negative
      : turn.axis === 0
        ? ARTICULATION_PLANES.zero
        : ARTICULATION_PLANES.positive;
  const turning = angle & 0xff;
  const sine = turning === 0 ? 0 : table[turning]!;
  const cosine = turning === 0 ? 0 : table[turning + 64]!;
  const pivot = turn.pivot.map(word);
  const tagged = new Set(turn.vertices);
  const vertices = mesh.vertices.map((point, index): Point => {
    if (!tagged.has(index)) {
      return point;
    }
    const turned: [number, number, number] = [...point];
    let a = word(word(turned[first]) - pivot[first]!);
    let b = word(word(turned[second]) - pivot[second]!);
    if (turning !== 0) {
      [a, b] = [
        word((((a * cosine - b * sine) >> 16) & 0xff_ff) * 2),
        word((((a * sine + b * cosine) >> 16) & 0xff_ff) * 2)
      ];
    }
    turned[first] = word(a + pivot[first]!);
    turned[second] = word(b + pivot[second]!);
    return turned;
  });
  return { ...mesh, vertices };
};

/// A glyph coordinate in the record's plane, as bits 6 and 7 of its flags exchange the axes.
const textPoint = (
  text: TextAnimation,
  horizontal: number,
  vertical: number
): Point => {
  const [x, y, z] = text.anchor;
  switch (text.plane) {
    case 0x80:
      return [x, y + vertical, z + horizontal];
    case 0x40:
      return [x + horizontal, y, z + vertical];
    case 0xc0:
      return [x + vertical, y, z + horizontal];
    default:
      return [x + horizontal, y + vertical, z];
  }
};

/// The mesh with each animated text's stepped glyph replaced by the script's character `step`
/// passes on. The replaced glyph's vertices stay in the list, unreferenced.
export const withTextFrame = (
  mesh: Mesh,
  step: number,
  glyphs: FormTables['glyphs']
): Mesh => {
  const texts = mesh.textAnimations ?? [];
  if (texts.length === 0) {
    return mesh;
  }
  // Splice from the last text back, so earlier ranges keep their indices.
  let faces: Primitive[] = [...mesh.faces];
  let lines: Primitive[] = [...mesh.lines];
  const vertices: Point[] = [...mesh.vertices];
  for (const text of [...texts].sort(
    (a, b) => b.range.faces[0] - a.range.faces[0]
  )) {
    const character = text.script[step % text.script.length]!;
    const glyph = glyphs[String(text.font)]?.[character];
    if (glyph === undefined) {
      continue;
    }
    const offset = vertices.length;
    for (const [x, y] of glyph.points) {
      vertices.push(
        textPoint(
          text,
          text.characterIndex * text.advance + x * text.scale[0],
          y * text.scale[1]
        )
      );
    }
    const colour = {
      colour: text.colour,
      ...(text.dayColour === undefined ? {} : { dayColour: text.dayColour }),
      sourceColour: text.sourceColour
    };
    const newFaces = (glyph.faces ?? []).map(refs => ({
      ...colour,
      vertices: refs.map(ref => offset + ref)
    }));
    const newLines = (glyph.lines ?? []).map(([a, b]) => ({
      ...colour,
      vertices: [offset + a, offset + b]
    }));
    faces = [
      ...faces.slice(0, text.range.faces[0]),
      ...newFaces,
      ...faces.slice(text.range.faces[1])
    ];
    lines = [
      ...lines.slice(0, text.range.lines[0]),
      ...newLines,
      ...lines.slice(text.range.lines[1])
    ];
  }
  return { ...mesh, faces, lines, vertices };
};

/// Composed forms kept per placement: a turning angle or a long frame script would otherwise
/// keep every step it ever drew, and each a triangulation.
const COMPOSED_LIMIT = 32;
const composed = new WeakMap<PlacementForms, Map<string, Mesh>>();

/// The mesh a placement draws this frame. `offset` is the placement's position less the eye's,
/// in raw units; `carried` answers bit 7 of a slot's handling byte.
export const formMesh = (
  forms: PlacementForms,
  offset: Vector3,
  clock: FormClock,
  carried: (slot: number) => boolean,
  tables: FormTables
): Mesh | undefined => {
  const byId = (id: string) =>
    forms.variants.find(variant => variant.id === id)?.mesh;
  const own = byId(forms.own) ?? forms.variants[0]?.mesh;
  if (own === undefined) {
    return undefined;
  }
  let id = forms.own;
  const dark =
    forms.flash !== undefined && !beaconLit(forms.flash, clock.frame, carried);
  if (dark) {
    id = 'flash-dark';
  } else if (clock.television > 0 && byId(`frame-${clock.television}`)) {
    id = `frame-${clock.television}`;
  }
  const group = viewGroupOf(own, offset);
  if (group !== null) {
    const stem = forms.own.endsWith('record')
      ? forms.own.slice(0, -'record'.length)
      : '';
    // A group with no faces of its own is drawn as nothing: the extractor offers no form.
    // A dark beacon in a group takes the group's dark form where the model offers one.
    const view = `${stem}view-${group}`;
    id = dark && byId(`${view}-flash-dark`) ? `${view}-flash-dark` : view;
  }
  const chosen = byId(id);
  if (chosen === undefined) {
    return group === null ? own : { faces: [], lines: [], vertices: [] };
  }
  const turned =
    forms.articulate !== undefined || own.articulation !== undefined;
  const angle = turned ? clock.angle & 0xff : 0;
  const texts = chosen.textAnimations ?? [];
  // A Title's own turn is applied at every angle: Dion's is not the identity at 0.
  if (angle === 0 && texts.length === 0 && forms.articulate === undefined) {
    return chosen;
  }
  const characters = texts
    .map(text => text.script[clock.textStep % text.script.length])
    .join('');
  const key = `${id}|${angle}|${characters}`;
  let cache = composed.get(forms);
  if (cache === undefined || cache.size > COMPOSED_LIMIT) {
    cache = new Map();
    composed.set(forms, cache);
  }
  let mesh = cache.get(key);
  if (mesh === undefined) {
    const at =
      forms.articulate !== undefined
        ? forms.articulate(id, angle)
        : tables.articulation === undefined
          ? chosen
          : articulated(chosen, angle, tables.articulation);
    mesh = withTextFrame(at, clock.textStep, tables.glyphs);
    cache.set(key, mesh);
  }
  return mesh;
};
