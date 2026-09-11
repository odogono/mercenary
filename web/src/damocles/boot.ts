import { assertBrowserDocument } from '../shell/documentPath.ts';

/// The Damocles Gameplay Session's document (ADR 0043).
///
/// A stub until the session lands: it claims the document and says so, and nothing of Targ's
/// boot is imported, so `/damocles` already loads none of Targ's payload.
const status = document.getElementById('status')!;
const failure = document.getElementById('failure')!;

try {
  assertBrowserDocument(location.pathname, 'damocles');
  document.documentElement.dataset['title'] = 'damocles';
  status.textContent = 'DAMOCLES — the Gameplay Session is not yet built.';
} catch (error) {
  status.hidden = true;
  failure.hidden = false;
  failure.textContent = error instanceof Error ? error.message : String(error);
}
