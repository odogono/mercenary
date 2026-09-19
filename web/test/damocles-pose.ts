import {
  parseDamoclesArrivalPoses,
  type ArrivalPoses
} from '../src/damocles/poses.ts';

/// Eris's Catalogue Body id, for the Poses these suites build by hand.
///
/// A Pose names its Body from #344 onward, and every test Pose stands on Eris because Eris is
/// the only Body with playable content today. Naming it once keeps the id out of the assertions.
export const ERIS_BODY = 'body-11';

/// The tracked arrival Poses, parsed once for the suites that build `DamoclesContent` by hand.
///
/// They are runtime content from #347: they decide which Bodies are switchable and which a Save
/// may name, so a session cannot be constructed without them.
export const arrivalPoses = async (): Promise<ArrivalPoses> =>
  parseDamoclesArrivalPoses(
    await Bun.file('../payload/damocles/arrival-poses.json').json()
  );
