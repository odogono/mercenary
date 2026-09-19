import { planErisFrame } from '../src/damocles/frame.ts';
import { damoclesPanelViewModel } from '../src/damocles/panel.ts';
import { damoclesTitle } from '../src/damocles/title.ts';
import { intent } from '../src/gameCore/index.ts';
import type { PayloadDocument } from '../src/shell/title.ts';

/// Walk the Damocles Gameplay Session for a long stretch synchronously, so the end-to-end
/// suite can see a cell change without waiting the minute and a half the derived walking
/// speed needs in real time.
const result = document.getElementById('result')!;
const requiredJson = async (pathname: string): Promise<PayloadDocument> => {
  const response = await fetch(pathname);
  if (!response.ok) {
    throw new Error(`${pathname} answered HTTP ${response.status}`);
  }
  const text = await response.text();
  return { text, value: JSON.parse(text) };
};

try {
  const content = await damoclesTitle.load(requiredJson);
  const session = damoclesTitle.create(content);
  const triangles = (): number =>
    planErisFrame(
      content.surface,
      session.snapshot.pose,
      content.doc,
      session.snapshot.structure,
      session.snapshot.residents
    ).triangleCount;
  const before = damoclesPanelViewModel(session.snapshot, content.doc);
  const trianglesBefore = triangles();
  // Face west (a quarter turn left of north) so the walk crosses into the western neighbour.
  const turn = session.snapshot.pose.heading + Math.PI / 2;
  session.intent = intent({ turn: -1 });
  session.advance(turn / content.doc.walk.turnRadiansPerSecond);
  session.intent = intent({ walk: 1 });
  for (let i = 0; i < 90 * 60; i += 1) {
    session.advance(1 / 60);
  }
  const after = damoclesPanelViewModel(session.snapshot, content.doc);
  result.textContent = JSON.stringify({
    after: after.locationLabel,
    before: before.locationLabel,
    elapsed: session.snapshot.elapsed,
    heading: session.snapshot.pose.heading,
    trianglesAfter: triangles(),
    trianglesBefore
  });
} catch (error) {
  result.textContent = `error: ${error instanceof Error ? error.message : String(error)}`;
}
