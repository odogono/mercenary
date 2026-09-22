import type { Instance, Island, Place } from '../catalogue/data.ts';
import type { MapPoint } from '../catalogue/mapView.ts';
import type { GammaBody, GammaSystemDocument } from '../flyover/documents.ts';
import {
  ROAD_GAP_NOTICE,
  catalogueBodyId,
  type RoadRecovery
} from './surface.ts';

/// The Atlas selection panel. Everything it prints is a recovered value or a statement about
/// what was not recovered; nothing here infers a type, a primary or an orbit (ADR 0014).

/// Shown once for the whole System Range rather than repeated per Body.
export const SYSTEM_RANGE_NOTE =
  'Positions are recovered from one observed world load and no complete orbital elements ' +
  'were recovered, so nothing here moves and no Body is shown orbiting another. Bodies that ' +
  'fall within fourteen screen pixels of one another are drawn as one marker wearing the name ' +
  'of the largest Body under it and a count of the rest: that is a fact about this drawing at ' +
  'this camera and not a relationship, because no Primary was recovered and this map discards ' +
  'the Y axis. A disc far out is a marker and not a size, compressed so a five-hundred-fold ' +
  'range of sizes stays legible; close in it is the Body at a radius derived from the ' +
  'recovered extent, which the scale readout distinguishes. That radius divides the decoded ' +
  'extent (#424) by 256, the smallest power of two at which no two recovered Bodies overlap, ' +
  'so a Body may be smaller than drawn and never larger. VOID is a place sentinel rather than ' +
  'one of the 30 physical records and is excluded.';

/// Shown while a Body's surface is drawn on its own disc. The one authored quantity in the
/// Atlas, so it is stated wherever it is used rather than assumed known.
export const AUTHORED_SURFACE_NOTE =
  'The islands on this Body are recovered \u2014 their outlines, land colours, origins and ' +
  'relative positions all come from the Catalogue. The scale placing them on the disc is ' +
  'authored and nothing more: the recovered payloads use two coordinate systems that nothing ' +
  'recovered relates, since a Body surface axis is 2^28 units in the body-local grid against a ' +
  'whole System span of 4.7 million in the resident one. The 4096-cell surface is therefore ' +
  'drawn as the largest square that fits inside the disc, so no island falls outside it. ' +
  'Nothing here is a claim about how large a Body is against its own surface.';

const units = (value: number): string =>
  Math.round(value).toLocaleString('en-GB');

export interface BodyFact {
  readonly label: string;
  readonly value: string;
}

/// The recovered numbers behind one disc, in the order the panel lists them.
export const bodyFacts = (body: GammaBody): readonly BodyFact[] => [
  { label: 'Source slot', value: String(body.sourceIndex) },
  {
    label: 'Position X/Z',
    value: `${units(body.position.x)} / ${units(body.position.z)}`
  },
  { label: 'Extent', value: units(body.radiusExtent) },
  {
    label: 'Base colour',
    value: `${body.baseColour} · ST $${body.sourceColour.toString(16).toUpperCase().padStart(3, '0')}`
  }
];

/// What a reader must know before trusting this Body's position.
export const bodyProvenance = (body: GammaBody): readonly string[] => [
  'Recovered from the resident first-world records of the Damocles Atari ST Working ' +
    'Authority. Position and extent are raw engine units whose physical scale is unresolved.',
  ...(body.positionKind === 'capture-time-sample'
    ? [
        `${body.name} is a capture-time sample, not an epoch or an authored position: its X ` +
          'and Z differ between cold runs, so this disc marks where it was when the world was ' +
          'read and nowhere else.'
      ]
    : []),
  ...(body.sourceColour === 0
    ? [
        `${body.name}'s colour slot masks to $000. The engine never reads the high word of ` +
          'that longword, so the black is the recovered value rather than a missing one.'
      ]
    : [])
];

/// A span on the surface torus. An upper bound below its lower bound is a wrapped span and not
/// an empty one, so it is written as the wrap rather than as a backwards pair.
const span = (
  [low, high]: readonly [number, number],
  wraps: boolean
): string => (wraps ? `${low} → 4096 → ${high}` : `${low} → ${high}`);

/// The recovered numbers behind one Damocles Island. An island carries no name of its own
/// (`CONTEXT.md`): `areaName` belongs to the Structure Workspace the record binds, so it is
/// labelled as the Settlement it publishes and never as the island's name.
export const islandFacts = (island: Island): readonly BodyFact[] => [
  { label: 'Record', value: island.id },
  {
    label: 'Origin X/Z',
    value: `${island.origin[0]} / ${island.origin[1]} Surface Cells`
  },
  {
    label: 'Extent X',
    value: span(island.extent.x, island.extent.wrapsX)
  },
  {
    label: 'Extent Z',
    value: span(island.extent.z, island.extent.wrapsZ)
  },
  { label: 'Coastline', value: `${island.coastline.vertices.length} vertices` },
  {
    label: 'Land colour',
    value: `${island.landColour} · ST $${island.sourceLandColour.toString(16).toUpperCase().padStart(3, '0')}`
  },
  {
    label: 'Structure group',
    value: `$${island.structureGroup.toString(16).toUpperCase().padStart(2, '0')}`
  },
  ...(island.areaName
    ? [{ label: 'Settlement published here', value: island.areaName }]
    : []),
  {
    label: 'Source address',
    value: `$${island.sourceAddress.toString(16).toUpperCase().padStart(6, '0')}`
  }
];

export const islandProvenance = (island: Island): readonly string[] => [
  'Recovered: the coastline is the closed ring the scan at $0561CE reads, placed at this ' +
    "record's own origin in Surface Cells and filled in the colour its $8 word publishes. The " +
    'box list is authored in the original and recovered as authored.',
  'An island carries no name of its own. The area name belongs to the Structure Workspace ' +
    'this record binds, and 33 of the 62 records publish none.',
  ...(island.extent.wrapsX || island.extent.wrapsZ
    ? [
        'This record crosses the coordinate seam, so its extent wraps and its ring is drawn ' +
          'whole on both sides rather than cut at the edge.'
      ]
    : []),
  ...(island.workspace === null
    ? [
        'Structure group $00 binds no workspace, so no Settlement or structure is published ' +
          'for this record.'
      ]
    : [])
];

/// The Catalogue holds no island record view: its deep links reach a Model, an Instance or a
/// Body's placement map, and its search covers Model names rather than area names. So the
/// honest hand-off is the Body, and the panel says as much rather than implying an island entry
/// exists.
///
/// `/catalogue` and not `/damocles/catalogue`: the Catalogue's eventual home is under the
/// Damocles Title's path, but the path it is actually served at is still the root one (ADR
/// 0042), and `documentPath.ts` resolves no other. Pointing at the eventual one sent every
/// Catalogue link in the Atlas to the Targ Title instead.
export const catalogueHref = (sourceIndex: number): string =>
  `/catalogue?body=${catalogueBodyId(sourceIndex)}`;

/// One recovered Damocles Instance in the Catalogue, on its own Body. A Place holds several, and
/// each is a record the Catalogue does hold a view of, so unlike an island this hand-off reaches
/// the thing itself.
export const instanceHref = (sourceIndex: number, instanceId: string): string =>
  `${catalogueHref(sourceIndex)}&instance=${encodeURIComponent(instanceId)}`;

/// A picked Damocles Place, with the Instances the Catalogue lists in it.
export interface PlaceSelection {
  /// Where the map wrote the name, in Body Coordinates; null if the Place has no located
  /// Instance and so nothing to stand at.
  readonly at: MapPoint | null;
  readonly instances: readonly Instance[];
  readonly place: Place;
}

/// The recovered numbers behind one Damocles Place. Its position is its Instances' and not its
/// own, which the provenance says and the label here does not pretend otherwise.
export const placeFacts = (selection: PlaceSelection): readonly BodyFact[] => [
  { label: 'Record', value: selection.place.id },
  ...(selection.at
    ? [
        {
          label: 'Mean cell',
          value: `${Math.round(selection.at.x)} / ${Math.round(selection.at.z)} Surface Cells`
        }
      ]
    : []),
  {
    label: 'Instances',
    value: String(selection.place.instances.length)
  }
];

export const placeProvenance = (
  selection: PlaceSelection
): readonly string[] => {
  const unlocated =
    selection.place.instances.length -
    selection.instances.filter(instance => instance.location).length;
  return [
    'Recovered: one named location of this Body, with the Instances the Catalogue lists in ' +
      'it. A place name alone establishes neither its position nor its contents, so the cell ' +
      'above is the mean of those Instances\u2019 own recovered Body Coordinates and is not a ' +
      'position the Place holds.',
    ...(unlocated
      ? [
          `${unlocated} of its ${selection.place.instances.length} Instances carry no ` +
            'recovered location, and are not counted in that mean.'
        ]
      : []),
    'A Damocles Place is not part of the Settlement it stands in: the two are recovered from ' +
      'different records, and neither one lists the other.'
  ];
};

/// What the panel says about a Body's roads once the camera is close enough to draw them.
export interface RoadSelection {
  /// Runs drawn on this Body, across every one of its networks.
  readonly lines: number;
  /// Networks recovered for this Body, whether or not they carry a run.
  readonly networks: number;
  readonly recovery: RoadRecovery;
}

export const roadFacts = (roads: RoadSelection): readonly BodyFact[] =>
  roads.recovery === 'gap'
    ? []
    : [
        { label: 'Road networks', value: String(roads.networks) },
        { label: 'Runs drawn', value: String(roads.lines) }
      ];

/// Roads are the one layer of the Atlas with a per-Body hole in it, so what is drawn and what is
/// missing are both stated, and the two are never the same sentence.
export const roadProvenance = (roads: RoadSelection): readonly string[] => {
  if (roads.recovery === 'gap') {
    return [
      `${ROAD_GAP_NOTICE}. The Catalogue carries a road network for each Structure Workspace ` +
        'group a capture has loaded — 20 of the 30 Bodies — and this Body is not one of them ' +
        '(#441). No capture has reached its workspaces, so the blank ground here is the ' +
        'absence of a reading and not a recovered claim that this Body has no roads.',
      'The road records themselves were found by the earlier ground work: #206 located Eris ' +
        'ground, landing-pad and road geometry, #173 reconciled the model and geometry ' +
        'census, #281 identified ground-band generation and the route scene slots, and #370 ' +
        'recovered what bounds the Damocles draw on foot.'
    ];
  }
  if (roads.recovery === 'none') {
    return [
      'This Settlement is recovered and has no roads: its group carries a network record with ' +
        'no run at all (#441), which is a reading and not a gap. A Settlement is no more ' +
        'obliged to have roads than it is to have an island.'
    ];
  }
  return [
    'Recovered: the runs the classifier at $04EC30 finds in the group’s own extent grid, which ' +
      'are the lines the game itself draws from the air (#441). Each is one Surface Cell wide ' +
      'and drawn as its centre line, placed at the group’s origin in Surface Cells.',
    'The road pieces are recovered too — each cell’s piece, its rotation and the ground record ' +
      'it draws — and none of them is drawn here. This layer is the network and not its ' +
      'surface: no pad, no ground colouring and no piece face is invented to fill it in.'
  ];
};

const row = (label: string, value: string): HTMLElement => {
  const div = document.createElement('div');
  div.className = 'panel-row';
  const name = document.createElement('span');
  name.className = 'panel-label';
  name.textContent = label;
  const text = document.createElement('span');
  text.textContent = value;
  div.append(name, text);
  return div;
};

const paragraph = (text: string, className = ''): HTMLElement => {
  const p = document.createElement('p');
  p.textContent = text;
  if (className) {
    p.className = className;
  }
  return p;
};

export interface PanelSelection {
  readonly island?: Island | null | undefined;
  readonly place?: PlaceSelection | null | undefined;
  /// This Body's roads, from the band that draws them; absent outward of it, where a notice
  /// about a layer the reader could not have seen would say nothing.
  readonly roads?: RoadSelection | null | undefined;
  /// The Body whose surface is drawn on its own disc at the System Range, if any.
  readonly surfaceOnDisc?: string | undefined;
}

/// Selecting a Body is the same act as hopping into it, so this panel describes whichever
/// Body the Atlas is in and falls back to the System Range's own note when it is in none.
export const renderPanel = (
  root: HTMLElement,
  system: GammaSystemDocument,
  body: GammaBody | null,
  selection: PanelSelection = {}
): void => {
  const { island, place, roads, surfaceOnDisc } = selection;
  root.replaceChildren();
  if (!body) {
    root.append(
      paragraph('Gamma System', 'panel-heading'),
      paragraph(
        `${system.bodies.length} recovered Bodies. Choose one on the map or in the roster.`
      ),
      paragraph(SYSTEM_RANGE_NOTE, 'muted'),
      ...(surfaceOnDisc ? [paragraph(AUTHORED_SURFACE_NOTE, 'muted')] : []),
      paragraph(`Evidence · ${system.source.evidence}`, 'muted')
    );
    return;
  }
  const swatch = document.createElement('span');
  swatch.className = 'panel-swatch';
  swatch.style.background = body.baseColour;
  const heading = paragraph(body.name, 'panel-heading');
  heading.prepend(swatch);
  root.append(heading);
  for (const fact of bodyFacts(body)) {
    root.append(row(fact.label, fact.value));
  }
  for (const note of bodyProvenance(body)) {
    root.append(paragraph(note, 'muted'));
  }
  if (island) {
    const landSwatch = document.createElement('span');
    landSwatch.className = 'panel-swatch';
    landSwatch.style.background = island.landColour;
    // An island has no name, so the heading names what it is rather than inventing one.
    const islandHeading = paragraph(
      island.areaName ? `Island · ${island.areaName}` : 'Island',
      'panel-heading'
    );
    islandHeading.prepend(landSwatch);
    root.append(islandHeading);
    for (const fact of islandFacts(island)) {
      root.append(row(fact.label, fact.value));
    }
    for (const note of islandProvenance(island)) {
      root.append(paragraph(note, 'muted'));
    }
    const link = document.createElement('a');
    link.href = catalogueHref(body.sourceIndex);
    link.id = 'island-catalogue-link';
    link.textContent = `${body.name} in the Catalogue`;
    const wrapper = paragraph('', 'muted');
    wrapper.append(
      'The Catalogue holds no island record view, so this reaches this Body\u2019s recovered placements · ',
      link
    );
    root.append(wrapper);
  }
  if (place) {
    root.append(paragraph(`Place · ${place.place.name}`, 'panel-heading'));
    for (const fact of placeFacts(place)) {
      root.append(row(fact.label, fact.value));
    }
    root.append(paragraph('Instances', 'panel-heading'));
    for (const instance of place.instances) {
      const link = document.createElement('a');
      link.href = instanceHref(body.sourceIndex, instance.id);
      link.className = 'panel-instance';
      link.textContent = instance.name;
      const wrapper = paragraph('');
      wrapper.append(link);
      root.append(wrapper);
    }
    for (const note of placeProvenance(place)) {
      root.append(paragraph(note, 'muted'));
    }
  }
  if (roads) {
    // Headed as the gap where there is one, so a reader skimming the panel meets the missing
    // layer under its own name rather than under a heading promising roads.
    const heading = paragraph(
      roads.recovery === 'gap' ? 'Roads · not recovered' : 'Roads',
      'panel-heading'
    );
    heading.id = 'road-recovery';
    heading.dataset['recovery'] = roads.recovery;
    root.append(heading);
    for (const fact of roadFacts(roads)) {
      root.append(row(fact.label, fact.value));
    }
    for (const note of roadProvenance(roads)) {
      root.append(paragraph(note, 'muted'));
    }
  }
  root.append(paragraph(`Evidence · ${system.source.evidence}`, 'muted'));
};
