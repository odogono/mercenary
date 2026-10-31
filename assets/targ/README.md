# Authored Targ assets

These files overlay the recovered Data Payload through the Geometry Asset loader.
Edit them with the [Blender add-on](../../tools/blender/README.md); their Sidecars
hold placements and their Change Ledgers record creative changes.

## Building prototypes

The G1 City Gate and D3 Tall Control concepts are placed provisionally outside the
city for review in normal Targ play. They are fixed objects, following the
[Shrine placement path](../../docs/adr/0084-place-authored-content-on-the-surface-and-react-to-it-through-surface-regions.md).

| Asset                                                | Surface Cell | Object slot | Geometry              |
| ---------------------------------------------------- | ------------ | ----------- | --------------------- |
| [Transit gate](objects/authored-transit-gate.json)   | (18,18)      | 65          | 60 vertices, 95 lines |
| [Landing depot](objects/authored-landing-depot.json) | (19,18)      | 66          | 44 vertices, 71 lines |

Both use white structural lines and restrained amber (`#d6a84b`) entrance marks.
There are no filled faces. The gate's central passage is 3072 game units wide at
ground level and 2816 high. The depot's hangar opening is 2304 wide and 1024 high;
its offset control tower, including the antenna, reaches 3584. Targ's default
walking eye height is 128 units.

Open the Shell Console with the backtick key and use `goto object 65` or
`goto object 66` to visit the respective origin, then move away to inspect the
building. These are visual prototypes: the doorway and hangar are linework,
without a Room, collision walls, landing behaviour, or a Talk Script. Permanent
locations and gameplay roles are undecided. Their current Sidecar placements
load in normal play; they are not gated behind a development setting.

From `web/`, open a model in Blender:

```sh
bun run blender ../assets/targ/objects/authored-transit-gate.json
bun run blender ../assets/targ/objects/authored-landing-depot.json
```

`e2e/authored-buildings.e2e.ts` loads the real assets and draws each from walking
height and from the air, with both presentation presets. It checks that white
and amber lines reach the renderer and records screenshots in `web/test-results/`:

```sh
PORT=5197 bun run test:e2e e2e/authored-buildings.e2e.ts
```
