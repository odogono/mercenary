import type { HeadTable, PanelKind } from '../interaction/headCommands.ts';
import {
  centreArt,
  textField,
  type DionPanelTextField
} from './panelDocument.ts';
import { fail, int, ints, list, record, text } from './read.ts';

/// Mercenary III's Open table, documents and centre-box art, exported by `m3lab.head` into
/// `presentation/head.json` (#756). The Head Commands themselves are shared with Damocles
/// (`interaction/headCommands.ts`); this file owns what the table means for Mercenary III.

export interface DionOpenRow {
  readonly colour1From152: number;
  readonly colour4: number;
  readonly index: number;
  readonly mode: number;
  readonly slot: number;
}

export interface DionDocumentItem {
  readonly name: string;
  /// Packed message rows, shown one after another; only the last scrolls out (`$55A86`).
  readonly rows: readonly string[];
}

export interface DionHead {
  /// Each mode's centre art, 32 rows of 64 palette indices.
  readonly art: ReadonlyMap<number, readonly Uint8Array[]>;
  /// Documents by their bank index.
  readonly documents: ReadonlyMap<number, readonly DionDocumentItem[]>;
  readonly fruitReels: readonly number[];
  readonly itemField: DionPanelTextField;
  readonly locationLabels: ReadonlyMap<
    number,
    {
      readonly header: string;
      readonly records: ReadonlyMap<number, string>;
    }
  >;
  readonly random: readonly number[];
  readonly rows: readonly DionOpenRow[];
  /// Title and footer strips by `mode:index`: five rows of 64 bits, stamped at `line`.
  readonly strips: ReadonlyMap<
    string,
    readonly { readonly line: number; readonly rows: readonly string[] }[]
  >;
  readonly switchField: Readonly<Record<'off' | 'on', readonly string[]>>;
}

const KINDS: Readonly<Record<number, PanelKind>> = {
  2: 'document',
  3: 'timedDetonator',
  4: 'computer',
  5: 'card',
  6: 'switch',
  7: 'log'
};

export const readDionHead = (raw: Record<string, unknown>): DionHead => {
  const table = record(raw['openTable'], 'head.openTable');
  const rows = list(table['rows'], 'head.openTable.rows').map((value, i) => {
    const r = record(value, `head.openTable.rows[${i}]`);
    return {
      colour1From152: int(r['colour1From152'], 'row.colour1From152', 0, 0x7_77),
      colour4: int(r['colour4'], 'row.colour4', 0, 0x7_77),
      index: int(r['index'], 'row.index', 0, 255),
      mode: int(r['mode'], 'row.mode', 2, 7),
      slot: int(r['slot'], 'row.slot', 1, 246)
    };
  });
  if (rows.length !== 36) {
    fail('head.openTable.rows: expected 36 rows');
  }
  const documents = new Map(
    list(raw['documents'], 'head.documents').map((value, i) => {
      const d = record(value, `head.documents[${i}]`);
      const items = list(d['items'], 'document.items').map((item, j) => {
        const it = record(item, `document.items[${j}]`);
        const name = text(it['name'], 'item.name');
        if (name.length !== 8) {
          fail(`head.documents[${i}].items[${j}].name: not eight characters`);
        }
        const texts = list(it['rows'], 'item.rows').map(row =>
          text(row, 'item.row')
        );
        if (texts.length === 0) {
          fail(`head.documents[${i}].items[${j}]: no rows`);
        }
        return { name, rows: texts };
      });
      return [int(d['index'], 'document.index', 0, 255), items] as const;
    })
  );
  for (const row of rows) {
    if (row.mode === 2 && !documents.has(row.index)) {
      fail(`head.documents: missing document ${row.index}`);
    }
  }
  const art = new Map(
    Object.entries(record(raw['art'], 'head.art')).map(([mode, value]) => [
      Number(mode),
      centreArt(record(value, `head.art.${mode}`)['pixels'], `head.art.${mode}`)
    ])
  );
  const strips = new Map(
    Object.entries(record(raw['strips'], 'head.strips')).map(([key, value]) => [
      key,
      list(value, `head.strips.${key}`).map(strip => {
        const s = record(strip, `head.strips.${key}`);
        const stripRows = list(s['rows'], 'strip.rows').map(row => {
          const bits = text(row, 'strip.row');
          if (!/^[01]{64}$/.test(bits)) {
            fail(`head.strips.${key}: not 64 bits`);
          }
          return bits;
        });
        return { line: int(s['line'], 'strip.line', 0, 27), rows: stripRows };
      })
    ])
  );
  const switchRows = (key: 'off' | 'on'): readonly string[] => {
    const rows = list(
      record(raw['switchField'], 'head.switchField')[key],
      `switchField.${key}`
    ).map(value => {
      const bits = text(value, 'switchField.row');
      if (!/^[01]{32}$/.test(bits)) {
        fail('switchField.row: not 32 bits');
      }
      return bits;
    });
    if (rows.length !== 5) {
      fail('switchField: expected five rows');
    }
    return rows;
  };
  return {
    art,
    documents,
    fruitReels: ints(
      record(raw['fruitReels'], 'head.fruitReels')['values'],
      'head.fruitReels.values',
      3,
      34,
      39
    ),
    itemField: textField(
      record(raw['itemField'], 'head.itemField'),
      'head.itemField'
    ),
    locationLabels: new Map(
      list(raw['locationLabels'], 'head.locationLabels').map(value => {
        const group = record(value, 'locationLabels.group');
        const header = text(group['header'], 'label.header');
        if (header.length !== 0 && header.length !== 20) {
          fail('label.header: not twenty characters');
        }
        return [
          int(group['group'], 'label.group', 0, 56),
          {
            header,
            records: new Map(
              list(group['records'], 'label.records').map(value => {
                const r = record(value, 'label.record');
                const name = text(r['text'], 'label.text');
                if (name.length !== 20) {
                  fail('label.text: not twenty characters');
                }
                return [int(r['cell'], 'label.cell', 1, 255), name];
              })
            )
          }
        ];
      })
    ),
    random: ints(
      record(raw['random'], 'head.random')['words'],
      'head.random.words',
      512,
      0,
      65_535
    ),
    rows,
    strips,
    switchField: { off: switchRows('off'), on: switchRows('on') }
  };
};

export const openRow = (
  head: DionHead,
  slot: number | undefined
): DionOpenRow | undefined => head.rows.find(row => row.slot === slot);

export const documentItems = (
  head: DionHead,
  slot: number
): readonly DionDocumentItem[] => {
  const row = openRow(head, slot);
  return row?.mode === 2 ? (head.documents.get(row.index) ?? []) : [];
};

/// `$4D63C`'s gates. The OPINION POLE (92) and the first BALLOT PAPER (162) open only while
/// script flag 10 (bit 2 of `$7272`) is set and flag 9 (bit 1) clear. The NOVAGEN SAFE (102) waits on `$70F6` and
/// the AUTHORS COMPUTER (101) on the AUTHOR'S CHAIR (`$7124`); neither is reachable in the port
/// yet, so both stay shut.
export const dionHeadTable = (
  head: DionHead,
  flags: readonly boolean[]
): HeadTable => ({
  items: slot => documentItems(head, slot).length,
  kind: slot => {
    const row = openRow(head, slot);
    return row === undefined ? undefined : KINDS[row.mode];
  },
  opens: slot => {
    if (slot === 92 || slot === 162) {
      return flags[10] === true && flags[9] !== true;
    }
    return slot !== 101 && slot !== 102;
  }
});

/// `$59C2C`: the mode's art with the row's title strip, and a card's footer, stamped in. A strip
/// sets plane 0 and gives planes 1 to 3 its bit, so its ink is colour 15 on colour 1.
export const panelArt = (
  head: DionHead,
  row: DionOpenRow,
  switches = 0,
  field = true
): Uint8Array[] => {
  const art = (head.art.get(row.mode) ?? []).map(line => line.slice());
  for (const strip of head.strips.get(`${row.mode}:${row.index}`) ?? []) {
    strip.rows.forEach((bits, r) => {
      const line = art[strip.line + r];
      if (line !== undefined) {
        for (let x = 0; x < 64; x += 1) {
          line[x] = bits[x] === '1' ? 15 : 1;
        }
      }
    });
  }
  if (row.mode === 6 && field) {
    const on = (switches & (1 << (row.index >> 1))) !== 0;
    head.switchField[on ? 'on' : 'off'].forEach((bits, y) => {
      [...bits].forEach((bit, x) => {
        art[15 + y]![16 + x] =
          (art[15 + y]![16 + x]! & ~4) | (bit === '1' ? 4 : 0);
      });
    });
  }
  return art;
};
