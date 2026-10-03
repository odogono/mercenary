import { int, list, record } from "../../../web/src/dion/read.ts";
import type { FaceSelection } from "./taxi-face-snapshot.ts";

export interface TaxiFaceState {
  alternate: number;
  base: number;
  output: number;
}
const tokens = ["$A1", "$A5"] as const;
type Token = (typeof tokens)[number];

// Research-only independent application of the documented once-per-loop face
// writer. This is neither an expanded Gameplay Session nor a migration codec.
export class TaxiFaceModel {
  alternateFrames = 0;
  lastAlternate = false;
  private selection: FaceSelection = "initial";
  private readonly sequences: Record<
    Token,
    Record<"base" | "alternate", number[]>
  >;
  private readonly state: Record<Token, TaxiFaceState>;

  constructor(programmes: unknown, initial: unknown) {
    const faces = record(
      record(programmes, "programmes")["faceSequences"],
      "faces",
    );
    const seeds = record(record(initial, "initial")["faceTokens"], "seeds");
    this.sequences = Object.fromEntries(
      tokens.map((token) => {
        const face = record(faces[token], token);
        const sequence = (name: "base" | "alternate") => {
          const values = list(face[name], name).map((v) => int(v, name));
          if (
            values.length < 2 ||
            values.at(-1) !== 0 ||
            values.slice(0, -1).some((v) => v <= 0 || v > 255)
          ) {
            throw new Error("Unadmitted face sequence");
          }
          return values;
        };
        return [
          token,
          { base: sequence("base"), alternate: sequence("alternate") },
        ];
      }),
    ) as typeof this.sequences;
    this.state = Object.fromEntries(
      tokens.map((token) => {
        const seed = record(seeds[token], token);
        const state = {
          base: int(seed["baseCursor"], "base"),
          alternate: int(seed["alternateCursor"], "alternate"),
          output: int(seed["output"], "output"),
        };
        if (state.base !== 0 || state.alternate !== 0 || state.output !== 8192)
          throw new Error("Changed coherent face opening");
        return [token, state];
      }),
    ) as typeof this.state;
  }

  frame(alternate: boolean): void {
    this.lastAlternate = alternate;
    if (alternate) this.alternateFrames++;
    const selected = alternate ? "alternate" : "base";
    for (const token of tokens) {
      const state = this.state[token];
      const sequence = this.sequences[token][selected];
      const next = state[selected] + 1;
      state[selected] = sequence[next] === 0 ? 0 : next;
      state.output = sequence[state[selected]]! << 8;
    }
    this.selection = selected;
  }

  get faceSelection(): FaceSelection {
    return this.selection;
  }

  capture(): Record<Token, TaxiFaceState> {
    return structuredClone(this.state);
  }
}
