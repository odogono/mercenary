import type { Token } from '../../src/payload/documents.ts';

/// Where control goes when a conditional's branch is taken.
export interface BensonBranch {
  readonly kind: string;
  readonly target: number;
}

/// One instruction in the payload's flat list. Fields present depend on `op`.
export interface BensonInstruction {
  readonly a?: number;
  readonly b?: number;
  readonly base?: number;
  readonly branchOn?: boolean;
  readonly byte?: number;
  readonly craft?: number;
  readonly decimal?: number;
  readonly from?: number;
  readonly index?: number;
  readonly into?: number;
  readonly key?: string;
  readonly mask?: number;
  readonly mode?: string;
  readonly onTaken?: BensonBranch;
  readonly op: string;
  readonly register?: number;
  readonly slot?: number;
  readonly source?: string;
  readonly symbol?: string;
  readonly target?: number;
  readonly ticks?: number;
  readonly to?: number;
  readonly tokens?: readonly Token[];
  readonly value?: number;
}

export interface BensonScript {
  readonly entry: number;
  readonly id: number;
}

/// The Reference Build's game-logic programs, re-encoded by the export tool (ADR 0015).
export interface BensonDocument {
  readonly counts: Readonly<Record<string, number>>;
  /// Decimal registers play starts with, keyed by slot as JSON strings.
  readonly decimalSeeds: Readonly<Record<string, number>>;
  readonly framesPerTick: number;
  readonly instructions: readonly BensonInstruction[];
  readonly schemaVersion: number;
  readonly scripts: readonly BensonScript[];
}
