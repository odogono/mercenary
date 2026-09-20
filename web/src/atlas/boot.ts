import { assertBrowserDocument } from '../shell/documentPath.ts';

/// The Atlas document (#405).
///
/// Sessionless, like the Flyover (ADR 0042): it loads no Gameplay Session and holds no Saves.
/// This is the empty surface the Ranges are drawn into by the tasks that follow; it asserts
/// its own route so a mis-served document fails here rather than half-rendering.

assertBrowserDocument(window.location.pathname, 'atlas');

const title = document.getElementById('title')!;
const status = document.getElementById('status')!;

title.textContent = 'Gamma Atlas';
status.textContent =
  'The Gamma Atlas has no Ranges drawn yet. Recovered Bodies, coastlines, ' +
  'Settlements and structure footprints arrive here in turn.';
