import { frameRgba } from './frame.ts';
import { PANEL_TOP, drawDionPanel, panelRgba } from './panel.ts';
import type { TourcraftSession } from './tourcraftSession.ts';

/// Prepare the entire first view in candidate ownership. Publication/persistence
/// happens only after indexed world, panel, bitmap and description all succeed.
export const prepareTourcraftFrame = (session: TourcraftSession) => {
  const planned = session.planFrame();
  const rgba = new Uint8ClampedArray(320 * 200 * 4);
  frameRgba(planned, rgba);
  const panel = drawDionPanel(
    session.promoted.legacy.panel,
    session.panelView()
  );
  panelRgba(panel, rgba.subarray(PANEL_TOP * 320 * 4));
  return { panel, planned, rgba };
};
