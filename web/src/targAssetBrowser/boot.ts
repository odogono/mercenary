/// The Targ Asset Browser page (`/targ/assets`, #877): find a Targ model, see it as the game draws
/// it, and copy the commands that start an edit. Sessionless and read-only.

import { parseAssetFile } from '../geometry/targAssets.ts';
import {
  fetchAssets,
  fetchReader,
  load,
  type ReadDocument
} from '../payload/load.ts';
import { Renderer, planInspection } from '../shell/frame.ts';
import {
  adoptCommand,
  blenderCommand,
  browserEntries,
  type BrowserEntry
} from './entries.ts';
import {
  DEFAULT_ORBIT,
  orbitCamera,
  previewGeometry,
  type Orbit,
  type PreviewGeometry
} from './preview.ts';

const node = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = ''
): HTMLElementTagNameMap[K] => {
  const result = document.createElement(tag);
  result.textContent = text;
  return result;
};

const KIND_LABEL = { objects: 'Object model', structures: 'Structure' };
const STATUS_LABEL = {
  authored: 'Authored',
  edited: 'Edited',
  recovered: 'Recovered'
};

const canvas = node<HTMLCanvasElement>('view');
let renderer: Renderer | undefined;
let geometry: PreviewGeometry | undefined;
let orbit: Orbit = DEFAULT_ORBIT;

const draw = (): void => {
  if (geometry === undefined) {
    return;
  }
  const ratio = window.devicePixelRatio || 1;
  const size = { height: canvas.clientHeight, width: canvas.clientWidth };
  canvas.width = Math.round(size.width * ratio);
  canvas.height = Math.round(size.height * ratio);
  renderer ??= new Renderer(canvas);
  renderer.render(planInspection(orbitCamera(geometry, orbit), geometry, size));
};

const turn = (heading: number, pitch: number, zoom = 1): void => {
  orbit = {
    distance: Math.min(20, Math.max(1.2, orbit.distance * zoom)),
    heading: orbit.heading + heading,
    pitch: Math.min(1.5, Math.max(-1.5, orbit.pitch + pitch))
  };
  draw();
};

const STEP = Math.PI / 12;
const controls: Record<string, () => void> = {
  down: () => turn(0, STEP),
  left: () => turn(-STEP, 0),
  reset: () => {
    orbit = DEFAULT_ORBIT;
    draw();
  },
  right: () => turn(STEP, 0),
  up: () => turn(0, -STEP),
  'zoom-in': () => turn(0, 0, 0.8),
  'zoom-out': () => turn(0, 0, 1.25)
};
for (const [id, action] of Object.entries(controls)) {
  node(id).addEventListener('click', action);
}
const KEYS: Record<string, string> = {
  '-': 'zoom-out',
  '+': 'zoom-in',
  '=': 'zoom-in',
  '0': 'reset',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up'
};
canvas.addEventListener('keydown', event => {
  const action = KEYS[event.key];
  if (action !== undefined) {
    event.preventDefault();
    controls[action]!();
  }
});
new ResizeObserver(draw).observe(canvas);

const command = (label: string, text: string): HTMLElement => {
  const row = element('div');
  row.className = 'command';
  const code = element('code', text);
  code.setAttribute('aria-label', label);
  const copy = element('button', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(text).then(() => {
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy'), 1200);
    });
  });
  row.append(code, copy);
  return row;
};

const list = (title: string, items: readonly string[]): HTMLElement[] => {
  const ul = element('ul');
  ul.append(...items.map(item => element('li', item)));
  return [element('h3', title), ul];
};

const show = (entry: BrowserEntry): void => {
  node('entry-kind').textContent = KIND_LABEL[entry.kind];
  node('entry-name').textContent = entry.identity;
  const badge = node('entry-status');
  badge.hidden = false;
  badge.dataset['status'] = entry.status;
  badge.textContent = STATUS_LABEL[entry.status];
  node('entry-drift').hidden = !entry.drift;

  const commands = node('commands');
  commands.replaceChildren(
    ...(entry.status === 'recovered'
      ? [
          command('Adopt command', adoptCommand(entry)),
          element('p', 'then open the file it writes:')
        ]
      : []),
    command('Blender command', blenderCommand(entry))
  );
  for (const p of commands.querySelectorAll('p')) {
    p.className = 'muted';
  }

  const details = node('details');
  details.replaceChildren(
    element('p', entry.path),
    ...(entry.changes === undefined
      ? []
      : [
          element(
            'p',
            `${entry.changes} classified change${entry.changes === 1 ? '' : 's'} in its Change Ledger`
          )
        ]),
    ...list(
      `Placements (${entry.placements.length})`,
      entry.placements.length === 0 ? ['None'] : entry.placements
    ),
    ...(entry.structure === undefined
      ? []
      : list(
          `Structure ${entry.structure.id}`,
          entry.structure.sharedWith.length === 0
            ? ['No other Surface Cell draws it']
            : [
                `Also drawn by Surface Cells ${entry.structure.sharedWith.join(', ')}`
              ]
        ))
  );
  for (const p of details.querySelectorAll('p')) {
    p.className = 'muted';
  }

  geometry = previewGeometry(entry.asset);
  orbit = DEFAULT_ORBIT;
  draw();
};

const matches = (entry: BrowserEntry, query: string): boolean =>
  [entry.identity, entry.structure?.id ?? '', ...entry.placements].some(text =>
    text.toLowerCase().includes(query)
  );

const start = async (): Promise<void> => {
  // Both loads read the same documents, so each is fetched once.
  const fetched = new Map<string, Promise<string | undefined>>();
  const fetchDocument = fetchReader(new URL('/payload/', location.href).href);
  const read: ReadDocument = name => {
    if (!fetched.has(name)) {
      fetched.set(name, fetchDocument(name));
    }
    return fetched.get(name)!;
  };
  const files = await fetchAssets(
    new URL('/assets/targ.json', location.href).href
  )();
  const [baseline, effective, assets] = await Promise.all([
    load(read),
    load(read, async () => files),
    Promise.all(files.map(parseAssetFile))
  ]);
  const entries = await browserEntries(baseline, effective, assets);

  const edited = entries.filter(e => e.status !== 'recovered').length;
  node('summary').textContent =
    `${entries.filter(e => e.kind === 'objects').length} object models · ` +
    `${entries.filter(e => e.kind === 'structures').length} structures · ` +
    `${edited} edited or authored`;

  const results = node('results');
  const search = node<HTMLInputElement>('search');
  const kind = node<HTMLSelectElement>('kind');
  const status = node<HTMLSelectElement>('status');
  let selected = new URL(location.href).searchParams.get('id');

  const select = (entry: BrowserEntry): void => {
    selected = entry.identity;
    const url = new URL(location.href);
    url.searchParams.set('id', entry.identity);
    history.replaceState(null, '', url);
    for (const a of results.querySelectorAll('a')) {
      a.setAttribute(
        'aria-current',
        String(a.dataset['identity'] === entry.identity)
      );
    }
    show(entry);
  };

  const render = (): void => {
    const query = search.value.trim().toLowerCase();
    const shown = entries.filter(
      e =>
        (kind.value === '' || e.kind === kind.value) &&
        (status.value === '' || e.status === status.value) &&
        (query === '' || matches(e, query))
    );
    node('result-count').textContent = `${shown.length} of ${entries.length}`;
    results.replaceChildren(
      ...shown.map(entry => {
        const a = element('a', entry.identity);
        a.href = `?id=${encodeURIComponent(entry.identity)}`;
        a.dataset['identity'] = entry.identity;
        a.setAttribute('aria-current', String(entry.identity === selected));
        a.append(
          element(
            'small',
            [
              STATUS_LABEL[entry.status],
              entry.drift ? 'drifted' : '',
              `${entry.placements.length} placed`,
              entry.structure?.id ?? ''
            ]
              .filter(Boolean)
              .join(' · ')
          )
        );
        a.addEventListener('click', event => {
          event.preventDefault();
          select(entry);
        });
        return a;
      })
    );
  };
  for (const control of [search, kind, status]) {
    control.addEventListener('input', render);
  }
  render();
  node('browser').hidden = false;
  const initial = entries.find(e => e.identity === selected) ?? entries[0];
  if (initial !== undefined) {
    select(initial);
  }
};

try {
  await start();
} catch (error) {
  node('summary').textContent = '';
  node('failure').hidden = false;
  node('failure-message').textContent =
    error instanceof Error ? error.message : String(error);
}
