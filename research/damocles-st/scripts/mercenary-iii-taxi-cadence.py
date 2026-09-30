#!/usr/bin/env python3
"""Calculate the two opening Mercenary III taxi journeys at a fixed frame cadence.

Research only (#642). This calculation is independently authored from the
documented rules in docs/research/mercenary-iii-taxi-cadence.md. It contains no
original program bytes, script text or RAM. The inputs are recovered facts:
route cells and their per-cell call counts, the ascent and descent lengths, the
trip scripts reduced to opcode kinds, wait lengths and message holds, and the
message machine's VBL timing. It does not load or read any original media.

Model (phase and order assumptions are in the report):

* A tick is one game VBL. Every tick runs the VBL rules: the message machine
  advances, and the script wait counter increments.
* A simulation frame runs every N ticks, after that tick's VBL rules, and is
  atomic. Within a frame the Start input is handled first, then one script
  opcode (none while the message bar is busy), then the service calls.
* The trip script starts in the Start frame. Its first opcode runs in the same
  frame.
* A message request marks the bar busy in the frame that makes it. The bar is
  idle again after VBL rules at request tick + hold + 1.
* The arrival message (WE'VE ARRIVED) is attempted in the frame whose service
  call reaches the destination. It is refused, and dropped, if the bar is busy.

Usage:
    python3 scripts/mercenary-iii-taxi-cadence.py [--cadence N ...] [--json]
"""

from __future__ import annotations

import argparse
import json
import sys

# --- Route -----------------------------------------------------------------

# Cells of the taxi route from the boarding point, with the per-cell call
# nibble (calls per frame = nibble + 1; nibble 0 = one call per frame, with a
# burst of up to 16 calls while the taxi is outside the passenger's cell).
ROUTE = [
    ((2, 6), 0), ((1, 6), 0), ((0, 6), 0), ((0, 5), 3), ((0, 4), 7),
    ((0, 3), 7), ((0, 2), 3), ((0, 1), 0), ((1, 1), 1), ((2, 1), 1),
    ((3, 1), 1), ((4, 1), 0), ((4, 0), 0), ((3, 0), 1), ((2, 0), 0),
    ((3, 0), 1),
]
DESTINATION = {'sol': 2, 'sp': 14}  # route index of DOOBERRY'S SOLICITORS / METIS SPACEPORT
CALLS_PER_SEGMENT = 64               # progress += $400 per call, a segment is $10000
CROSSING_CALL = 32                   # the call that leaves the current cell
BURST = 16                           # at most 16 calls per frame for nibble 0
ASCENT_CALLS = 14                    # 13 heights plus the terminator
DESCENT_FRAMES = 22                  # 20 heights, terminator, then dwell 2

# Boarding pose (R1): the high word of X/Z is the world cell; cell (0, 0) is
# X $09DF, Z $042A.
CELL0 = (0x09DF, 0x042A)
Y_ABOARD = 0x3F


def heading_for(dx: int, dz: int) -> int:
    """Route heading written when the taxi turns toward the next point."""
    if dx > 0:
        return 0x0300
    if dx < 0:
        return 0x0100
    return 0x0200 if dz > 0 else 0x0000


def ride_frames(route: str) -> dict:
    """Frames from Start to the destination-reached frame, and the endpoint.

    The Start frame only arms the ascent. The ascent runs one call per frame
    (the taxi is in the passenger's cell). Movement then consumes calls; the
    number of calls a frame makes is decided at the start of the frame by the
    cell the taxi is in.
    """
    dest = DESTINATION[route]
    frames = 1 + ASCENT_CALLS
    segment = 0      # index of the point the taxi is leaving
    call = 0         # calls made in this segment
    reached = None
    while reached is None:
        in_old_cell = call < CROSSING_CALL
        nibble = ROUTE[segment][1] if in_old_cell else ROUTE[segment + 1][1]
        frames += 1
        made = 0
        fixed = nibble + 1 if nibble else None
        while True:
            call += 1
            made += 1
            if call == CALLS_PER_SEGMENT:
                segment += 1
                call = 0
                if segment == dest:
                    reached = frames
                    break
            if fixed is not None:
                if made == fixed:
                    break
            else:
                # Nibble 0: keep calling while the taxi is outside the cell the
                # passenger occupied at the start of the frame.
                outside = in_old_cell and call >= CROSSING_CALL
                if not outside or made == BURST:
                    break
    (cx, cz), _ = ROUTE[dest]
    (nx, nz), _ = ROUTE[dest + 1]
    dx, dz = nx - cx, nz - cz
    # The point handler snaps the low words: the axis of the next motion to
    # $8000, the other axis to $7F80 (X) / $8080 (Z), except that a negative
    # next motion moves the other axis to $8080 (X) / $7F80 (Z).
    if dx:
        xlo, zlo = 0x8000, (0x7F80 if dx < 0 else 0x8080)
    else:
        xlo, zlo = (0x8080 if dz < 0 else 0x7F80), 0x8000
    endpoint = ((CELL0[0] + cx) << 16 | xlo, Y_ABOARD, (CELL0[1] + cz) << 16 | zlo)
    return {'frames': frames - 1, 'endpoint': endpoint, 'heading': heading_for(dx, dz)}


# --- Trip scripts ------------------------------------------------------------

# Opcode kinds. Every opcode takes one frame; a wait opcode repeats each frame
# until the wait counter reaches its value.
def op():
    return ('op',)


def hold(h):            # store the message hold used by the next request
    return ('hold', h)


def text():             # request a message with the current hold
    return ('text',)


def reset():
    return ('reset',)


def wait(n):
    return ('wait', n)


def wait_call(n):       # call; reset; wait n; return
    return [op(), reset(), wait(n), op()]


BLANK = [op(), op(), hold(50), text(), hold(200), op(), op()]   # call; clear flag; hold 50; blank; hold 200; set flag; return
CLOSE = [op(), op(), hold(50), text(), hold(200), op(), op(), op()]  # jump; ...; clear flag 6; return

SCRIPT = {
    'sol': [
        *wait_call(100), op(), text(), *BLANK, *wait_call(150), *wait_call(150),
        op(), text(), *CLOSE,
    ],
    'sp': [
        *wait_call(50), text(), *wait_call(100), op(), text(), op(), text(), *BLANK,
        *wait_call(150), text(), text(), op(), text(), *BLANK, *wait_call(150),
        *wait_call(150), op(), text(), *BLANK, text(), op(), text(), text(), *BLANK,
        op(), text(), *BLANK, *wait_call(150), *wait_call(100), text(), *BLANK, text(),
        op(), text(), *BLANK, text(), *BLANK, *wait_call(150), text(), op(), op(),
    ],
}
START_HOLD = 200        # hold word when Start is pressed (the idle script leaves 200)
ARRIVAL_SESSION = 251   # request to idle for an accepted ID message (R4)


def journey(route: str, n: int, frame_tick=None) -> dict:
    """Run one journey at N ticks per frame. Ticks and frames count from Start.

    frame_tick(f), if given, replaces f * N as the tick at which frame f's
    logic runs (after that tick's VBL rules). It models a phase that varies
    from frame to frame.
    """
    tick = frame_tick or (lambda f: f * n)
    ride = ride_frames(route)
    program = SCRIPT[route]
    pc = 0
    hold_word = START_HOLD
    idle_at = 0          # first tick whose frame sees an idle bar
    reset_tick = 0
    events = []
    arrival = None
    last = ride['frames'] + DESCENT_FRAMES
    f = 0
    while f <= last or pc < len(program):
        t = tick(f)
        busy = t < idle_at
        if not busy and pc < len(program):
            kind = program[pc]
            if kind[0] == 'wait':
                if t - reset_tick >= kind[1]:
                    pc += 1
            else:
                if kind[0] == 'reset':
                    reset_tick = t
                elif kind[0] == 'hold':
                    hold_word = kind[1]
                elif kind[0] == 'text':
                    idle_at = t + hold_word + 1
                    events.append({'frame': f, 'tick': t, 'event': 'blank' if hold_word == 50 else 'text',
                                   'hold': hold_word, 'idle': idle_at})
                pc += 1
        if f == ride['frames']:
            busy = t < idle_at
            arrival = {'frame': f, 'tick': t, 'accepted': not busy, 'bar_idle_at': idle_at,
                       'margin': (t - idle_at) if not busy else (idle_at - t)}
            events.append({'frame': f, 'tick': t, 'event': 'arrival ' + ('accepted' if not busy else 'refused')})
            if not busy:
                idle_at = t + ARRIVAL_SESSION
        f += 1
        if f > 100000:
            raise RuntimeError('script did not finish')
    events.sort(key=lambda e: (e['frame'], e['event'].startswith('arrival')))
    return {
        'route': route, 'cadence': n,
        'ride_frames': ride['frames'], 'ride_ticks': tick(ride['frames']) - tick(0),
        'descent_frames': DESCENT_FRAMES, 'dwell_frame': ride['frames'] + DESCENT_FRAMES,
        'endpoint': [f'${v:08X}' for v in ride['endpoint']], 'route_heading': f'${ride["heading"]:04X}',
        'arrival': arrival, 'events': events,
        'messages_after_arrival': sum(1 for e in events if e['frame'] > ride['frames'] and 'hold' in e),
    }


def jitter(route: str, n: int, spread: int, trials: int, seed: int = 642) -> dict:
    """Outcomes when each frame's logic runs 0..spread ticks after its boundary."""
    import random
    rng = random.Random(seed)
    seen = {}
    for _ in range(trials):
        phase = {}
        def frame_tick(f):
            if f not in phase:
                phase[f] = rng.randint(0, spread)
            return f * n + phase[f]
        a = journey(route, n, frame_tick)['arrival']['accepted']
        seen[a] = seen.get(a, 0) + 1
    return {'accepted': seen.get(True, 0), 'refused': seen.get(False, 0)}


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--cadence', type=int, nargs='*', default=[9, 11])
    p.add_argument('--json', action='store_true')
    p.add_argument('--events', action='store_true', help='print each event')
    p.add_argument('--jitter', type=int, default=0, metavar='TICKS',
                   help='also sample per-frame phase jitter of 0..TICKS')
    p.add_argument('--trials', type=int, default=2000)
    a = p.parse_args(argv)
    out = [journey(r, n) for n in a.cadence for r in ('sol', 'sp')]
    if a.json:
        print(json.dumps(out, indent=1))
        return 0
    for j in out:
        arr = j['arrival']
        print(f"N={j['cadence']:>2} {j['route']:>3}: ride {j['ride_frames']} frames = {j['ride_ticks']} ticks, "
              f"dwell at frame {j['dwell_frame']}, endpoint {' '.join(j['endpoint'])} heading {j['route_heading']}; "
              f"WE'VE ARRIVED {'accepted' if arr['accepted'] else 'refused'} "
              f"(tick {arr['tick']}, bar idle at {arr['bar_idle_at']}, margin {arr['margin']})")
        if a.jitter:
            print(f"    jitter 0..{a.jitter}: {jitter(j['route'], j['cadence'], a.jitter, a.trials)}")
        if a.events:
            for e in j['events']:
                print('   ', e)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
