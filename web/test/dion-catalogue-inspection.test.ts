import { beforeAll, describe, expect, test } from 'bun:test';

import {
  loadDionCatalogue,
  type DionCatalogue
} from '../src/dion/catalogue.ts';
import {
  catalogueEntries,
  fieldOccurrence,
  filterEntries,
  hostSelection,
  readSelection
} from '../src/dionCatalogue/inspection.ts';
import { resolveDocumentPath } from '../src/shell/documentPath.ts';

let catalogue: DionCatalogue;
beforeAll(async () => {
  catalogue = (
    await loadDionCatalogue(path =>
      Bun.file(new URL(`../..${path}`, import.meta.url)).json()
    )
  ).catalogue;
});
describe('sessionless Dion Catalogue inspection', () => {
  test('has its own canonical route and leaves the Damocles Catalogue intact', () => {
    expect(resolveDocumentPath('/dion/catalogue')).toEqual({
      document: 'dion-catalogue',
      kind: 'document'
    });
    expect(resolveDocumentPath('/dion/catalogue/')).toEqual({
      kind: 'redirect',
      pathname: '/dion/catalogue',
      status: 308
    });
    expect(resolveDocumentPath('/catalogue')).toEqual({
      document: 'catalogue',
      kind: 'document'
    });
  });
  test('searches names and original references independently of geometry identity', () => {
    const entries = catalogueEntries(catalogue);
    expect(
      filterEntries(entries, { q: 'superperson suit' }).map(e => e.id)
    ).toContain('object-001');
    expect(
      filterEntries(entries, { kind: 'placement', q: '2:03' }).map(e => e.id)
    ).toEqual(['placement-02-03']);
    expect(
      filterEntries(entries, { kind: 'placement', q: 'slot 203' }).length
    ).toBeGreaterThan(1);
    expect(entries.filter(e => e.kind === 'geometry')).toHaveLength(529);
    expect(entries.filter(e => e.kind === 'object')).toHaveLength(246);
  });
  test('combines Body, group, named place and Floor filters and retains empty groups', () => {
    const entries = catalogueEntries(catalogue);
    expect(
      filterEntries(entries, {
        body: 'body-04',
        floor: '4',
        group: '2',
        kind: 'object'
      }).map(e => e.id)
    ).toContain('object-030');
    expect(
      filterEntries(entries, { kind: 'placement', place: 'place-02-03' }).map(
        e => e.id
      )
    ).toEqual(['placement-02-03']);
    expect(
      filterEntries(entries, { group: '1' }).some(e => e.id === 'area-01')
    ).toBe(true);
    expect(filterEntries(entries, { q: 'no such name' })).toEqual([]);
  });
  test('navigates residents to their host Floor without inventing coordinates for carried entries', () => {
    expect(hostSelection(catalogue, 'object-030')).toMatchObject({
      floor: 4,
      id: 'placement-02-03'
    });
    expect(hostSelection(catalogue, 'object-101')).toMatchObject({
      fieldX: 393,
      fieldZ: 2694,
      floor: 0,
      id: 'placement-56-00'
    });
    expect(hostSelection(catalogue, 'object-104')).toBeNull();
  });
  test('inspects the MIDAS rule on demand without counting workspaces as physical placements', () => {
    expect(fieldOccurrence(catalogue, 393, 2694)).toEqual({
      bodyCell: [2122, 3632],
      cell: 0x69,
      id: 'field-56-393-2694'
    });
    expect(fieldOccurrence(catalogue, -1, -1).cell).toBe(255);
    expect(catalogue.placements.filter(p => p.group === 56)).toHaveLength(1);
  });
  test('preserves direct selection, LOGOS state and field coordinates', () => {
    expect(
      readSelection(
        new URLSearchParams(
          'id=placement-08-32&floor=2&state=constructed&fieldX=-1&fieldZ=17'
        )
      )
    ).toEqual({
      fieldX: -1,
      fieldZ: 17,
      floor: 2,
      id: 'placement-08-32',
      region: 0,
      state: 'constructed',
      variant: ''
    });
    expect(
      readSelection(new URLSearchParams('floor=oops&state=script&region=-1'))
        .floor
    ).toBe(0);
  });
});
