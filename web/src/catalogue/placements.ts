import { atlasHref, atlasInstanceHref } from '../atlas/state.ts';
import { catalogueBodyId } from '../atlas/surface.ts';
import type { GammaSystemDocument } from '../flyover/documents.ts';
import type { Catalogue, Instance } from './data.ts';
import { element, link, node } from './dom.ts';

// Where one Body's recovered placements are listed, and where each of them hands over to the
// Atlas. The Catalogue drew its own marker map here until #415; the Atlas is the map now, and
// what stays is the list of named records to full precision, which is the one thing a map
// is not for.

// Which Atlas Body each Catalogue Body is. The Catalogue keys a Body by slot and `system.json`
// keys it by slug, both from the same recovered source index, so this is the join and not a
// lookup table (`atlas/surface.ts`).
//
// Empty where the Gamma System document could not be read, and missing the VOID slot, which the
// Catalogue carries as a space-as-place sentinel and the Atlas has no Body for. Either way the
// hand-off is withheld rather than guessed.
export const atlasBodyIds = (
  system: GammaSystemDocument | undefined
): ReadonlyMap<string, string> =>
  new Map(
    (system?.bodies ?? []).map(body => [
      catalogueBodyId(body.sourceIndex),
      body.id
    ])
  );

// The Atlas link for one placed Instance, or null where there is nothing true to link to: an
// Instance with no recovered surface position, or a Body the Atlas does not hold.
export const atlasLinkFor = (
  atlasBodies: ReadonlyMap<string, string>,
  instance: Instance
): string | null => {
  const at = instance.location;
  const bodyId = at && atlasBodies.get(at.body);
  return at && bodyId
    ? atlasInstanceHref(bodyId, instance.id, {
        x: at.position[0],
        z: at.position[2]
      })
    : null;
};

// One Body's recovered placements: what was recovered, where to see the Body itself on the
// Atlas, and every placement as a link to its own entry.
export const renderPlacements = (
  data: Catalogue,
  atlasBodies: ReadonlyMap<string, string>,
  body: string
): void => {
  const note = node('placement-note'),
    locations = node('locations'),
    hop = node('placement-hop');
  locations.replaceChildren();
  hop.replaceChildren();
  const located = data.instances.filter(
    instance => instance.location?.body === body
  );
  const systems = new Set(
    located.map(instance => instance.location!.coordinateSystem)
  );
  note.textContent = located.length
    ? `${located.length} recovered placement${located.length === 1 ? '' : 's'} · ${[...systems].join(' · ')}`
    : 'No verified surface placement for this body yet. Unknown locations are not listed.';
  const bodyId = atlasBodies.get(body);
  if (bodyId) {
    // The Body's own surface, not a placement's cell: the per-placement hop belongs beside the
    // placement, and this offer stands even where nothing was placed here, because a Body's
    // islands and roads are recovered whether or not anything stands on them.
    const anchor = element(
      'a',
      `${data.bodies.find(item => item.id === body)?.name} on the Gamma Atlas`
    );
    anchor.href = atlasHref({
      bodyId,
      instanceId: null,
      islandId: null,
      level: 'body',
      placeId: null,
      view: null
    });
    anchor.id = 'placement-hop-link';
    hop.append(anchor);
  }
  for (const instance of located) {
    locations.append(
      link(
        `${instance.name} · ${instance.location!.position.map(value => value.toFixed(3)).join(', ')}`,
        'instance',
        instance.id
      )
    );
  }
};
