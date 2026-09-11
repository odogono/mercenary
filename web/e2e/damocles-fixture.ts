import { damoclesPanelViewModel } from '../src/damocles/panel.ts';
import { damoclesTitle } from '../src/damocles/title.ts';
import { intent } from '../src/gameCore/index.ts';

/// Walk the Damocles Gameplay Session for a long stretch synchronously, so the end-to-end
/// suite can see a cell change without waiting the minute and a half the derived walking
/// speed needs in real time.
const result = document.getElementById('result')!;
const requiredJson = async (pathname: string): Promise<unknown> => {
  const response = await fetch(pathname);
  if (!response.ok) {
    throw new Error(`${pathname} answered HTTP ${response.status}`);
  }
  return await response.json();
};

try {
  const content = await damoclesTitle.load(requiredJson);
  const session = damoclesTitle.create(content);
  const before = damoclesPanelViewModel(session.snapshot, content.doc);
  // Face -X (heading a quarter turn) so the walk crosses into the western neighbour.
  const target = Math.PI / 2;
  const turn = session.snapshot.pose.heading - target;
  session.intent = intent({ turn: 1 });
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
    heading: session.snapshot.pose.heading
  });
} catch (error) {
  result.textContent = `error: ${error instanceof Error ? error.message : String(error)}`;
}
