import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { int, list, record } from "../../../web/src/dion/read.ts";
import type { DionScriptState } from "../../../web/src/dion/script.ts";
import type { DionSession, DionSnapshot } from "../../../web/src/dion/session.ts";
import {
  loadTourcraftContent,
  type TourcraftContent,
} from "../../../web/src/dion/tourcraftContent.ts";
import type { DionControlOperation } from "../../../web/test/dion-controls.ts";
import { TaxiFaceModel, type TaxiFaceState } from "./taxi-face-model.ts";
import type { FaceSelection } from "./taxi-face-snapshot.ts";
import { TaxiHistoryModel } from "./taxi-history-model.ts";
import { TAXI_SOURCE_REVISION, withTaxiSource } from "./taxi-source.ts";

const LEGACY_PHASE_ALIGNMENT_TICKS = 13n;
const sha = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
const apply = (
  session: DionSession,
  operations: readonly DionControlOperation[],
) => {
  for (const op of operations) {
    if (op.kind === "advance") session.advance(op.seconds);
    else if (op.kind === "press") session.press(op.action);
    else session.intent = op.intent;
  }
  session.drainSound();
};

export interface CollisionFaceObservation {
  readonly snapshot: DionSnapshot;
  readonly faces: Record<"$A1" | "$A5", TaxiFaceState>;
  readonly faceSelection: FaceSelection;
}
export const auditTaxiEarlyInitialization = async (
  onCollisionFrame?: (
    frame: number,
    histories: readonly CollisionFaceObservation[],
    content: TourcraftContent,
  ) => void,
) => {
  const expanded = await loadTourcraftContent(async (path) => {
    const text = readFileSync(
      join(import.meta.dir, "../../..", path.slice(1)),
      "utf8",
    );
    return { text, value: JSON.parse(text) };
  });
  return withTaxiSource(
    async ({ SourceSession, content, codec, resume, dionControlCaptures }) => {
      assert.equal(
        expanded.contentSha256,
        "5a75345df63a88282ac08b9a679020b26a8053542fc268bd64c25798ef062a19",
      );
      const identity = codec.dionRecordIdentity(content);
      const controls = dionControlCaptures(content);
      assert.equal(controls.length, 33);
      const initial = record(expanded.gameplay.initial, "initial");
      const phases = list(initial["bodyPhases"], "phases").map((v) =>
        int(v, "phase"),
      );
      const bodies = list(
        record(expanded.system, "system")["bodies"],
        "bodies",
      );
      const rates = [
        ...bodies.map((b) => int(record(b, "body")["rate"], "rate")),
        0,
      ];
      assert.equal(phases.length, 32);
      assert.equal(rates.length, 32);
      const observe = () => {
        const session = new SourceSession(content);
        const acceptedIds: { id: number; tick: number }[] = [];
        const vm = new TaxiHistoryModel(
          expanded.legacy,
          expanded.programmes,
          expanded.gameplay.initial,
        );
        const faces = new TaxiFaceModel(
          expanded.programmes,
          expanded.gameplay.initial,
        );
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
        const bodyPhases = phases.map((phase, i) =>
          Number(
            (BigInt(phase) + LEGACY_PHASE_ALIGNMENT_TICKS * BigInt(rates[i]!)) &
              0xffff_ffffn,
          ),
        );
        const tick = n.tick.bind(n);
        n.tick = () => {
          vm.tick();
          for (let i = 0; i < bodyPhases.length; i++)
            bodyPhases[i] = (bodyPhases[i]! + rates[i]!) >>> 0;
          tick();
        };
        const frame = observed.frame.bind(session);
        observed.frame = () => {
          vm.beforeInput(session.snapshot.clock.seconds);
          frame();
        };
        const opcode = n.frame.bind(n);
        n.frame = () => {
          vm.frame();
          // The independently implemented R6 VM owns this selector. Original
          // face animation is after VM and before service/admission-created IDs.
          faces.frame(vm.state.messageRemaining !== 0 && vm.state.flags[13]!);
          opcode();
          assert.equal(vm.state.pc, n.state.pc);
          assert.equal(vm.state.flags[13], n.state.flags[13]);
          assert.equal(vm.state.messageRemaining !== 0, n.state.message.busy);
        };
        const start = n.start.bind(n);
        n.start = (id) => {
          vm.start(id);
          return start(id);
        };
        const message = n.idMessage.bind(n);
        n.idMessage = (id) => {
          vm.idMessage(id);
          const accepted = message(id);
          if (accepted) acceptedIds.push({ id, tick: session.snapshot.tick });
          return accepted;
        };
        return { session, faces, bodyPhases, acceptedIds };
      };
      const roundTrip = (session: DionSession) => {
        const snapshot = session.captureResume();
        const saveBytes = codec.encodeDionRecord({
          identity,
          savedAt: "2026-10-02T00:00:00.000Z",
          schemaVersion: 1,
          snapshot,
          where: resume.dionWhere(session),
        });
        const decoded = codec.decodeDionRecord(saveBytes, identity, content);
        const saved = new SourceSession(
          content,
          decoded.snapshot,
        ).captureResume();
        assert.deepEqual(saved, snapshot);
        const resumeBytes = resume.encodeDionResume(content, session);
        const loaded = resume.readDionResume(
          {
            getItem: () => resumeBytes,
            setItem: () => {
              throw new Error("Unexpected storage write");
            },
            removeItem: () => {
              throw new Error("Unexpected storage removal");
            },
          },
          content,
        );
        assert.equal(loaded.reason, null);
        assert.deepEqual(loaded.session.captureResume(), snapshot);
        return {
          snapshot,
          saveBytes,
          resumeRecord: { ...JSON.parse(resumeBytes), savedAt: null },
        };
      };
      const summaries = controls.map((control) => {
        const { session, faces, bodyPhases: replayedPhases } = observe();
        apply(session, control.operations.slice(0, control.index));
        assert.deepEqual(session.captureResume(), control.record);
        roundTrip(session);
        assert.equal(session.snapshot.clock.day, 0);
        assert.ok(session.snapshot.clock.seconds < 32_400);
        const bodyPhases = phases.map((phase, i) =>
          Number(
            (BigInt(phase) +
              (LEGACY_PHASE_ALIGNMENT_TICKS + BigInt(session.snapshot.tick)) *
                BigInt(rates[i]!)) &
              0xffff_ffffn,
          ),
        );
        assert.deepEqual(bodyPhases, replayedPhases);
        assert.equal(bodyPhases[15], session.snapshot.phase);
        return {
          name: control.name,
          tick: session.snapshot.tick,
          frame: session.snapshot.frame,
          saveRoundTrip: true,
          resumeRoundTrip: true,
          metisPhasePreserved: true,
          bodyPhaseComparisons: 32,
          alternateFrames: faces.alternateFrames,
          faces: faces.capture(),
        };
      });
      const control = controls.find((c) => c.name === "sol/selected");
      assert.ok(control);
      const prefix = control.operations.slice(0, control.index);
      const boardIndex = prefix
        .map((op) => (op.kind === "press" ? op.action : null))
        .lastIndexOf("board");
      assert.ok(boardIndex >= 0);
      const histories = [0, 1].map((delay) => {
        const { session, faces, acceptedIds } = observe();
        apply(session, prefix.slice(0, boardIndex));
        // Two ordinary stationary frames are common. Only the final successful
        // B differs: one additional idle frame precedes it in the second history.
        for (let i = 0; i < 2 + delay; i++) session.advance(11 / 50);
        session.press("board");
        session.advance(11 / 50);
        assert.equal(session.snapshot.taxi.passenger, true);
        for (let i = 0; i < 23 - delay; i++) session.advance(11 / 50);
        session.drainSound();
        const encoded = roundTrip(session);
        return {
          session,
          faces,
          encoded,
          captured: {
            delayFrames: delay,
            boardingTick: acceptedIds.find((request) => request.id === 0x28)!
              .tick,
            alternateFrames: faces.alternateFrames,
            lastAlternate: faces.lastAlternate,
            faces: faces.capture(),
          },
        };
      });
      const [early, later] = histories;
      assert.ok(early && later);
      assert.deepEqual(early.encoded.snapshot, later.encoded.snapshot);
      assert.equal(early.encoded.saveBytes, later.encoded.saveBytes);
      assert.deepEqual(early.encoded.resumeRecord, later.encoded.resumeRecord);
      assert.notDeepEqual(early.captured.faces, later.captured.faces);
      const snapshot = early.encoded.snapshot;
      assert.equal(snapshot.snapshot.tick - later.captured.boardingTick, 251);
      assert.equal(snapshot.snapshot.tick - early.captured.boardingTick, 262);
      // Read-only observation of uninterrupted references; preserve the old
      // evidence summary and source behavior when the hook is not supplied.
      const observeCollision = (frame: number) => {
        if (!onCollisionFrame) return;
        onCollisionFrame(
          frame,
          histories.map((h) => ({
            snapshot: structuredClone(h.session.snapshot),
            faces: h.faces.capture(),
            faceSelection: h.faces.faceSelection,
          })),
          expanded,
        );
      };
      observeCollision(0);
      for (const h of histories) h.session.advance(2 / 50);
      observeCollision(1);
      const afterNextFrameEqual = isDeepStrictEqual(
        early.faces.capture(),
        later.faces.capture(),
      );
      assert.equal(afterNextFrameEqual, true);
      assert.deepEqual(
        early.session.captureResume(),
        later.session.captureResume(),
      );
      for (let frame = 0; frame < 600; frame++) {
        for (const h of histories) h.session.advance(11 / 50);
        assert.deepEqual(early.faces.capture(), later.faces.capture());
        assert.deepEqual(
          early.session.captureResume(),
          later.session.captureResume(),
        );
        assert.deepEqual(
          early.session.drainSound(),
          later.session.drainSound(),
        );
        observeCollision(frame + 2);
      }
      return {
        sourceRevision: TAXI_SOURCE_REVISION,
        identity,
        expandedContentSha256: expanded.contentSha256,
        controls: summaries,
        collision: {
          prefixControl: control.name,
          prefixOperationCount: boardIndex,
          prefixOperationsSha256: sha(
            JSON.stringify(prefix.slice(0, boardIndex)),
          ),
          commonIdleFrames: 2,
          equalCompleteSource: true,
          equalSaveBytes: true,
          equalResumeExceptTimestamp: true,
          sourceSnapshotSha256: sha(JSON.stringify(snapshot)),
          saveBytesSha256: sha(early.encoded.saveBytes),
          source: {
            tick: snapshot.snapshot.tick,
            frame: snapshot.snapshot.frame,
            clock: snapshot.snapshot.clock,
            remainder: snapshot.remainder,
            messageAge: snapshot.snapshot.narrative.message.age,
            messageBusy: snapshot.snapshot.narrative.message.busy,
            messageSerial: snapshot.snapshot.narrative.message.serial,
          },
          histories: histories.map((h) => h.captured),
          afterNextFrameEqual,
          equalFutureFrames: 600,
        },
      };
    },
  );
};

if (import.meta.main)
  console.log(JSON.stringify(await auditTaxiEarlyInitialization(), null, 2));
