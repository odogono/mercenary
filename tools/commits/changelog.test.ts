import { expect, test } from 'bun:test';

import { insertRelease, renderSection } from './changelog';
import { type Fragment } from './fragment';

const entry = (fields: Partial<Fragment>): Fragment => ({
  breaking: false,
  entry: 'X.',
  section: 'added',
  type: 'feat',
  ...fields
});

test('groups entries by section in Keep a Changelog order, breaking first', () => {
  expect(
    renderSection('[Unreleased]', [
      entry({ entry: 'Fix y.', section: 'fixed', type: 'fix' }),
      entry({ entry: '**Add x.** Line one\nline two.' }),
      entry({ breaking: true, entry: 'Rename z.' }),
      entry({ entry: 'Still slow.', section: 'known', type: 'docs' })
    ])
  ).toBe(
    [
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '- **Breaking.** Rename z.',
      '- **Add x.** Line one\n  line two.',
      '',
      '### Fixed',
      '',
      '- Fix y.',
      '',
      '### Known',
      '',
      '- Still slow.'
    ].join('\n')
  );
});

const CHANGELOG = [
  '# Changelog',
  '',
  'Intro.',
  '',
  '## [0.21.0] - 2026-10-03',
  '',
  '### Added',
  '',
  '- Old.',
  '',
  '[0.21.0]: https://github.com/odogono/mercenary/compare/v0.20.0...v0.21.0',
  ''
].join('\n');

test('inserts a release ahead of the newest one, with its compare link', () => {
  expect(
    insertRelease(CHANGELOG, '0.22.0', '## [0.22.0] - 2026-10-10\n\n- New.')
  ).toBe(
    [
      '# Changelog',
      '',
      'Intro.',
      '',
      '## [0.22.0] - 2026-10-10',
      '',
      '- New.',
      '',
      '## [0.21.0] - 2026-10-03',
      '',
      '### Added',
      '',
      '- Old.',
      '',
      '[0.22.0]: https://github.com/odogono/mercenary/compare/v0.21.0...v0.22.0',
      '[0.21.0]: https://github.com/odogono/mercenary/compare/v0.20.0...v0.21.0',
      ''
    ].join('\n')
  );
});

test('refuses a version already released', () => {
  expect(() => insertRelease(CHANGELOG, '0.21.0', '## [0.21.0]')).toThrow(
    'already has 0.21.0'
  );
});
