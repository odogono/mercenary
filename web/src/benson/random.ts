/// The shared SplitMix64 stream used by Targ's world and Talk Scripts.
export const DEFAULT_SESSION_SEED = 0x2c_69_2e_d8_1b_7f_0a_31n;
const MASK64 = (1n << 64n) - 1n;
const INCREMENT = 0x9e_37_79_b9_7f_4a_7c_15n;
const MUL1 = 0xbf_58_47_6d_1c_e4_e5_b9n;
const MUL2 = 0x94_d0_49_bb_13_31_11_ebn;

export const randomByte = (
  state: bigint
): { readonly byte: number; readonly state: bigint } => {
  const next = (state + INCREMENT) & MASK64;
  let z = next;
  z = ((z ^ (z >> 30n)) * MUL1) & MASK64;
  z = ((z ^ (z >> 27n)) * MUL2) & MASK64;
  return { byte: Number((z ^ (z >> 31n)) & 0xffn), state: next };
};
