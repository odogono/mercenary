/// Whether this platform's Math is the one the Golden Traces recorded.
///
/// The port delegates `sin`, `cos`, `tan`, `atan` and `pow` to the platform
/// (ADR 0022), and Bun's come from the operating system's libm. The Oracle
/// recorded Apple's, which other libms can disagree with in the last bit, so a
/// test that asserts those bits only holds on macOS.
export const onRecordingLibm = process.platform === 'darwin';
