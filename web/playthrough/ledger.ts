import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { SteeringError } from './steering.ts';

/// The Gap Ledger of one Playthrough Chapter: every step it ran, and for each one it could not
/// complete, the class a reviewer starts triage from.

/// Where a solution step comes from. The step table paraphrases; it never copies a solution's
/// text into the repository (the source is third-party and the repository is public).
export interface Citation {
  /// Where in it: a numbered step or a paragraph.
  readonly section: string;
  readonly solution: SolutionId;
}

export type SolutionId = 'stf14' | 'stf15' | 'stf20';

export const SOLUTIONS: Readonly<
  Record<SolutionId, { readonly title: string; readonly url: string }>
> = {
  stf14: {
    title: 'ST Format 14 (September 1990), p. 71, Leisure cheating: Damocles',
    url: 'https://www.atarimania.com/st/infos/hi_res/gamebusters-stf14_3.jpg'
  },
  stf15: {
    title: 'ST Format 15 (October 1990), p. 93, Neil Charley',
    url: 'https://www.atarimania.com/st/infos/hi_res/gamebusters-stf15_damocles.jpg'
  },
  stf20: {
    title: 'ST Format 20 (March 1991), p. 90, Tom O’Toole',
    url: 'https://www.atarimania.com/st/infos/hi_res/damocles_solution.jpg'
  }
};

/// Where a step aims, as a solution names it: a Body, an island by the area its workspace
/// publishes, the Cell Readout, and a Floor where the step needs one.
export interface Target {
  readonly body: string;
  readonly cell?: string;
  readonly floor?: number;
  readonly island?: string;
}

export interface SolutionStep {
  readonly cite: Citation;
  readonly id: string;
  /// What the step must leave observable for it to count as done.
  readonly proves: string;
  /// The step, in our own words.
  readonly says: string;
  readonly target?: Target;
}

/// A step the run could not complete starts as one of two classes: a harness gap when the
/// steering could not get there, an unconfirmed lead when the session refused what the step
/// asked. Triage refines a lead into a missing feature, a confirmed divergence or a solution
/// error after checking it against the Working Authority.
export type GapClass =
  | 'confirmed divergence'
  | 'harness gap'
  | 'missing feature'
  | 'solution error'
  | 'unconfirmed lead';

export interface Setup {
  readonly assumes: readonly string[];
  /// What the chapter's start assumed, and how it got there: a built Save, a console command.
  readonly how: string;
}

export interface StepRecord {
  readonly cite: Citation;
  readonly evidence: Evidence | null;
  readonly gap: { readonly class: GapClass; readonly detail: string } | null;
  readonly id: string;
  readonly outcome: 'failed' | 'not reached' | 'passed';
  readonly proves: string;
  readonly says: string;
  readonly target: Target | null;
}

export interface Evidence {
  readonly frame: Readonly<Record<string, string>>;
  readonly impactSeconds: number;
  readonly panel: Readonly<Record<string, string>>;
  readonly row: string;
  readonly screenshot: string;
  readonly sessionSeconds: number;
  readonly wallSeconds: number;
}

export interface ChapterLedger {
  readonly chapter: string;
  readonly pageErrors: readonly string[];
  readonly setup: Setup;
  readonly started: string;
  readonly steps: readonly StepRecord[];
  readonly title: string;
}

const capture = async (
  page: Page,
  startedAt: number
): Promise<Omit<Evidence, 'screenshot'>> => {
  const { frame, panel } = await page.evaluate(() => {
    const frame = { ...document.querySelector<HTMLElement>('#frame')!.dataset };
    const panel: Record<string, string> = {};
    for (const node of document.querySelectorAll<HTMLElement>(
      '#panel-damocles [data-field]'
    )) {
      panel[node.dataset['field']!] = (node.textContent ?? '').trim();
    }
    const inventory = document.querySelector(
      '#panel-damocles [data-panel-control=inventory]'
    );
    panel['inventory'] = (inventory?.textContent ?? '').trim();
    return { frame, panel };
  });
  const cleaned = Object.fromEntries(
    Object.entries(frame).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );
  return {
    frame: cleaned,
    impactSeconds: Number(cleaned['impactSeconds']),
    panel,
    row: cleaned['damoclesRow'] ?? '',
    sessionSeconds: Number(cleaned['elapsed']),
    wallSeconds: (Date.now() - startedAt) / 1000
  };
};

/// One chapter's run. `step` runs the steps in order; once one fails, the rest are recorded as
/// not reached, so one gap stops only its own chapter.
export class Chapter {
  readonly #records: StepRecord[] = [];
  readonly #errors: string[] = [];
  readonly #startedAt = Date.now();
  #stopped = false;

  constructor(
    readonly page: Page,
    readonly testInfo: TestInfo,
    readonly id: string,
    readonly title: string,
    readonly setup: Setup
  ) {
    page.on('pageerror', error => this.#errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') {
        this.#errors.push(message.text());
      }
    });
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  async step(
    definition: SolutionStep,
    play: () => Promise<void>,
    options: { readonly lead?: GapClass } = {}
  ): Promise<void> {
    const base = {
      cite: definition.cite,
      id: definition.id,
      proves: definition.proves,
      says: definition.says,
      target: definition.target ?? null
    };
    if (this.#stopped) {
      this.#records.push({
        ...base,
        evidence: null,
        gap: null,
        outcome: 'not reached'
      });
      return;
    }
    let gap: StepRecord['gap'] = null;
    try {
      await play();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      gap = {
        class:
          error instanceof SteeringError
            ? 'harness gap'
            : (options.lead ?? 'unconfirmed lead'),
        detail: detail.split('\n').slice(0, 6).join('\n')
      };
      this.#stopped = true;
    }
    const evidence = await this.#evidence(definition.id);
    this.#records.push({
      ...base,
      evidence,
      gap,
      outcome: gap === null ? 'passed' : 'failed'
    });
  }

  async #evidence(id: string): Promise<Evidence | null> {
    try {
      const state = await capture(this.page, this.#startedAt);
      const name = `${this.id}-${id}.png`;
      const body = await this.page.screenshot();
      await this.testInfo.attach(`step ${id}`, {
        body,
        contentType: 'image/png'
      });
      const directory = join(ledgerDirectory(), 'screens');
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, name), body);
      return { ...state, screenshot: `screens/${name}` };
    } catch {
      return null;
    }
  }

  async finish(): Promise<ChapterLedger> {
    const ledger: ChapterLedger = {
      chapter: this.id,
      pageErrors: this.#errors,
      setup: this.setup,
      started: new Date(this.#startedAt).toISOString(),
      steps: this.#records,
      title: this.title
    };
    await mkdir(ledgerDirectory(), { recursive: true });
    await writeFile(
      join(ledgerDirectory(), `${this.id}.json`),
      `${JSON.stringify(ledger, null, 2)}\n`
    );
    await this.testInfo.attach('gap ledger', {
      body: JSON.stringify(ledger, null, 2),
      contentType: 'application/json'
    });
    return ledger;
  }
}

/// Generated output, gitignored with the report: the reviewed note under `docs/research/` is
/// written from it by `tools/playthrough-ledger.ts`.
export const ledgerDirectory = (): string =>
  join(import.meta.dirname, '..', 'playthrough-results', 'ledger');
