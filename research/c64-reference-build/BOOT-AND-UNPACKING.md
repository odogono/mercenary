# Boot, unpacking and interactive boundary

## Build identity

The supplied `MERCENARY.PRG` is 49,203 bytes including its two-byte load
address, loads at `$0801`, and occupies `$0801–$C831`. Its hashes are recorded
in `config/reference-build.json`. The BASIC stub executes `SYS 2080` (`$0820`)
and the payload identifies `COMPACKER V2.0`.

The accompanying transfer note selects “crack” and identifies the 1001 Crew
crack. Accordingly, all observations below describe the exact ABC/1001 artifact
and are provisional where cracking could have changed retail behavior.

## Verified transfer path

Dynamic monitor stops and physical-RAM inspection establish this path:

1. `$0820` copies the resident unpacker to `$0100–$01E8` and jumps to `$0100`.
2. The resident code changes the `$0001` memory configuration and decompresses
   the packed payload.
3. It restores `$0001`, calls BASIC ROM `$A871`, and reaches `$01E6`.
4. `$01E6` transfers to BASIC ROM `$A7AE`; this is the normalized post-unpack
   checkpoint, before that transfer executes.
5. The unpacked BASIC line executes `SYS 2065`; its stub at `$0811` switches
   the memory configuration and transfers into the unpacked runtime at `$B98B`.
6. Startup later enters a recurring renderer boundary at `$8477`. The stable
   interactive checkpoint is `$8477` conditioned on raw RAM `$007F == $3F`.

The condition matters because initialization reaches `$8477` before the live
world/HUD state exists. At the conditioned stop, the exit screenshot shows the
green wireframe display and `MANUAL CONTROL` HUD. The tracked evidence stores
only its hash and interpretation.

These addresses are navigation metadata, not an Independent Implementation.
No instruction bytes or reconstructed executable are tracked.
