/// The five elementary functions the engine is allowed to use, and the narrowing to binary32.
///
/// Engine code imports `sin`, `cos`, `tan`, `atan` and `pow` from here and never calls
/// `Math.sin` and its neighbours directly. That looks like ceremony around a one-line
/// delegation, and it is not: it is the one place the arithmetic under every Replay Gate can
/// be changed, and the reason it needs to exist is written down in ADR 0022 and worth
/// repeating here.
///
/// IEEE 754 pins the four arithmetic operations, `sqrt` and the conversion to binary32 to a
/// correctly rounded result. It says nothing whatever about the transcendental functions, so
/// neither a libm nor a JavaScript engine promises a particular last bit. A Replay Gate
/// compares values bit-for-bit, so a platform that changed one would present as a ported
/// module that had broken.
///
/// This delegates to the platform because of what measuring it showed. JavaScriptCore agrees
/// with the libm the Golden Traces were recorded against on **every one of 2,147 samples**,
/// while a hand-rolled double-double implementation — accurate to about 1e-32 and therefore
/// correctly rounded — disagreed with that libm on 279 of them by one or two units in the last
/// place. It was *more* accurate and *less* useful: Apple's libm is not correctly rounded, so
/// being right is not the same as reproducing it, and no principled implementation can match
/// a proprietary rounding error. The `math` Golden Trace therefore grades the platform rather
/// than a replacement for it, and it is a canary: if an update ever moves a last bit, that
/// gate goes red before any simulation is standing, and this module is where the answer goes.
export const sin = (x: number): number => Math.sin(x);
export const cos = (x: number): number => Math.cos(x);
export const tan = (x: number): number => Math.tan(x);
export const atan = (x: number): number => Math.atan(x);
export const pow = (x: number, y: number): number => Math.pow(x, y);

/// Narrow to binary32, at the boundaries the Swift implementation narrows at.
///
/// `ScreenLine` coordinates are `Float` in the kit, so a projection Golden Trace records
/// binary32 quantities written at full binary64 precision — a `Float` of `0.1` reads as
/// `0.10000000149011612`. A projection that carried double precision through to the screen
/// would not reproduce them. IEEE 754 does pin this conversion, so unlike the functions above
/// there is nothing to measure; the name is here so a call site says why it is narrowing.
export const toFloat32 = (x: number): number => Math.fround(x);
