import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

/// Finding the two things a Replay Gate needs, neither of which is in Git.
///
/// The Data Payload and the Golden Traces are both derived from the Reference Build and both
/// gitignored (ADR 0019). They live at the repository root, which is found by walking up from
/// this file exactly as `PayloadLocator` and `TraceScenarioLocator` walk up from the working
/// directory — same rule, because two discovery rules for files sitting beside each other
/// would be a trap.
///
/// A missing artifact **throws**. It does not skip. A module without a passing replay is not
/// ported, and a gate that quietly passes when its evidence is absent is worse than no gate:
/// it reports the one thing that cannot be true.

const MARKER = "trace-scenarios.json"

const findRepositoryRoot = (): string => {
  let directory = import.meta.dir
  for (;;) {
    if (existsSync(join(directory, MARKER))) return directory
    const parent = dirname(directory)
    if (parent === directory) {
      throw new Error(
        `no ${MARKER} found above ${import.meta.dir}, so the repository root is unknown`,
      )
    }
    directory = parent
  }
}

export const repositoryRoot = findRepositoryRoot()

/// The payload directory, honouring the same override the Swift side reads.
export const payloadDirectory = (): string => {
  const override = process.env["MERCENARY_PAYLOAD"]
  if (override !== undefined && override !== "") return resolve(override)
  return join(repositoryRoot, "payload")
}

export const tracesDirectory = (): string => join(repositoryRoot, "traces")

const EMIT_HINT =
  "emit it with: cd app && swift run mercenary --emit-traces\n" +
  "(Golden Traces are derived from the Data Payload and are never tracked — ADR 0019)"

/// One Golden Trace's bytes, or a failure that says what to run.
export const readTraceText = async (emitter: string, id: string): Promise<string> => {
  const path = join(tracesDirectory(), emitter, `${id}.jsonl`)
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new Error(`no Golden Trace at ${path}\n${EMIT_HINT}`)
  }
  return await file.text()
}

/// One payload document's bytes, or a failure that says what to run.
export const readPayloadFile = async (name: string): Promise<string> => {
  const path = join(payloadDirectory(), name)
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new Error(
      `no ${name} in ${payloadDirectory()}\n` +
        "export it with: cd lab && ... payload export  (the Data Payload is never tracked)",
    )
  }
  return await file.text()
}
