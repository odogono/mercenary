import { expect, type Page } from '@playwright/test';

import type { Setup } from './ledger.ts';

/// A Playthrough Chapter's built start: a fresh session's own snapshot, edited to the state the
/// earlier chapters would have left, and restored through the browser's ordinary Session Resume.
/// Each edit is one of the chapter's stated assumptions, so the ledger can say what was given
/// rather than earned.

export const DAMOCLES_RESUME_KEY =
  'mercenary.browser-shell.damocles.session-resume.v1';

export interface BuiltStart {
  /// One line per assumption, for the ledger.
  readonly assumes: readonly string[];
  /// Where in that cell the player stands, on foot, in world units on the start's Body.
  readonly at: { readonly x: number; readonly z: number };
  /// Objects carried, head first.
  readonly carried: readonly string[];
  /// The workspace cell the player stands in, as `#frame[data-cell]` reads it.
  readonly cell: { readonly x: number; readonly z: number };
  /// Script flags set, as `$7BD8` bits (bit 0: the first offer accepted).
  readonly flags: number;
  /// Facing, as the published heading.
  readonly heading?: number;
  /// Objects left lying where a Drop at `at` would place them, in order, before the player is
  /// stood at the start's own `at`: what an earlier chapter dropped and this one comes back to.
  readonly placed?: readonly {
    readonly at: { readonly x: number; readonly z: number };
    readonly slot: number;
  }[];
  /// An arrival Pose to switch to first, for a start off ERIS; `cell` is then on its Body.
  readonly pose?: string;
  /// Location and pickup triggers already spent.
  readonly spentTriggers: readonly number[];
  /// The NOVA TRIGGER switch bits `$7872` already set.
  readonly switches?: number;
  /// The Save's place name. ERIS by default.
  readonly where?: string;
}

export const startFrom = async (
  page: Page,
  start: BuiltStart
): Promise<Setup> => {
  // A fresh browser context starts with empty storage, so this first load is a New Game.
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 60_000
  });
  const encoded = await page.evaluate(async start => {
    const { damoclesTitle } = await import('../src/damocles/title.ts');
    const { DamoclesSession } = await import('../src/damocles/session.ts');
    const {
      DAMOCLES_SAVE_SCHEMA_VERSION,
      damoclesSaveIdentity,
      decodeDamoclesSave,
      encodeDamoclesSave
    } = await import('../src/damocles/save.ts');
    const content = await damoclesTitle.load(async pathname => {
      const text = await (await fetch(pathname)).text();
      return { text, value: JSON.parse(text) };
    });
    // Moved by the session's own teleport first, so its bound structure is the one the cell
    // selects; the pose is then set within that cell.
    let session = new DamoclesSession(content);
    if (start.pose !== undefined) {
      // Off ERIS the Body's Models stream in after a switch, and the surface the switch builds
      // leaves out a structure whose Model has not landed. Loaded first, the teleport binds the
      // structure in the cell, as the restore that follows will.
      const body = content.poses.poses.find(
        item => item.id === start.pose
      )?.body;
      const errors = await content.models.prefetch(
        content.catalogue.instances
          .filter(instance => instance.location?.body === body)
          .map(instance => instance.model)
      );
      if (body === undefined || errors.length > 0) {
        throw new Error(
          `the start's Pose ${start.pose} did not load: ${errors[0]?.message ?? 'no such Pose'}`
        );
      }
      const switched = session.switchToPose(start.pose);
      if (switched.kind !== 'switched') {
        throw new Error(`the start's Pose ${start.pose}: ${switched.reason}`);
      }
    }
    session.teleportToCell(start.cell.x, start.cell.z);
    const standingAt = async (at: { x: number; z: number }) => {
      const saved = session.captureResume();
      const moved = {
        ...saved,
        pose: {
          ...saved.pose,
          position: { ...saved.pose.position, x: at.x, z: at.z }
        }
      };
      await DamoclesSession.prepare(content, moved);
      const next = new DamoclesSession(content, moved);
      // One frame binds the structure and region there, which decide where a Drop lands.
      next.advance(1 / 50);
      return next;
    };
    for (const item of start.placed ?? []) {
      session = await standingAt(item.at);
      const fetched = session.fetchObject(item.slot);
      if (fetched.kind !== 'fetched') {
        throw new Error(
          `the start could not place object-slot-${item.slot}: ${JSON.stringify(fetched)}`
        );
      }
    }
    const saved = session.captureResume();
    const carried = new Set(start.carried);
    const snapshot = {
      ...saved,
      carried: [...start.carried],
      pose: {
        ...saved.pose,
        heading: start.heading ?? saved.pose.heading,
        position: { ...saved.pose.position, x: start.at.x, z: start.at.z }
      },
      residence: [
        ...saved.residence.filter(item => !carried.has(item.instance)),
        ...start.carried.map(instance => ({
          instance,
          residence: { kind: 'carried' as const, placementClass: 4 }
        }))
      ],
      script: {
        ...saved.script,
        flags: saved.script.flags | start.flags,
        triggers: saved.script.triggers.map(trigger =>
          start.spentTriggers.includes(trigger.index)
            ? { ...trigger, armed: false }
            : trigger
        )
      },
      switches: (saved.switches ?? 0) | (start.switches ?? 0)
    };
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const encoded = encodeDamoclesSave({
      identity,
      savedAt: new Date().toISOString(),
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot,
      where: start.where ?? 'ERIS'
    });
    // Refused here, with the session's own reason, rather than silently on the reload, where a
    // refused record starts a New Game.
    const decoded = decodeDamoclesSave(encoded, identity, content).snapshot;
    await DamoclesSession.prepare(content, decoded);
    new DamoclesSession(content, decoded);
    return encoded;
  }, start);
  // One init script, so nothing else can run between clearing and seeding (Playwright does not
  // order several). It seeds once: the page's own Session Resume writes must stand after that.
  await page.addInitScript(
    ({ encoded, key }) => {
      if (sessionStorage.getItem('playthrough-start') === null) {
        sessionStorage.setItem('playthrough-start', '1');
        localStorage.clear();
        localStorage.setItem(key, encoded);
      }
    },
    { encoded, key: DAMOCLES_RESUME_KEY }
  );
  await page.reload();
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 60_000
  });
  // A refused record would boot a New Game that also reaches ready; the start must be where it
  // was built.
  const restored = await page.locator('#frame').evaluate(node => ({
    x: Number(node.dataset['x']),
    z: Number(node.dataset['z'])
  }));
  if (Math.hypot(restored.x - start.at.x, restored.z - start.at.z) > 50) {
    throw new Error(
      `the built start did not restore: the session stands at ${Math.round(restored.x)}, ${Math.round(restored.z)}`
    );
  }
  return {
    assumes: start.assumes,
    how: 'a built Session Resume record: a fresh session’s snapshot with the assumptions applied'
  };
};

/// The end of Chapter 1, built: on foot beside EAGLE NINE S E at the Moorby School of Flying
/// with its key. The caller adds where, beside the Eagle, to stand.
export const MOORBY_START = {
  assumes: [
    'on foot beside EAGLE NINE S E at the Moorby School of Flying (end of Chapter 1)',
    'KEY - EAGLE 9SE carried, its pickup trigger spent',
    'the first offer accepted (script flag bit 0) and the State Office triggers spent',
    'unlike a played Chapter 1: the impact clock and session time are a New Game’s, not about five minutes on; KEY- V.I.P. LIMO and the DAMOCLES FILE are not carried; the accepted reward is a fresh session’s, not the 20 million the haggle reaches'
  ],
  carried: ['object-slot-181'],
  cell: { x: 9, z: 9 },
  flags: 1,
  spentTriggers: [3, 4, 5]
} as const satisfies Omit<BuiltStart, 'at'>;

/// NIXON INTR COURT at Metis 05-06, and the spot in its back room where Chapter 2 leaves
/// Transporter slot 67: well away from the WASHBASIN, since a craft dropped with a selection in
/// range is refused (docs/research/damocles-carry-capacity.md).
export const NIXON = 'metis-surface-65';
export const NIXON_BACK_ROOM = { x: -400, z: 1300 } as const;

/// The end of Chapter 2, built: in NIXON INTR COURT's back room, carrying EAGLE NINE S E, the
/// ANTIGRAV and the Eagle's key, with NOVA TRIGGERs 2 and 4 on. The caller places Transporter
/// slot 67 in the back room and says where to stand.
export const NIXON_START = {
  assumes: [
    'on foot in NIXON INTR COURT’s back room at Metis 05-06, beside Transporter slot 67, which lies there (end of Chapter 2)',
    'EAGLE NINE S E, the ANTIGRAV and KEY - EAGLE 9SE carried',
    'NOVA TRIGGERs 2 and 4 switched on, each where it was found rather than where Chapter 2 dropped it',
    'the first offer accepted (script flag bit 0) and the State Office triggers spent',
    'unlike a played Chapter 2: the impact clock and session time are a New Game’s, not about thirty-five minutes on; no landing script has run'
  ],
  carried: ['object-slot-3', 'object-slot-157', 'object-slot-181'],
  cell: { x: 5, z: 6 },
  flags: 1,
  pose: 'metis-transporter',
  spentTriggers: [3, 4, 5],
  switches: 0x50,
  where: 'METIS'
} as const satisfies Omit<BuiltStart, 'at'>;
