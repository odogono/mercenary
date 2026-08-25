export interface SessionResumeNotices {
  readonly couldNotResume: (reason: string) => void;
  readonly dismiss: () => void;
  readonly failed: (reason: string) => void;
  readonly menuOpened: () => void;
  readonly message: (
    gameMessage: string,
    occurrence?: object
  ) => {
    readonly source: 'game' | 'shell';
    readonly text: string;
  };
  readonly ownership: (text: string) => void;
  readonly ownershipUnavailable: () => void;
  readonly resumed: () => void;
}

export interface SessionResumeNoticeOptions {
  readonly time?: () => number;
}

interface Notice {
  readonly expires: number | undefined;
  readonly kind: 'failure' | 'ownership' | 'resumed';
  readonly text: string;
}

const RESUMED_MILLISECONDS = 2000;
const FAILURE_MILLISECONDS = 5000;

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
    menuOpened: showFailure,
    message: (gameMessage, occurrence) => {
      const began =
        occurrence !== undefined && occurrence !== previousOccurrence;
      if (occurrence !== undefined) {
        previousOccurrence = occurrence;
      }
      if (
        notice?.kind !== 'ownership' &&
        (began || (occurrence === undefined && gameMessage !== ''))
      ) {
        notice = undefined;
      }
      if (notice?.expires !== undefined && time() >= notice.expires) {
        notice = undefined;
      }
      return notice === undefined
        ? { source: 'game', text: gameMessage }
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
    }
  };
};
