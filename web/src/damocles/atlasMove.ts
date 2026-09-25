import {
  createSessionOwnership,
  type BrowserLockManager
} from '../shell/ownership.ts';
import { readDamoclesResume, writeDamoclesResume } from './resume.ts';
import { damoclesSaveIdentity } from './save.ts';
import { DamoclesSession, type AtlasDestination } from './session.ts';
import { damoclesTitle } from './title.ts';

/// A short, exclusive transaction over paused play. No renderer or simulation loop is started.
export const movePausedPlayer = async (target: AtlasDestination) => {
  const ownership = createSessionOwnership({
    locks: navigator.locks as unknown as BrowserLockManager | undefined,
    name: damoclesTitle.storage.lock
  });
  try {
    if ((await ownership.claim()).kind !== 'owned') {
      throw new Error(
        'The game is open elsewhere or session ownership is unavailable.'
      );
    }
    const storage = window.localStorage;
    const content = await damoclesTitle.load(async pathname => {
      const response = await fetch(pathname);
      if (!response.ok) {
        throw new Error(`${pathname} answered HTTP ${response.status}`);
      }
      const text = await response.text();
      return { text, value: JSON.parse(text) };
    });
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const resume = readDamoclesResume(
      storage,
      identity,
      {
        catalogue: content.catalogue,
        poses: content.poses,
        strings: content.strings
      },
      { preserveInvalid: true }
    );
    if (resume.kind !== 'restored') {
      throw new Error(
        'Open a valid game before moving its player in the Atlas.'
      );
    }
    await DamoclesSession.prepare(content, resume.snapshot);
    await DamoclesSession.prepareAtlasTravel(content, target);
    const candidate = new DamoclesSession(content, resume.snapshot);
    const outcome = candidate.travelToAtlas(target);
    if (outcome.kind === 'declined') {
      throw new Error(outcome.reason);
    }
    if (!ownership.mayPersist()) {
      throw new Error('Session ownership changed. Try again.');
    }
    writeDamoclesResume(storage, identity, candidate);
    const { pose, surface } = candidate.snapshot;
    return {
      heading: pose.heading,
      x: pose.position.x / surface.grid.cellUnits,
      z: pose.position.z / surface.grid.cellUnits
    };
  } finally {
    ownership.release();
  }
};
