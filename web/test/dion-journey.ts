import { DionSession, type DionAction } from '../src/dion/session.ts';
import { IDLE } from '../src/gameCore/index.ts';

/// Advances `count` frames' worth of ticks: eleven a frame, or four while the EAGLE is flown
/// (ADR 0058).
export const frames = (session: DionSession, count = 1): void => {
  for (let frame = 0; frame < count; frame += 1) {
    const flight = session.snapshot.tourcraft?.flight;
    const flown = flight?.pilot === 'eagle' && flight.mode !== 'foot';
    session.advance((flown ? 4 : 11) / 50);
  }
};
export const press = (session: DionSession, action: DionAction): void => {
  session.press(action);
  frames(session);
};
export const until = (
  session: DionSession,
  done: () => boolean,
  limit = 2000
): void => {
  for (let frame = 0; !done() && frame < limit; frame += 1) {
    frames(session);
  }
  if (!done()) {
    throw new Error('Journey condition was not reached');
  }
};
export const boardOpeningTaxi = (session: DionSession): void => {
  until(session, () => session.snapshot.reveal === 0);
  press(session, 'activate');
  session.advance(64 / 50);
  press(session, 'star');
  until(session, () => session.snapshot.taxi.counter === 2);
  until(
    session,
    () =>
      session.snapshot.doors.size > 0 &&
      [...session.snapshot.doors.values()].every(d => d.latch === 'open')
  );
  session.intent = { ...IDLE, walk: 1 };
  until(
    session,
    () => session.snapshot.eye[2] <= session.snapshot.taxi.position[2] - 500
  );
  session.intent = IDLE;
  press(session, 'board');
  if (!session.snapshot.taxi.passenger) {
    throw new Error(
      `Not admitted: ${JSON.stringify(session.snapshot.candidate)}`
    );
  }
  until(
    session,
    () =>
      !session.snapshot.narrative.flags[6] &&
      !session.snapshot.narrative.message.busy
  );
};
