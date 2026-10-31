# The Atari ST opening's fall onto Targ

Measured 2026-10-31 for [#943](https://github.com/odogono/mercenary/issues/943), from the maintainer's screen recording of the Atari ST _Escape from Targ_ opening, captured under EmuTOS (832×530, 60 Hz, 3 min 27 s). The recording is not tracked; the numbers here were read off its frames with `ffmpeg`. It is presentation evidence for the Arrival ([ADR 0032](../adr/0032-play-an-authored-arrival-over-the-opening-script.md), [ADR 0086](../adr/0086-situate-targ-in-an-authored-system-under-gammas-rules.md)), not Game Semantics.

## Timeline

Times are seconds into the recording. Impact, when ALTITUDE first reads `00000`, is at 48.25.

| Time      | Before impact | Message                  | What is on screen                                                                           |
| --------- | ------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| 24        | 24            | `UNABLE TO CORRECT`      | Targ is a dot in the middle of the star field                                               |
| 28        | 20            | `MAXIMUM REVERSE THRUST` | a growing disc, ELEVATION `00`                                                              |
| 33        | 15.25         | `MAXIMUM REVERSE THRUST` | the disc, about 1.4 times the view's height, gives way to the ground; ELEVATION reads `270` |
| 33–37     | 15–11         | blank                    | a screen of plain green                                                                     |
| 36.75     | 11.5          | `CRASH IMMINENT!`        | the road plan appears as a dot in the middle                                                |
| 40        | 8.25          | `RETURNING TO - - -`     | a small square of roads, turning                                                            |
| 40.75     | 7.5           | `RETURNING TO - - -`     | every readout turns from asterisks to numbers on the same frame                             |
| 42        | 6.25          | `MANUAL CONTROL`         | a diamond of roads, turning                                                                 |
| 45        | 3.25          | `MANUAL CONTROL`         | the roads fill the screen                                                                   |
| 46.25     | 2             | `OUCH!`                  | large road lines                                                                            |
| 48        | 0.25          | `OUCH!`                  | the pad and the craft                                                                       |
| 48.25     | 0             |                          | ALTITUDE `00000`, the crash lamp lit                                                        |
| 48.5–49.5 |               |                          | black                                                                                       |
| 50        |               |                          | the ground view, and the status report follows                                              |

## The instruments

- **ALTITUDE** reads asterisks while the height needs more than five digits, and so does every other readout. They all turn to numbers on the same frame, at about 92,000.
- **SPEED** reads `+0000` all the way down. The ship is not flown: the fall is a scripted descent, like the crash tumble and the endgame ship's delivery.
- **ELEVATION** reads `00` in space, with the ship level and Targ ahead, and `270` from the moment the disc fills the view to impact, looking straight down.
- **COMPASS** reads `270` throughout. The road plan turns clockwise on screen at about 50–55° a second, so the turn is roll, not heading.

## The altimeter

Readings at quarter-second steps from 41.25: 92,127; 75,801; 66,522; 54,637; 47,882; 39,230; 34,313; 28,015; 24,435; 19,850; 17,865; 15,496; 13,906; 11,571; 10,338; 8,867; 7,879; 6,429; 5,663; 4,749; 4,136; 3,236; 2,611; 1,811; 1,357; 864; 604; 152; 0.

Far out each quarter second takes off about 15%, and near the ground the drop settles to a steady rate. `dh/dt = -(h/τ + c)` with τ = 1.7 s and c = 900 a second fits the whole run and covers it in 7.0 s, as the recording does. That is the shape of the decoded C64 endgame ship descent, `altitude -= (altitude >> 7) + 1` per frame (`research/c64-reference-build/c64lab/endgame.py`). In closed form the height `s` seconds before impact is `cτ(e^(s/τ) − 1)`.

## Against the port

- The port's opening script is slower between its lines than the original's: 17.4 s from `CRASH IMMINENT,` to the landing verdict at the default pacing, against 11.5 s to impact here. The Arrival stretches the curve over the port's tail rather than retiming the script.
- The original's verdict (`OUCH!`) starts 2 s before impact. The port keeps ADR 0032's rule that the verdict is the impact.
- Laid beside these frames, the port's road plan matches at a camera height of about 24 world units for each unit the altimeter reads, not the 256 the in-game panel divides by. The port's renderer culls the road plan with distance, so this is matched by eye frame against frame rather than derived.
