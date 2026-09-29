import { expect } from 'bun:test';

import type { DamoclesSaveSnapshot } from '../src/damocles/save.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';

/// EAGLE NINE S E boarded on ERIS, flown up and launched until the craft reaches space, then
/// restored from its own Save with `change` applied. Shared by the endgame tests that need a
/// player in space (#627, #628).
export const launchedIntoSpace = (
  content: DamoclesContent,
  change: (saved: DamoclesSaveSnapshot) => DamoclesSaveSnapshot
): DamoclesSession => {
  const EAGLE = 'object-slot-3';
  const first = new DamoclesSession(content);
  const at = first.snapshot.surface.placements.find(
    item => item.id === EAGLE
  )!.position;
  const key = content.catalogue.instances.find(item => item.id === EAGLE)!
    .boarding!.pairedInstance!;
  const saved = first.captureResume();
  // With no saved structure the restore binds whatever the new cell holds.
  const { structure: _, ...rest } = saved;
  const s = new DamoclesSession(content, {
    ...rest,
    carried: [key],
    pose: {
      ...saved.pose,
      position: {
        x: at.x + 150,
        y: at.y + content.doc.eye.heightUnits,
        z: at.z
      }
    },
    residence: [
      ...saved.residence,
      {
        instance: key,
        residence: { kind: 'carried' as const, placementClass: 4 }
      }
    ]
  } as unknown as DamoclesSaveSnapshot);
  expect(s.board()).toEqual({ kind: 'boarded' });
  const pass = content.doc.time.ticksPerPass / content.doc.time.vblHertz;
  s.throttleKey(0x05);
  for (let index = 0; index < 50; index += 1) {
    s.intent = { ...s.intent, pitch: index < 30 ? 0 : 1 };
    s.advance(pass);
  }
  s.intent = { ...s.intent, pitch: 0 };
  s.launchCraft();
  for (
    let index = 0;
    index < 400 && s.snapshot.craft?.space == null;
    index += 1
  ) {
    s.advance(pass);
  }
  expect(s.snapshot.craft?.space).not.toBeNull();
  return new DamoclesSession(content, change(s.captureResume()));
};
