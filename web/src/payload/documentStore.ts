/// Shared Catalogue transport machinery. Title-specific readers admit a complete record
/// before returning it: failures are forgotten, admitted values and requests are shared.
export class DocumentStore<T> {
  private readonly held = new Map<string, T>();
  private readonly requests = new Map<string, Promise<T>>();

  constructor(private readonly load: (id: string) => Promise<T>) {}

  get size(): number {
    return this.held.size;
  }

  protected hold(id: string, value: T): void {
    this.held.set(id, value);
  }

  peek(id: string | undefined): T | undefined {
    return id === undefined ? undefined : this.held.get(id);
  }

  get(id: string): Promise<T> {
    const held = this.held.get(id);
    if (held !== undefined) {
      return Promise.resolve(held);
    }
    const pending = this.requests.get(id);
    if (pending !== undefined) {
      return pending;
    }
    const request = this.load(id).then(value => {
      this.held.set(id, value);
      return value;
    });
    this.requests.set(id, request);
    request.then(
      () => this.requests.delete(id),
      () => this.requests.delete(id)
    );
    return request;
  }

  /// Keep network concurrency bounded and return failures in request order, while allowing
  /// other reads to finish. Chrome refuses thousands of simultaneous Catalogue fetches.
  async prefetch(ids: Iterable<string>): Promise<readonly Error[]> {
    const wanted = [...new Set(ids)].filter(id => !this.held.has(id));
    const outcomes: (Error | undefined)[] = Array.from({
      length: wanted.length
    });
    let next = 0;
    const worker = async () => {
      while (next < wanted.length) {
        const index = next++;
        try {
          await this.get(wanted[index]!);
        } catch (error) {
          outcomes[index] =
            error instanceof Error ? error : new Error(String(error));
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(32, wanted.length) }, worker)
    );
    return outcomes.filter(outcome => outcome !== undefined);
  }
}

export const atDocument = async <T>(
  path: string,
  read: () => T | Promise<T>
): Promise<T> => {
  try {
    return await read();
  } catch (error) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};
