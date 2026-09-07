import type { Catalogue } from './data.ts';
import { link, node } from './dom.ts';

export const renderMap = (
  data: Catalogue,
  body: string,
  selected: string | null
): void => {
  const map = node('map'),
    locations = node('locations');
  map.replaceChildren();
  locations.replaceChildren();
  const located = data.instances.filter(
    instance => instance.location?.body === body
  );
  const systems = new Set(
    located.map(instance => instance.location!.coordinateSystem)
  );
  if (systems.size > 1) {
    node('map-note').textContent =
      'Placements use incompatible coordinate systems; see the location list.';
  } else if (!located.length) {
    node('map-note').textContent =
      'No verified surface placements for this body yet. Unknown locations are not plotted.';
  } else {
    const xs = located.map(instance => instance.location!.position[0]),
      zs = located.map(instance => instance.location!.position[2]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    const span = Math.max(maxX - minX, maxZ - minZ, 1),
      cx = (minX + maxX) / 2,
      cz = (minZ + maxZ) / 2;
    node('map-note').textContent =
      `${located.length} recovered placements · ${[...systems][0]} · X right, Z up`;
    for (const instance of located) {
      const at = instance.location!;
      const a = link('', 'instance', instance.id);
      a.title = instance.name;
      a.setAttribute('aria-label', instance.name);
      a.setAttribute('aria-current', String(instance.id === selected));
      a.style.left = `${50 + (80 * (at.position[0] - cx)) / span}%`;
      a.style.top = `${50 - (80 * (at.position[2] - cz)) / span}%`;
      map.append(a);
    }
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
