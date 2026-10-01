import type { Intent } from '../gameCore/index.ts';
import type { PanelViewModel } from './panel.ts';

/// What the Browser Shell needs from a Title (ADR 0041, ADR 0043).
///
/// Targ and Damocles are different games with different session shapes, so the shell does not
/// ask for one session type. It asks for the handful of things every Title's boot does: load
/// the Title's own Data Payload, create or restore a session, feed it Movement Intent and time,
/// turn a snapshot into a frame and a panel, and know where its Session Resume lives. Targ's
/// boot predates this seam and adopts it when convenient; Damocles implements it from the start,
/// and Mercenary III's `/dion` likewise (#647).
export type TitleSlug = 'damocles' | 'dion' | 'targ';

export interface TitleStorageKeys {
  /// Web Lock name. Targ keeps the Resume key as the lock name so existing tabs still agree.
  readonly lock: string;
  readonly ownershipChannel: string;
  /// The player's settings for this Title, and its typeface (ADR 0063).
  readonly preferences: string;
  readonly resume: string;
  readonly save: (slot: 1 | 2 | 3) => string;
  readonly typeface: string;
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

/// One fetched document: the parsed value, and the exact text it was parsed from.
///
/// The text is kept so a Title can pin its authored documents by content rather than by a
/// declared version, which an edit can leave behind (#344).
export interface PayloadDocument {
  readonly text: string;
  readonly value: unknown;
}

/// Each Title draws its own panel, so the view model a Title hands its panel is its own: the
/// Benson and Damocles renditions share `PanelViewModel`, and Mercenary III's panel is drawn
/// from its recovered artwork instead.
export interface TitleRuntime<
  Snapshot,
  Content,
  Resume = unknown,
  Panel = PanelViewModel
> {
  create(content: Content, restore?: Resume): TitleSession<Snapshot, Resume>;
  /// Fetch and validate the Title's Data Payload and authored documents. Called when the
  /// Title's Destination is committed, never at boot of another Title (ADR 0041).
  load(fetch: (pathname: string) => Promise<PayloadDocument>): Promise<Content>;
  panelViewModel(snapshot: Snapshot, content: Content): Panel;
  readonly slug: TitleSlug;
  readonly storage: TitleStorageKeys;
}

/// Where each Title keeps its Session Resume.
///
/// Targ's key predates the partition and is kept as it is, so nothing a player has in progress
/// is lost; Damocles takes a namespaced key from the start (ADR 0041). Preferences and typeface
/// are namespaced for every Title, Targ's too (ADR 0063).
export const titleStorageKeys = (slug: TitleSlug): TitleStorageKeys => {
  const resume =
    slug === 'targ'
      ? 'mercenary.browser-shell.session-resume.v1'
      : `mercenary.browser-shell.${slug}.session-resume.v1`;
  return {
    lock: resume,
    ownershipChannel:
      slug === 'targ'
        ? 'mercenary.browser-shell.session-resume.ownership.v1'
        : `${resume}.ownership`,
    preferences: `mercenary.browser-shell.${slug}.preferences.v1`,
    resume,
    save: slot =>
      slug === 'targ'
        ? `mercenary.browser-shell.save.v1.slot-${slot}`
        : `mercenary.browser-shell.${slug}.save.v1.slot-${slot}`,
    typeface: `mercenary.browser-shell.${slug}.typeface.v1`
  };
};
