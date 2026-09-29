import type { BensonMessagePresentation } from '../benson/index.ts';

export interface SessionResumeNotices {
  readonly audioUnavailable: () => void;
  readonly couldNotResume: (reason: string) => void;
  readonly dismiss: () => void;
  readonly failed: (reason: string) => void;
  /// Name the web keys for the Head Commands, which the recovered message names by the ST
  /// keypad's (#595).
  readonly headCommandKeys: () => void;
  readonly menuOpened: () => void;
  readonly message: (message?: BensonMessagePresentation) => {
    readonly source: 'game' | 'shell';
    readonly text: string;
  };
  readonly ownership: (text: string) => void;
  readonly ownershipUnavailable: () => void;
  readonly resumed: () => void;
  readonly synchronize: (message?: BensonMessagePresentation) => void;
}

export interface SessionResumeNoticeOptions {
  readonly time?: () => number;
}

interface Notice {
  readonly expires: number | undefined;
  readonly kind: 'controls' | 'failure' | 'ownership' | 'resumed';
  readonly text: string;
}

const RESUMED_MILLISECONDS = 2000;
const FAILURE_MILLISECONDS = 5000;
/// As long as the DAMOCLES FILE's own two messages hold the line (trigger 6, 400 frames).
const CONTROLS_MILLISECONDS = 8000;

/// The web bindings for the ST keypad's Enter, `*`, `+` and `-`.
export const HEAD_COMMAND_KEYS_TEXT =
  'ENTER OPEN · P READ · . NEXT · , PREVIOUS';

/// Lend the Benson message line to recovery without letting shell status suppress play.
export const createSessionResumeNotices = (
  options: SessionResumeNoticeOptions = {}
): SessionResumeNotices => {
  const time = options.time ?? (() => performance.now());
  let failureText: string | undefined;
  let notice: Notice | undefined;
  let previousOccurrence: object | undefined;

  const showFailure = (): void => {
    if (failureText !== undefined) {
      notice = {
        expires: time() + FAILURE_MILLISECONDS,
        kind: 'failure',
        text: failureText
      };
    }
  };

  return {
    audioUnavailable: () => {
      failureText = 'AUDIO UNAVAILABLE — CONTINUING SILENTLY';
      showFailure();
    },
    couldNotResume: reason => {
      failureText = `COULD NOT RESUME — ${reason.toUpperCase()}`;
      showFailure();
    },
    dismiss: () => {
      failureText = undefined;
      notice = undefined;
    },
    failed: reason => {
      failureText = `SESSION RESUME UNAVAILABLE — ${reason.toUpperCase()}`;
      showFailure();
    },
    headCommandKeys: () => {
      notice = {
        expires: time() + CONTROLS_MILLISECONDS,
        kind: 'controls',
        text: HEAD_COMMAND_KEYS_TEXT
      };
    },
    menuOpened: showFailure,
    message: message => {
      const began =
        message !== undefined && message.occurrence !== previousOccurrence;
      previousOccurrence = message?.occurrence;
      // The keys notice explains the message that begins with it, so that message must not
      // clear it.
      if (
        notice?.kind !== 'ownership' &&
        notice?.kind !== 'controls' &&
        began
      ) {
        notice = undefined;
      }
      if (notice?.expires !== undefined && time() >= notice.expires) {
        notice = undefined;
      }
      return notice === undefined
        ? { source: 'game', text: message?.displayText ?? '' }
        : { source: 'shell', text: notice.text };
    },
    ownership: text => {
      notice = { expires: undefined, kind: 'ownership', text };
    },
    ownershipUnavailable: () => {
      failureText = 'SESSION RESUME OWNERSHIP UNAVAILABLE';
      showFailure();
    },
    resumed: () => {
      notice = {
        expires: time() + RESUMED_MILLISECONDS,
        kind: 'resumed',
        text: 'SESSION RESUMED'
      };
    },
    synchronize: message => {
      previousOccurrence = message?.occurrence;
    }
  };
};
