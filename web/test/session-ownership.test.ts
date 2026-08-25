import { describe, expect, test } from 'bun:test';

import {
  createSessionOwnership,
  type BrowserLock,
  type BrowserLockManager,
  type BrowserLockOptions
} from '../src/shell/ownership.ts';

interface Holder {
  readonly reject: (error: unknown) => void;
  readonly token: object;
}

class FakeLockManager implements BrowserLockManager {
  private holder: Holder | undefined;

  request(
    _name: string,
    options: BrowserLockOptions,
    callback: (lock: BrowserLock | null) => Promise<void>
  ): Promise<void> {
    if (options.ifAvailable === true && this.holder !== undefined) {
      return callback(null);
    }

    if (options.steal === true && this.holder !== undefined) {
      this.holder.reject(new DOMException('stolen', 'AbortError'));
      this.holder = undefined;
    }

    const token = {};
    return new Promise<void>((resolve, reject) => {
      this.holder = { reject, token };
      void callback({ name: 'mercenary-session', token })
        .then(() => {
          if (this.holder?.token === token) {
            this.holder = undefined;
          }
          resolve();
        })
        .catch(reject);
    });
  }
}

describe('Session Resume ownership', () => {
  test('claims an available exclusive lock without blocking startup', async () => {
    const ownership = createSessionOwnership({ locks: new FakeLockManager() });

    expect(await ownership.claim()).toEqual({ kind: 'owned' });
    expect(ownership.mayAdvance()).toBeTrue();
    expect(ownership.mayPersist()).toBeTrue();

    ownership.release();
    expect(ownership.mayAdvance()).toBeFalse();
    expect(ownership.mayPersist()).toBeFalse();
  });

  test('blocks a second page while leaving the owner active', async () => {
    const locks = new FakeLockManager();
    const first = createSessionOwnership({ locks });
    const second = createSessionOwnership({ locks });
    await first.claim();

    expect(await second.claim()).toEqual({ kind: 'blocked' });
    expect(first.mayAdvance()).toBeTrue();
    expect(second.mayAdvance()).toBeFalse();
    expect(second.mayPersist()).toBeFalse();

    first.release();
  });

  test('takeover demotes the previous owner before the new owner advances', async () => {
    const locks = new FakeLockManager();
    let losses = 0;
    const first = createSessionOwnership({
      locks,
      onLost: () => {
        losses += 1;
      }
    });
    const second = createSessionOwnership({ locks });
    await first.claim();
    await second.claim();

    expect(await second.takeOver()).toEqual({ kind: 'owned' });
    await Promise.resolve();

    expect(losses).toBe(1);
    expect(first.mayAdvance()).toBeFalse();
    expect(first.mayPersist()).toBeFalse();
    expect(second.mayAdvance()).toBeTrue();
    expect(second.mayPersist()).toBeTrue();

    second.release();
  });

  test('keeps play available but disables persistence without Web Locks', async () => {
    const ownership = createSessionOwnership({ locks: undefined });

    expect(await ownership.claim()).toEqual({ kind: 'unsupported' });
    expect(ownership.mayAdvance()).toBeTrue();
    expect(ownership.mayPersist()).toBeFalse();
    expect(await ownership.takeOver()).toEqual({ kind: 'unsupported' });
  });
});
