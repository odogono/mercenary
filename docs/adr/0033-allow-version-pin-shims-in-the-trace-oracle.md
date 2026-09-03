# Allow version-pin shims in the Trace Oracle

The Trace Oracle remains the implementation frozen at `trace-oracle-last-good`, but a disposable worktree may change payload schema or decoder compatibility pins when regenerating Golden Traces for a newly versioned Data Payload. The exact shim must be recorded with the change; it may not alter simulation behaviour, trace record shapes, or the tag itself, and any broader edit requires a new decision rather than being called a compatibility shim.
