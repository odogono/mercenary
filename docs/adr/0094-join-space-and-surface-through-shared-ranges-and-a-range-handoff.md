# Join space and surface through shared Ranges and a Range Handoff

Accepted, 2026-11-14, for [#187](https://github.com/odogono/mercenary/issues/187). Amends [ADR 0086](0086-situate-targ-in-an-authored-system-under-gammas-rules.md) and extends the Flyover's Ranges from [ADR 0042](0042-fly-a-system-without-play.md) to Enhanced play.

Every Title cuts between space and a surface. Damocles and Dion cut inside one pass, at the recovered take-off height and landing range, and Targ's Arrival cuts from its disc field to the surface frame at an authored switch height. In play a Body is only ever a sky disc. Only the Flyover draws a Body as a sphere. The maintainer wants all three Titles to pass from space to a surface the same way, and without the cut.

## Decision

- **Three Ranges for every view of a Body.** Orbital, Coastal and Surface, chosen from normalized altitude `h/r` against thresholds the Body's presentation document authors and validates. Targ's are `1`, `0.10` and `0.05`. The Pose is never rebased at a boundary. Longitude, latitude, signed altitude and the tangent frame are views of it, in the Body's own equatorial frame, turning with Body Rotation.
- **One Range Handoff.** A pure function gives the Range and complementary smoothstep weights for a Pose and a Body. Each Title's surface frame is drawn over its Globe, weighted so the two always sum to one. The surface frame carries its own sky, so the Targ Star Sphere replaces the Flyover Backdrop only within the handoff.
- **One Globe.** The Flyover's sphere becomes a shared pass that draws a Body with its Islands, for the Flyover and Enhanced play alike. Each Title keeps its own surface renderer.
- **Islands carry patches; nothing maps a whole surface.** Targ's and Damocles' surfaces wrap on two independent axes and cannot be laid onto a sphere one to one. An Island lays one window of the surface onto the Globe through its patch transform. On Targ the transform is equirectangular with true scale at City Island's latitude, so the Globe and the surface frame agree where the city is. It extends beyond City Island to place every Island and give the readout's surface X/Z, distorts away from that latitude, and, because Targ's axes wrap independently, is not one-to-one on the far side of Targ.
- **City Island stands where the game's sky does.** It is centred at 34°N, the latitude the game's Targ sky is drawn from, on a prime meridian defined through it, so the Flyover's surface sky matches play at the same clock.
- **A sessionless surface seam.** Targ's Enhanced scene is built from a Pose, immutable world geometry and explicit options. The Game Surface passes these from its Session Snapshot, and the Flyover passes them without one; no Session Snapshot is fabricated. Authentic presentation is unchanged.
- **In play the handoff is presentation only.** It lays an Enhanced-only Pose and blend over the recovered take-off and landing, the way the Arrival lays its Pose over an idle session. The moments of the cut, Session State, Saves, Authentic pixels and Golden Traces do not change.
- **The Flyover comes first.** #187 builds the Range Handoff, the Globe and the surface seam for the Targ Flyover. Damocles, Dion and the Targ Arrival adopt them under a separate parent issue, which also chooses their Islands.

## Considered Options

- **A cut at an authored switch height everywhere, as the Arrival does.** Rejected: it is the abrupt change this decision exists to remove.
- **Move the play cut itself, flying the craft continuously to the surface.** Rejected: the take-off height, landing range and landing point are recovered Game Semantics, and the change would reach Saves and Golden Traces.
- **One global sphere mapping for each surface.** Rejected: neither Targ's nor Damocles' wrapping axes support it, and an Island makes no such claim.
- **A local tangent plane re-projected under the camera each frame.** Rejected: it is more exact near the poles but needs a second geometry for the patch, and the Flyover is an inspection tool.
- **Keep City Island at 0°/0°.** Rejected: the Flyover's surface sky would disagree with the game's sky at the same clock.

## Consequences

- ADR 0086's single meeting point between System units and Surface Cells becomes two, both authored and presentation only.
- Play gains a Globe under Enhanced. ADR 0089's two kinds of sky disc are untouched; the Globe replaces neither, and each Title chooses when its sky disc gives way to it.
- The Targ Arrival's disc field becomes a candidate for the Globe and the Range Handoff. It stays outside Session State, as ADR 0032 requires.
- Content outside the 16×16 city, such as ADR 0084's Shrine, is not drawn in the Flyover until its land is decided.
