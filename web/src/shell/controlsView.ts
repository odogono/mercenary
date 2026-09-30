import type { ControlsGroup } from './input.ts';

const MODE_LABELS = { hold: 'HOLD', toggle: 'TOGGLE' } as const;

/// Fill the Controls Page with a Title's Bindings.
///
/// The page is drawn when it opens rather than kept live: the System Menu pauses stepping, so
/// the player's Occupancy cannot change while it is up.
export const renderControlsPage = (
  page: HTMLElement,
  groups: readonly ControlsGroup[]
): void => {
  const container = page.querySelector<HTMLElement>('#controls-groups');
  if (container === null) {
    return;
  }
  container.replaceChildren(
    ...groups.map(group => {
      const section = document.createElement('section');
      section.className = 'controls-group';
      section.dataset['group'] = group.name;
      if (group.current) {
        section.setAttribute('aria-current', 'true');
      }
      const title = document.createElement('p');
      title.className = 'controls-group-title';
      title.textContent = group.title;
      const rows = document.createElement('dl');
      rows.className = 'controls-rows';
      for (const row of group.rows) {
        const keys = document.createElement('dt');
        keys.textContent = row.keys;
        // Every row has the pad's cell, empty where the pad has no button for it, so the
        // columns line up.
        const pad = document.createElement('dd');
        pad.className = 'controls-pad';
        pad.textContent = row.pad ?? '';
        const action = document.createElement('dd');
        action.textContent =
          row.mode === undefined
            ? row.action
            : `${row.action} (${MODE_LABELS[row.mode]})`;
        rows.append(keys, pad, action);
      }
      section.append(title, rows);
      return section;
    })
  );
};
