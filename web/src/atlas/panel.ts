import type { GammaBody, GammaSystemDocument } from '../flyover/documents.ts';

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

/// Selecting a Body is the same act as hopping into it, so this panel describes whichever
/// Body the Atlas is in and falls back to the System Range's own note when it is in none.
export const renderPanel = (
  root: HTMLElement,
  system: GammaSystemDocument,
  body: GammaBody | null
): void => {
  root.replaceChildren();
  if (!body) {
    root.append(
      paragraph('Gamma System', 'panel-heading'),
      paragraph(
        `${system.bodies.length} recovered Bodies. Choose one on the map or in the roster.`
      ),
      paragraph(SYSTEM_RANGE_NOTE, 'muted'),
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
  root.append(paragraph(`Evidence · ${system.source.evidence}`, 'muted'));
};
