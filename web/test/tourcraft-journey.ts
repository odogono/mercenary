import type { DionAction } from '../src/dion/session.ts';
import type { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { IDLE } from '../src/gameCore/index.ts';
import type { DionControlOperation } from './dion-controls.ts';

/// The external witness is chosen only from the uninterrupted control. Restored
/// branches replay it verbatim, without observing/steering their own state.
export const continueTourcraft = (
  session: TourcraftSession,
  observe: (operation: DionControlOperation) => void = () => {}
): DionControlOperation[] => {
  const operations: DionControlOperation[] = [];
  const frame = () => {
    for (let tick = 0; tick < 11; tick++) {
      const operation = { kind: 'advance' as const, seconds: 1 / 50 };
      operations.push(operation);
      session.advance(1 / 50);
      session.drainSound();
      observe(operation);
    }
  };
  const press = (action: DionAction) => {
    operations.push({ action, kind: 'press' });
    session.press(action);
    observe({ action, kind: 'press' });
    frame();
  };
  const intent = (value: typeof IDLE) => {
    operations.push({ intent: value, kind: 'intent' });
    session.intent = value;
    observe({ intent: value, kind: 'intent' });
  };
  const until = (done: () => boolean, limit = 2000) => {
    for (let i = 0; i < limit && !done(); i++) {
      frame();
    }
    if (!done()) {
      throw new Error('Continuation exceeded its frame budget');
    }
  };
  if (!session.snapshot.taxi.passenger && session.snapshot.cell !== 2) {
    press('star');
    until(() => session.snapshot.taxi.counter === 2);
    press('board');
    until(() => session.snapshot.taxi.passenger);
  }
  if (session.snapshot.taxi.passenger && session.snapshot.cell !== 2) {
    while (session.snapshot.taxi.destination !== 2) {
      press('plus');
    }
    press('star');
    until(
      () =>
        session.snapshot.taxi.counter === 2 &&
        session.snapshot.taxi.destination === 0
    );
  }
  if (session.snapshot.taxi.passenger) {
    press('leave');
  }
  const resident = session.snapshot.tourcraft!.residents.find(
    r => r.slot === 13
  )!;
  until(() => {
    if (
      session.snapshot.candidate?.slot === 13 &&
      session.snapshot.candidate.exponent <= 9
    ) {
      return true;
    }
    const [x, , z] = session.snapshot.eye;
    const desired =
      (Math.atan2(resident.position[0] - x, resident.position[2] - z) * 1024) /
        (2 * Math.PI) -
      512;
    const difference =
      ((((desired - session.snapshot.heading + 1536) % 1024) + 1024) % 1024) -
      512;
    intent({
      ...IDLE,
      turn: Math.abs(difference) > 8 ? Math.sign(difference) : 0,
      walk: Math.abs(difference) <= 16 ? 1 : 0
    });
    return false;
  });
  intent(IDLE);
  press('board');
  until(() => session.snapshot.tourcraft!.flight !== null);
  until(() => session.snapshot.tourcraft!.flight!.mode === 'foot', 1200);
  until(() => session.snapshot.tourcraft!.encounter.request === 0, 1500);
  intent({ ...IDLE, walk: 1 });
  for (let i = 0; i < 30; i++) {
    frame();
  }
  intent(IDLE);
  for (let i = 0; i < 600; i++) {
    frame();
  }
  return operations;
};
