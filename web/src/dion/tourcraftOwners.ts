import { craftDivide, craftFloat, craftNegate } from '../craft/pass.ts';
import { subStellarLongitude } from '../craft/space.ts';
import { messageCharacter } from '../sound/stProgrammes.ts';
import { list, record } from './read.ts';
import type { DionSnapshot } from './session.ts';
import type { TourcraftContent } from './tourcraftContent.ts';
import type { TourcraftScriptState } from './tourcraftNarrative.ts';
import { numericCarries, type TourcraftState } from './tourcraftState.ts';
import { tourcraftView } from './tourcraftView.ts';

const word = (yes: boolean) => (yes ? 65_535 : 0);

/// Numeric carries supplement the semantic VM/playback/programme references.
/// Each update follows its owner: tick fields on VBL, sampled view on an atomic
/// frame. Inactive carries retain their previous bits.
export const updateTourcraftOwners = (
  content: TourcraftContent,
  s: DionSnapshot,
  previous: DionSnapshot,
  skyTail = false
): TourcraftState => {
  const e = s.tourcraft!;
  const f = e.flight;
  const old = e.owners;
  const n = s.narrative as TourcraftScriptState;
  const update = (group: string, values: Record<string, number>) => ({
    ...old[group],
    ...values
  });
  const source =
    ' '.repeat(Math.ceil(Math.max(0, 48 - n.message.text.length) / 2)) +
    n.message.text;
  const local =
    n.message.scrollsOut && n.message.age >= 200
      ? n.message.age - 200
      : n.message.age;
  const selected =
    n.message.busy && local >= 1 && local <= 36
      ? messageCharacter(source, local).charCodeAt(0)
      : n.message.busy
        ? old['message']!['selectedGlyph']!
        : 0;
  const sampled = s.frame !== previous.frame;
  const copiedRoll =
    f && f.mode !== 'foot'
      ? tourcraftView(
          list(
            record(content.support['rotationTable'], 'rotationTable')['words'],
            'rotationTable.words'
          ) as number[],
          f.craft,
          f.cabinOffset,
          f.mode === 'space'
        ).roll
      : 0;
  // Surface refresh is in the deferred tail AFTER the accepted wait boundary.
  // Foot/space refresh before waiting. The flight tuple serves the next pass;
  // these numeric caches preserve the original boundary's earlier samples.
  const cachedCraft =
    f?.mode === 'surface'
      ? (previous.tourcraft?.flight?.craft ?? f.craft)
      : f?.craft;
  const cachedView =
    f?.mode === 'surface'
      ? (previous.tourcraft?.owners['view'] ?? old['view']!)
      : { pitch: s.pitch, roll: copiedRoll, yaw: s.heading };
  const view = sampled
    ? update('view', {
        cabinOffset: f?.cabinOffset ?? 0,
        eyeX: s.eye[0],
        eyeY: s.eye[1],
        eyeZ: s.eye[2],
        pitch: s.pitch,
        roll: copiedRoll,
        yaw: s.heading
      })
    : { ...old['view']! };
  const craft = sampled
    ? update(
        'craft',
        f
          ? {
              altitudeMultiplier:
                f.mode === 'surface'
                  ? (craftNegate(craftFloat(-f.priorPose[1])) - 0x10_00_00) >>>
                    0
                  : old['craft']!['altitudeMultiplier']!,
              contact: f.craft.contact,
              cosPitch:
                content.arithmetic.sine[(cachedCraft!.pitch + 256) & 1023]!,
              cosRoll:
                content.arithmetic.sine[(cachedCraft!.roll + 256) & 1023]!,
              cosYaw: content.arithmetic.sine[(cachedCraft!.yaw + 256) & 1023]!,
              eyeHeight: f.craft.supported,
              landBits: f.body === 100 ? 65_535 : old['craft']!['landBits']!,
              occupancyWord: f.mode === 'foot' ? 63 : 0,
              panelSpeed: f.craft.panelSpeed >>> 0,
              parameterSlot:
                f.mode === 'space' ? 0 : f.mode === 'foot' ? 65_535 : 1,
              pitch: f.craft.pitch,
              pitchRate: f.space.pitchRate,
              priorX: f.priorPose[0],
              priorY: f.priorPose[1],
              priorZ: f.priorPose[2],
              roll: f.craft.roll,
              selector: f.mode === 'space' ? 2 : f.mode === 'foot' ? 1 : 0,
              sinPitch: content.arithmetic.sine[cachedCraft!.pitch & 1023]!,
              sinRoll: content.arithmetic.sine[cachedCraft!.roll & 1023]!,
              sinYaw: content.arithmetic.sine[cachedCraft!.yaw & 1023]!,
              speed: f.craft.speed,
              support: f.craft.supportLevel,
              swing: word(f.craft.swing),
              throttle: f.craft.throttle,
              turnRate: f.craft.turnRate,
              x: f.craft.x,
              y: f.craft.y,
              yaw: f.craft.yaw,
              z: f.craft.z
            }
          : {
              cosPitch: content.arithmetic.sine[(s.pitch + 256) & 1023]!,
              cosRoll: content.arithmetic.sine[256]!,
              cosYaw: content.arithmetic.sine[(s.heading + 256) & 1023]!,
              pitch: s.pitch,
              priorX: previous.eye[0],
              priorY: previous.eye[1],
              priorZ: previous.eye[2],
              roll: 0,
              sinPitch: content.arithmetic.sine[s.pitch & 1023]!,
              sinRoll: content.arithmetic.sine[0]!,
              sinYaw: content.arithmetic.sine[s.heading & 1023]!,
              x: s.eye[0],
              y: s.eye[1],
              yaw: s.heading,
              z: s.eye[2]
            }
      )
    : old['craft']!;
  let location = update('location', {
    bodyOffset: s.location,
    cell: s.cell,
    region: s.region,
    regionIndex: s.region
  });
  let sky = old['sky']!;
  if (sampled && f?.mode !== 'space') {
    // Taxi retains its original angular cache. Foot and numeric craft own the
    // surface refresh; Body phase contributes only its sampled high word.
    const longitude = s.taxi.passenger
      ? old['view']!['longitude']!
      : (s.eye[0] >>> 18) & 1023;
    const latitude = s.taxi.passenger
      ? old['view']!['latitude']!
      : ((s.eye[2] >>> 18) + 256) & 1023;
    Object.assign(view, { latitude, longitude });
    location = {
      ...location,
      group: s.location === 100 ? 23 : 3,
      surfaceBody: s.location
    };
  }
  if (skyTail && f?.mode !== 'space') {
    const body = content.system.bodies.find(b => b.offset === s.location)!;
    const latitude = old['view']!['latitude']!;
    location = {
      ...location,
      latitudeSample: latitude,
      longitudeSample:
        (old['view']!['longitude']! + (e.phases[s.location / 4]! >>> 16)) & 1023
    };
    const terminator = subStellarLongitude(content.arithmetic, {
      extent: body.encodedSize,
      turn: 0,
      x: body.centre[0],
      y: body.centre[1],
      z: body.centre[2]
    });
    const day =
      ((((terminator - location['longitudeSample']! + 256) & 512) + latitude) &
        512) !==
      0;
    sky = update('sky', {
      atmosphereDay: day && body.flags[3] !== 0 ? 32 : 0,
      bodyAtmosphere: body.flags[3]!,
      clipRows: !f || f.mode === 'foot' || f.craft.contact === 0 ? 136 : 68,
      dayBits: word(day),
      landColour: content.promotion.bodyPlacements
        .find(b => b.offset === body.offset)!
        .islands.find(i => i.group === (body.offset === 100 ? 23 : 3))!
        .landColour,
      skyColour: day ? body.skyDay : body.skyNight,
      skyDayColour: body.skyDay,
      skyNightColour: body.skyNight,
      substellarLongitude: terminator
    });
  } else if (skyTail && f?.mode === 'space') {
    sky = update('sky', { atmosphereDay: 0, clipRows: 136 });
  }
  if (sampled) {
    const worldBody = s.location === 100 ? 100 : 60;
    const home = content.promotion.bodyPlacements
      .find(b => b.offset === worldBody)
      ?.islands.find(i => i.group === (worldBody === 100 ? 23 : 3));
    // Relative world carry uses the active group's workspace origin. These are
    // retained independently of the physical and copied poses.
    const origin = home?.origin ?? [2527, 1066];
    Object.assign(view, {
      relativeX: (s.eye[0] - origin[0]! * 65_536) >>> 0,
      relativeY: s.eye[1] >>> 0,
      relativeZ: (s.eye[2] - origin[1]! * 65_536) >>> 0
    });
    const height = craftFloat(-s.eye[1]);
    Object.assign(view, {
      drawingHeight: height,
      packedHeight: craftFloat(-(f?.craft.y ?? s.eye[1])),
      pitchTangent: craftDivide(
        content.arithmetic,
        content.arithmetic.sine[cachedView['pitch']! & 1023]!,
        content.arithmetic.sine[(cachedView['pitch']! + 256) & 1023]!
      ),
      rollCotangent: craftDivide(
        content.arithmetic,
        content.arithmetic.sine[(cachedView['roll']! + 256) & 1023]!,
        content.arithmetic.sine[cachedView['roll']! & 1023]!
      ),
      rollTangent: craftDivide(
        content.arithmetic,
        content.arithmetic.sine[cachedView['roll']! & 1023]!,
        content.arithmetic.sine[(cachedView['roll']! + 256) & 1023]!
      )
    });
  }
  return {
    ...e,
    owners: numericCarries({
      ...old,
      animation: update('animation', {
        ...(sampled ? { sampledAngle: old['animation']!['tickAngle']! } : {})
      }),
      craft,
      location,
      message: update('message', { selectedGlyph: selected }),
      sky,
      view
    })
  };
};
