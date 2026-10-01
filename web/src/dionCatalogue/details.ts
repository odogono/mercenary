import type { DionCatalogue } from '../dion/catalogue.ts';
import { element, node, option, paragraph, selectionLink } from './dom.ts';
import {
  fieldOccurrence,
  hostSelection,
  type Entry,
  type Selection
} from './inspection.ts';

export const showDetails = (
  c: DionCatalogue,
  entry: Entry,
  selection: Selection,
  entries: readonly Entry[]
): void => {
  const details = node('details');
  details.replaceChildren();
  const links = (
    heading: string,
    ids: readonly string[],
    context: (id: string) => Record<string, string> = () => ({})
  ) => {
    details.append(element('h3', heading));
    const list = element('ul');
    for (const id of ids) {
      const e = entries.find(e => e.id === id);
      const li = element('li');
      li.append(selectionLink(e?.name ?? id, id, context(id)));
      list.append(li);
    }
    details.append(list);
  };
  const object = c.objects.find(o => o.id === entry.id);
  const place = c.places.find(p => p.id === entry.id);
  const p = c.placements.find(p => p.id === (place?.placement ?? entry.id));
  node('floor-control').hidden = true;
  node('logos-control').hidden = true;
  node('field-control').hidden = true;
  if (object) {
    paragraph(
      details,
      `Object slot ${object.slot} · ${object.residence}. ${object.position ? `Initial position ${object.position.join(', ')}.` : 'No physical coordinates are exported for this residence.'}`
    );
    if (object.geometry) {
      links('Geometry definition', [
        object.geometry,
        ...(object.forms ?? []).flatMap(f =>
          f.geometry && f.geometry !== object.geometry ? [f.geometry] : []
        )
      ]);
    } else {
      paragraph(
        details,
        'NULL model · evidenced absence of drawable geometry.'
      );
    }
    const host = hostSelection(c, object.id);
    if (host) {
      const a = selectionLink(
        `Inspect host · Floor ${host.floor === 0 ? 'G' : host.floor === 10 ? 'B' : host.floor}`,
        host.id,
        {
          fieldX: String(host.fieldX),
          fieldZ: String(host.fieldZ),
          floor: String(host.floor)
        }
      );
      a.id = 'host-link';
      details.append(a);
      if (object.indoor) {
        paragraph(
          details,
          `Association ${object.indoor.association} · group ${object.indoor.group}, cell $${object.indoor.cell.toString(16).toUpperCase()} · reachability unverified.`
        );
      }
    }
  }
  if (p) {
    const structure = c.structures.find(s => s.id === p.structure)!;
    paragraph(
      details,
      `Placed instance · group ${p.group}, cell $${p.cell.toString(16).padStart(2, '0').toUpperCase()} · structure slot ${p.slot} · ${p.state}.`
    );
    paragraph(
      details,
      `Body cell ${p.bodyCell.join(', ')} · cell-local origin ${p.origin.join(', ')} · scale ${structure.scale.join(', ')}.`
    );
    const floor = node<HTMLSelectElement>('floor');
    floor.replaceChildren(
      ...structure.floors.map(f => option(String(f.floor), f.label))
    );
    floor.value = String(selection.floor);
    node('floor-control').hidden = false;
    const binding = structure.floorBindings.find(
      f => f.floor === selection.floor
    );
    if (binding) {
      links('Floor geometry', [binding.geometry, structure.detail], id =>
        id === binding.geometry
          ? { floor: String(selection.floor), variant: binding.variant }
          : { floor: String(selection.floor) }
      );
      paragraph(
        details,
        `Floor ${selection.floor === 10 ? 'B' : selection.floor === 0 ? 'G' : selection.floor} · base height ${binding.baseY} · palette ${binding.palette}. A Floor label is not a height.`
      );
    }
    const repeat = p.id === c.field.seed;
    const occurrence = repeat
      ? fieldOccurrence(c, selection.fieldX, selection.fieldZ)
      : undefined;
    links(
      'Residents on this Floor',
      c.objects
        .filter(
          o =>
            o.floor === selection.floor &&
            (occurrence
              ? o.host?.field === 'midas' &&
                o.bodyCell?.join(',') === occurrence.bodyCell.join(',')
              : o.host?.placement === p.id)
        )
        .map(o => o.id)
    );
    if (p.state === 'storage') {
      paragraph(
        details,
        'VOID storage records are inspectable data; they are not navigable Locations.'
      );
    }
    if (p.id === c.constructions.binding) {
      node('logos-control').hidden = false;
      node<HTMLSelectElement>('state').value = selection.state;
      paragraph(
        details,
        'LOGOS initial overlay clears this cell; constructed inspection rebinds slot 136. No campaign progression runs.'
      );
    }
    if (repeat) {
      node('field-control').hidden = false;
      node<HTMLInputElement>('field-x').value = String(selection.fieldX);
      node<HTMLInputElement>('field-z').value = String(selection.fieldZ);
      node('field-reference').textContent =
        `${occurrence!.id} · 56:${occurrence!.cell.toString(16).padStart(2, '0').toUpperCase()} · Body cell ${occurrence!.bodyCell.join(', ')}`;
      paragraph(
        details,
        'One authored MIDAS seed, a repeating rule. The 256-cell workspace is not a physical-location count. Residents 101 and 118 belong only to Body cell 2122, 3632.'
      );
    }
  }
  const g = c.geometryIndex.find(g => g.id === entry.id);
  if (g) {
    paragraph(
      details,
      `Shared ${g.family} definition · source ${g.record} · independent of placements.`
    );
    links(
      'Objects using this geometry',
      c.objects
        .filter(
          o => o.geometry === g.id || o.forms?.some(f => f.geometry === g.id)
        )
        .map(o => o.id)
    );
    links(
      'Placements using this geometry',
      c.placements
        .filter(p => {
          const s = c.structures.find(s => s.id === p.structure)!;
          return s.detail === g.id || s.floors.some(f => f.geometry === g.id);
        })
        .map(p => p.id),
      id => {
        const placement = c.placements.find(p => p.id === id)!;
        const structure = c.structures.find(s => s.id === placement.structure)!;
        return {
          floor: String(
            structure.floorBindings.find(
              f =>
                f.floor === selection.floor &&
                (f.geometry === g.id || structure.detail === g.id)
            )?.floor ??
              structure.floorBindings.find(f => f.geometry === g.id)?.floor ??
              0
          )
        };
      }
    );
  }
  const area = c.areas.find(a => a.id === entry.id);
  if (area) {
    paragraph(
      details,
      `${area.disposition} · ${area.initialBindings} initial / ${area.authoredBindings} authored bindings. Empty, unused, label-only and outline-only groups retain their dispositions.`
    );
    links(
      'Group placements',
      c.placements.filter(p => p.group === area.group).map(p => p.id)
    );
  }
  const body = c.bodies.find(b => b.id === entry.id);
  if (body) {
    links(
      'Groups',
      body.islands.map(i => c.areas.find(a => a.group === i.group)!.id)
    );
    links('Island definitions', [
      ...new Set(body.islands.map(i => i.geometry))
    ]);
  }
  if (place && !place.placement) {
    paragraph(
      details,
      'Label-only named place: no structure placement is evidenced.'
    );
  }
  if (entry.bodies.length) {
    links('Bodies', entry.bodies);
  }
};
