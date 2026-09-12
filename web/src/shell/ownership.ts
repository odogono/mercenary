export interface BrowserLock {
  readonly name: string;
  readonly token?: object;
}

export interface BrowserLockOptions {
  readonly ifAvailable?: boolean;
  readonly mode?: 'exclusive';
  readonly steal?: boolean;
}

export interface BrowserLockManager {
  request(
    name: string,
    options: BrowserLockOptions,
    callback: (lock: BrowserLock | null) => Promise<void>
  ): Promise<void>;
}

export type OwnershipOutcome = {
  readonly kind: 'blocked' | 'owned' | 'unsupported';
};

export interface SessionOwnership {
  readonly claim: () => Promise<OwnershipOutcome>;
  readonly mayAdvance: () => boolean;
  readonly mayPersist: () => boolean;
  readonly release: () => void;
  readonly takeOver: () => Promise<OwnershipOutcome>;
}

export interface SessionOwnershipOptions {
  readonly locks: BrowserLockManager | undefined;
  readonly name?: string;
  readonly onLost?: () => void;
}

type OwnershipState = 'blocked' | 'new' | 'owned' | 'released' | 'unsupported';

export const SESSION_RESUME_LOCK_NAME =
  'mercenary.browser-shell.session-resume.v1';

/// Hold the browser-wide authority for advancing and persisting one Gameplay Session.
///
/// A Web Lock lives for as long as its callback's promise. The request promise is deliberately
/// left pending after `claim` returns; stealing rejects it, which is the old page's authoritative
/// signal to demote itself even if a faster cross-page notification never arrives.
export const createSessionOwnership = (
  options: SessionOwnershipOptions
): SessionOwnership => {
  let state: OwnershipState = 'new';
  let releaseHold: (() => void) | undefined;
  let voluntaryRelease = false;

  const request = (
    lockOptions: BrowserLockOptions
  ): Promise<OwnershipOutcome> => {
    if (options.locks === undefined) {
      state = 'unsupported';
      return Promise.resolve({ kind: 'unsupported' });
    }

    let resolveGrant!: (outcome: OwnershipOutcome) => void;
    let grantSettled = false;
    const granted = new Promise<OwnershipOutcome>(resolve => {
      resolveGrant = outcome => {
        grantSettled = true;
        resolve(outcome);
      };
    });

    voluntaryRelease = false;
    const requestPromise = options.locks.request(
      options.name ?? SESSION_RESUME_LOCK_NAME,
      { mode: 'exclusive', ...lockOptions },
      async lock => {
        if (lock === null) {
          state = 'blocked';
          resolveGrant({ kind: 'blocked' });
          return;
        }

        state = 'owned';
        resolveGrant({ kind: 'owned' });
        await new Promise<void>(resolve => {
          releaseHold = resolve;
        });
        releaseHold = undefined;
      }
    );

    void requestPromise.catch(() => {
      const wasOwner = state === 'owned';
      state = 'blocked';
      releaseHold?.();
      if (!grantSettled) {
        resolveGrant({ kind: 'blocked' });
      }
      if (wasOwner && !voluntaryRelease) {
        options.onLost?.();
      }
    });
    return granted;
  };

  return {
    claim: () => request({ ifAvailable: true }),
    mayAdvance: () => state === 'owned' || state === 'unsupported',
    mayPersist: () => state === 'owned',
    release: () => {
      if (state !== 'owned') {
        return;
      }
      voluntaryRelease = true;
      state = 'released';
      releaseHold?.();
    },
    takeOver: () => request({ steal: true })
  };
};

export type OwnershipMessage =
  | { readonly kind: 'takeover-ready'; readonly request: string }
  | { readonly kind: 'takeover-request'; readonly request: string };

export interface SessionTakeoverChannel {
  readonly close: () => void;
  readonly requestCooperativeTakeover: () => Promise<boolean>;
}

/// Cross-tab yield: the owner flushes Resume, then the requester claims or steals.
export const installSessionTakeoverChannel = (options: {
  readonly mayPersist: () => boolean;
  readonly name: string;
  readonly onYield: () => void;
}): SessionTakeoverChannel => {
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(options.name);
  channel?.addEventListener('message', event => {
    const value = event.data as Partial<OwnershipMessage> | undefined;
    if (
      value?.kind !== 'takeover-request' ||
      typeof value.request !== 'string' ||
      !options.mayPersist()
    ) {
      return;
    }
    options.onYield();
    channel.postMessage({
      kind: 'takeover-ready',
      request: value.request
    } satisfies OwnershipMessage);
  });
  return {
    close: () => {
      channel?.close();
    },
    requestCooperativeTakeover: async () => {
      if (channel === undefined) {
        return false;
      }
      const request = crypto.randomUUID();
      return await new Promise<boolean>(resolve => {
        let settled = false;
        const finish = (ready: boolean): void => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeout);
          channel.removeEventListener('message', receive);
          resolve(ready);
        };
        const receive = (event: MessageEvent): void => {
          const value = event.data as Partial<OwnershipMessage> | undefined;
          if (value?.kind === 'takeover-ready' && value.request === request) {
            finish(true);
          }
        };
        const timeout = setTimeout(() => finish(false), 1000);
        channel.addEventListener('message', receive);
        channel.postMessage({
          kind: 'takeover-request',
          request
        } satisfies OwnershipMessage);
      });
    }
  };
};
