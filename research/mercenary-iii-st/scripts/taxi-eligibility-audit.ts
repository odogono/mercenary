import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { IDLE } from "../../../web/src/gameCore/index.ts";
import type { DionScriptState } from "../../../web/src/dion/script.ts";
import type { DionSession } from "../../../web/src/dion/session.ts";
import { loadTourcraftContent } from "../../../web/src/dion/tourcraftContent.ts";
import type { DionControlOperation } from "../../../web/test/dion-controls.ts";
import { TaxiFaceModel } from "./taxi-face-model.ts";
import { TaxiHistoryModel } from "./taxi-history-model.ts";
import { readTaxiSourceCandidate } from "./taxi-source-eligibility.ts";
import { TAXI_SOURCE_REVISION, withTaxiSource } from "./taxi-source.ts";

type Operation =
  DionControlOperation | { kind: "steps"; seconds: number; count: number };
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const apply = (session: DionSession, op: Operation) => {
  if (op.kind === "advance") session.advance(op.seconds);
  else if (op.kind === "press") session.press(op.action);
  else if (op.kind === "intent") session.intent = op.intent;
  else for (let i = 0; i < op.count; i++) session.advance(op.seconds);
};

// These are independently executed witness histories, not an implementation of
// the universal inverse-reachability search in the report. No source restoration,
// time injection, storage writes or expanded owner constructor is used.
export const auditTaxiEligibility = async ({ includeLate = true } = {}) => {
  const expanded = await loadTourcraftContent(async (path) => {
    const text = readFileSync(
      join(import.meta.dir, "../../..", path.slice(1)),
      "utf8",
    );
    return { text, value: JSON.parse(text) };
  });
  assert.equal(
    expanded.contentSha256,
    "89bc7ab4ce73051b41e14d2da7605587cd8facc51b9abc9b203e2e5b23fcedbf",
  );
  return withTaxiSource(async (source) => {
    const controls = source.dionControlCaptures(source.content);
    const prefix = (name: string): Operation[] => {
      const control = controls.find((c) => c.name === name);
      assert.ok(control);
      return structuredClone(control.operations.slice(0, control.index));
    };
    const observe = () => {
      const session = new source.SourceSession(source.content);
      const vm = new TaxiHistoryModel(
        expanded.legacy,
        expanded.programmes,
        expanded.gameplay.initial,
      );
      const faces = new TaxiFaceModel(
        expanded.programmes,
        expanded.gameplay.initial,
      );
      const departures: number[] = [];
      const observed = session as unknown as {
        frame(): void;
        narrative: {
          tick(): void;
          frame(): void;
          start(id: number): boolean;
          idMessage(id: number): boolean;
          state: DionScriptState;
        };
      };
      const n = observed.narrative;
      const tick = n.tick.bind(n);
      n.tick = () => {
        vm.tick();
        tick();
      };
      const frame = observed.frame.bind(session);
      observed.frame = () => {
        vm.beforeInput(session.snapshot.clock.seconds);
        const taxi = session.snapshot.taxi;
        frame();
        if (taxi.counter === 2 && !taxi.start && session.snapshot.taxi.start)
          departures.push(session.snapshot.tick);
      };
      const opcode = n.frame.bind(n);
      n.frame = () => {
        vm.frame();
        faces.frame(vm.state.messageRemaining !== 0 && vm.state.flags[13]!);
        opcode();
      };
      const start = n.start.bind(n);
      n.start = (id) => {
        vm.start(id);
        return start(id);
      };
      const message = n.idMessage.bind(n);
      n.idMessage = (id) => {
        vm.idMessage(id);
        return message(id);
      };
      return { session, vm, faces, departures };
    };
    const definitions: { name: string; operations: Operation[] }[] = [
      { name: "fresh", operations: [] },
      {
        name: "fresh/pending-B",
        operations: [{ kind: "press", action: "board" }],
      },
      {
        name: "shell-step/partial",
        operations: [{ kind: "steps", seconds: 1 / 60, count: 31 }],
      },
      {
        name: "early/analog-walk",
        operations: [
          { kind: "intent", intent: { ...IDLE, walk: 0.375, turn: -0.25 } },
          { kind: "steps", seconds: 1 / 60, count: 100 },
        ],
      },
      {
        name: "early/selected-plus-partial",
        operations: [
          ...prefix("sol/selected"),
          { kind: "advance", seconds: 3 / 50 },
        ],
      },
      {
        name: "early/noStart-wait",
        operations: [
          ...prefix("sp/Start-pre"),
          { kind: "steps", seconds: 11 / 50, count: 4000 },
        ],
      },
      {
        name: "late/no-departure",
        operations: [{ kind: "steps", seconds: 1 / 50, count: 1_620_003 }],
      },
      {
        name: "late/seated-pending-Start",
        operations: [
          ...prefix("sp/Start-pre"),
          { kind: "steps", seconds: 11 / 50, count: 148_000 },
          { kind: "press", action: "star" },
        ],
      },
      {
        name: "late/second-threshold",
        operations: [{ kind: "steps", seconds: 11 / 50, count: 174_000 }],
      },
    ];
    // Re-call and re-board from the real first exit. Each condition is observed
    // without changing state, and the exact ordinary calls are retained as runs.
    for (const trips of includeLate ? [2, 3] : []) {
      const operations = prefix("sp/exit-post");
      const built = { session: new source.SourceSession(source.content) };
      operations.forEach((op) => apply(built.session, op));
      const emit = (op: Operation) => {
        operations.push(op);
        apply(built.session, op);
      };
      const until = (condition: () => boolean) => {
        let count = 0;
        while (!condition()) {
          assert.ok(count++ < 5000, "multi-trip recipe failed to finish");
          built.session.advance(11 / 50);
        }
        operations.push({ kind: "steps", seconds: 11 / 50, count });
      };
      emit({ kind: "steps", seconds: 11 / 50, count: 148_000 });
      for (let trip = 1; trip < trips; trip++) {
        emit({ kind: "press", action: "star" });
        emit({ kind: "advance", seconds: 11 / 50 });
        until(() => built.session.snapshot.taxi.counter === 2);
        emit({ kind: "press", action: "board" });
        emit({ kind: "advance", seconds: 11 / 50 });
        assert.ok(built.session.snapshot.taxi.passenger);
        emit({ kind: "press", action: "plus" });
        emit({ kind: "advance", seconds: 11 / 50 });
        emit({ kind: "press", action: "star" });
        emit({ kind: "advance", seconds: 11 / 50 });
        until(
          () =>
            built.session.snapshot.taxi.counter === 2 &&
            built.session.snapshot.taxi.destination === 0,
        );
        emit({ kind: "press", action: "leave" });
        emit({ kind: "advance", seconds: 11 / 50 });
        assert.equal(built.session.snapshot.taxi.passenger, false);
      }
      definitions.push({ name: `late/${trips}-trips`, operations });
    }
    const selected = includeLate ? definitions : definitions.slice(0, 6);
    const naturalSources = selected.map(({ name, operations }) => {
      const a = observe();
      const b = observe();
      for (const op of operations) {
        apply(a.session, op);
        apply(b.session, op);
      }
      a.session.drainSound();
      b.session.drainSound();
      const snapshot = a.session.captureResume();
      const encoded = source.codec.encodeDionRecord({
        identity: source.codec.dionRecordIdentity(source.content),
        savedAt: "2026-10-03T00:00:00Z",
        schemaVersion: 1,
        snapshot,
        where: name,
      });
      assert.deepEqual(
        readTaxiSourceCandidate(encoded, source).snapshot,
        snapshot,
      );
      assert.deepEqual(snapshot, b.session.captureResume());
      const faces = a.faces.capture();
      const departures = [...a.departures];
      const schedulerSha256 = sha(a.vm.state);
      for (let frame = 0; frame <= 600; frame++) {
        assert.deepEqual(a.vm.state, b.vm.state);
        assert.deepEqual(a.vm.requests, b.vm.requests);
        assert.deepEqual(a.faces.capture(), b.faces.capture());
        assert.deepEqual(a.session.captureResume(), b.session.captureResume());
        assert.deepEqual(a.session.drainSound(), b.session.drainSound());
        if (frame < 600) {
          a.session.advance(11 / 50);
          b.session.advance(11 / 50);
        }
      }
      return {
        name,
        operationRuns: operations.length,
        operationsSha256: sha(operations),
        sourceSnapshotSha256: sha(snapshot),
        tick: snapshot.snapshot.tick,
        early: snapshot.snapshot.frame < 147_271,
        pending: snapshot.snapshot.pending,
        remainder: snapshot.remainder,
        departures,
        faces,
        schedulerSha256,
        matchingFutureFrames: 600,
        limit:
          "Separate uninterrupted executions of the research VM/face models; no inverse search, full expanded owners, restore or browser comparison.",
      };
    });
    return {
      sourceRevision: TAXI_SOURCE_REVISION,
      expandedContentSha256: expanded.contentSha256,
      naturalSources,
    };
  });
};

if (import.meta.main)
  console.log(JSON.stringify(await auditTaxiEligibility(), null, 2));
