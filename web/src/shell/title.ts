import type { Intent } from '../gameCore/index.ts';
import type { PanelViewModel } from './panel.ts';

/// What the Browser Shell needs from a Title (ADR 0041, ADR 0043).
///
/// Targ and Damocles are different games with different session shapes, so the shell does not
/// ask for one session type. It asks for the handful of things every Title's boot does: load
/// the Title's own Data Payload, create or restore a session, feed it Movement Intent and time,
/// turn a snapshot into a frame and a panel, and know where its Session Resume lives. Targ's
/// boot predates this seam and adopts it when convenient; Damocles implements it from the start.
export type TitleSlug = 'damocles' | 'targ';

export interface TitleStorageKeys {
  readonly resume: string;
}

export interface TitleSession<Snapshot, Resume = unknown> {
  /// Advance Game Semantics time by `seconds` under the current intent and return the
  /// snapshot that results.
  advance(seconds: number): Snapshot;
  /// The record a Session Resume stores, in the Title's own schema.
  captureResume(): Resume;
  intent: Intent;
  readonly snapshot: Snapshot;
}

export interface TitleRuntime<Snapshot, Content, Resume = unknown> {
  create(content: Content, restore?: Resume): TitleSession<Snapshot, Resume>;
  /// Fetch and validate the Title's Data Payload and authored documents. Called when the
  /// Title's Destination is committed, never at boot of another Title (ADR 0041).
  load(fetchJson: (pathname: string) => Promise<unknown>): Promise<Content>;
  panelViewModel(snapshot: Snapshot, content: Content): PanelViewModel;
  readonly slug: TitleSlug;
  readonly storage: TitleStorageKeys;
}

/// Where each Title keeps its Session Resume.
///
/// Targ's key predates the partition and is kept as it is, so nothing a player has in progress
/// is lost; Damocles takes a namespaced key from the start (ADR 0041).
export const titleStorageKeys = (slug: TitleSlug): TitleStorageKeys => ({
  resume:
    slug === 'targ'
      ? 'mercenary.browser-shell.session-resume.v1'
      : `mercenary.browser-shell.${slug}.session-resume.v1`
});
