# Damocles ST Working Authority laboratory

This directory is the reproducible Hatari harness for the Damocles Atari ST
Working Authority named in `docs/research/damocles-gap.md`. Results are
Working-Authority Evidence, not Authoritative Evidence.

## Quick start

```sh
brew bundle --file research/damocles-st/Brewfile
# Restricted Material lives under /roms (gitignored). In this worktree:
#   ln -sfn /Users/alex/work/mercenary/roms roms
research/damocles-st/lab doctor
research/damocles-st/lab reproduce
research/damocles-st/lab capture --checkpoint title-screen
research/damocles-st/lab observe --scenario research/damocles-st/scenarios/title-smoke.json
research/damocles-st/lab verify --run research/damocles-st/work/<run-id>
python3 -m unittest discover -s research/damocles-st/tests -v
```

Place the Working Authority STX at
`roms/atarist/damocles_-_mercenary_ii_novagen_software_(uk).stx` and the pinned
TOS image at `roms/atarist/tos/emutos206.img`. `doctor` fails if either hash
does not match `config/working-authority.json`.

## Failures and acceptance

Hard failure on a wrong STX, wrong TOS, missing Hatari, missed title-screen
checkpoint, or hash mismatch. Acceptance is two independent cold starts with
equal normalized title-code RAM, stable registers, and display; a self-verifying
manifest; and a bounded Space-key observation from that checkpoint.

See [`SPEC.md`](SPEC.md), [`BOOT-AND-UNPACKING.md`](BOOT-AND-UNPACKING.md), and
[`HATARI-RESEARCH.md`](HATARI-RESEARCH.md).
