import { isDeepStrictEqual } from "node:util";

import type { DionContent } from "../../../web/src/dion/content.ts";
import type * as TaxiCodec from "../../../web/src/dion/save.ts";

const refuse = (path: string, reason: string): never => {
  throw new Error(`${path}: ${reason}`);
};

// Compare the complete parsed JSON with the archived reader's projection. Object
// key order is immaterial; array order and every producer-owned field are not.
const checkProjection = (
  raw: unknown,
  decoded: unknown,
  path: string,
): void => {
  if (Array.isArray(raw) && Array.isArray(decoded)) {
    if (raw.length !== decoded.length)
      refuse(path, "reader changed array length");
    raw.forEach((value, i) =>
      checkProjection(value, decoded[i], `${path}[${i}]`),
    );
    return;
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    typeof decoded === "object" &&
    decoded !== null
  ) {
    const r = raw as Record<string, unknown>;
    const d = decoded as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      const child = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(d, key))
        refuse(child, "extra property projected away by the archived reader");
      checkProjection(r[key], d[key], child);
    }
    for (const key of Object.keys(d)) {
      if (!Object.hasOwn(r, key))
        refuse(
          path ? `${path}.${key}` : key,
          "missing producer-owned property",
        );
    }
    return;
  }
  if (typeof raw === "number" && Object.is(raw, -0))
    refuse(path, "historical JSON writer cannot emit negative zero");
  if (raw !== decoded) refuse(path, "reader changed the source value");
};

// NECESSARY checks only. A successful result is a candidate for the documented
// source-reachability and early-exactness predicate, never production admission.
// Caller must obtain the archived codec/content via withTaxiSource.
export const readTaxiSourceCandidate = (
  encoded: string,
  source: { readonly content: DionContent; readonly codec: typeof TaxiCodec },
): TaxiCodec.DionSaveRecord => {
  let raw: unknown;
  try {
    raw = JSON.parse(encoded);
  } catch {
    return refuse("$", "not JSON");
  }
  const expected = source.codec.dionRecordIdentity(source.content);
  if (
    expected.contentSha256 !==
      "c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed" ||
    expected.programSha256 !==
      "4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c"
  ) {
    refuse(
      "identity",
      "research requires the exact archived I2 content and program",
    );
  }
  let record: TaxiCodec.DionSaveRecord;
  try {
    record = source.codec.decodeDionRecord(encoded, expected, source.content);
  } catch (error) {
    return refuse("$", error instanceof Error ? error.message : String(error));
  }
  checkProjection(raw, record, "");
  const saved = record.snapshot.snapshot;
  const available = saved.narrative.available;
  if (new Set(available).size !== available.length) {
    refuse(
      "snapshot.snapshot.narrative.available",
      "duplicate availability ID",
    );
  }
  if (
    record.snapshot.remainder > 0 &&
    record.snapshot.remainder + 1e-12 >= 1 / 50
  ) {
    refuse(
      "snapshot.remainder",
      "ordinary advance drains the 1e-12 tick tolerance; schema 2 is half-open",
    );
  }
  const opening = source.content.world.opening;
  if (
    available.some(
      (id, i) =>
        ![0x33, 0x34].includes(id) || (i > 0 && id <= available[i - 1]!),
    )
  ) {
    refuse(
      "snapshot.snapshot.narrative.available",
      "must retain the original subsequence of unconsumed I2 entries",
    );
  }
  for (const field of [
    "cash",
    "gauges",
    "location",
    "pitch",
    "position",
  ] as const) {
    if (!isDeepStrictEqual(saved[field], opening[field])) {
      refuse(
        `snapshot.snapshot.${field}`,
        "ordinary I2 input does not write this opening owner",
      );
    }
  }
  for (const field of ["queued", "timed", "cabin"] as const) {
    const expectedValue = field === "cabin" ? 0 : null;
    if (saved.narrative[field] !== expectedValue) {
      refuse(
        `snapshot.snapshot.narrative.${field}`,
        "no admitted writer retains this value at an I2 capture boundary",
      );
    }
  }
  const clock = opening.clock;
  const tick = BigInt(saved.tick);
  const consumed = tick * BigInt(clock.step);
  const initial = BigInt(clock.accumulator);
  const refill = BigInt(clock.refill);
  const elapsed = consumed < initial ? 0n : (consumed - initial) / refill + 1n;
  const absolute = BigInt(clock.seconds) + elapsed;
  const checks = {
    accumulator: Number(initial - consumed + elapsed * refill),
    day: Number((BigInt(clock.day) + absolute / 86_400n) & 0xffffn),
    seconds: Number(absolute % 86_400n),
  };
  for (const key of ["accumulator", "day", "seconds"] as const) {
    if (saved.clock[key] !== checks[key]) {
      refuse(
        `snapshot.snapshot.clock.${key}`,
        "disagrees with New Game and the saved tick history",
      );
    }
  }
  const phase = Number(
    (BigInt(source.content.world.sky.phase) +
      tick * BigInt(source.content.world.sky.rate)) &
      0xffff_ffffn,
  );
  if (saved.phase !== phase)
    refuse("snapshot.snapshot.phase", "disagrees with the saved tick history");
  const sky = source.content.world.sky;
  const framePhase = Number(
    (BigInt(sky.phase) + BigInt(saved.frame) * 11n * BigInt(sky.rate)) &
      0xffff_ffffn,
  );
  const longitude = (sky.stepX + (framePhase >>> 16)) & 1023;
  const day =
    ((((sky.sunAngle - longitude + 256) & 512) + sky.latitude) & 512) !== 0;
  if (saved.day !== day)
    refuse(
      "snapshot.snapshot.day",
      "disagrees with the last atomic frame daylight sample",
    );
  const frameCounter = Number(
    (BigInt(opening.frameCounter) + BigInt(saved.frame)) & 0xffffn,
  );
  if (saved.frameCounter !== frameCounter)
    refuse(
      "snapshot.snapshot.frameCounter",
      "disagrees with the saved frame history",
    );
  return record;
};
