import { frameRgba, planDionFrame } from '../src/dion/frame.ts';
import { drawDionPanel, panelRgba } from '../src/dion/panel.ts';
import {
  DionSession,
  dionFrameState,
  dionPanelView
} from '../src/dion/session.ts';
import { dionContent } from './dion-documents.ts';
import { boardOpeningTaxi, frames, press, until } from './dion-journey.ts';

/// Fixed journeys for #672's before/after preservation check, captured before extraction.
export const dionRenderCheckpoints = async function* () {
  const content = await dionContent();
  for (const spaceport of [false, true]) {
    const session = new DionSession(content);
    for (const name of [
      'opening',
      'reveal',
      'boarding',
      'selection',
      'travel',
      'turn',
      'arrival',
      'exit',
      'night'
    ]) {
      if (name === 'reveal') {
        press(session, 'activate');
        session.advance(16 / 50);
      } else if (name === 'boarding') {
        boardOpeningTaxi(session);
      } else if (name === 'selection') {
        press(session, 'plus');
        if (spaceport) {
          press(session, 'plus');
        }
      } else if (name === 'travel') {
        press(session, 'star');
        frames(session, 111);
      } else if (name === 'turn') {
        frames(session);
      } else if (name === 'arrival') {
        until(
          session,
          () =>
            session.snapshot.taxi.destination === 0 &&
            session.snapshot.taxi.counter === 2
        );
      } else if (name === 'exit') {
        press(session, 'leave');
      } else if (name === 'night') {
        until(session, () => !session.snapshot.day);
      }
      const planned = planDionFrame(
        content.world,
        dionFrameState(session.snapshot)
      );
      const rgba = new Uint8ClampedArray(320 * 200 * 4);
      frameRgba(planned, rgba);
      panelRgba(
        drawDionPanel(content.panel, dionPanelView(session.snapshot, content)),
        rgba.subarray(320 * 136 * 4)
      );
      yield {
        name: `${spaceport ? 'spaceport' : 'solicitor'}-${name}`,
        planned,
        rgba
      };
    }
  }
};
