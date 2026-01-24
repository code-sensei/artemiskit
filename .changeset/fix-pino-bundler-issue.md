---
"@artemiskit/core": patch
"@artemiskit/cli": patch
---

### Fixed

- Replaced `pino` logger with `consola` to fix Bun bundler compatibility issues. Some users experienced `ModuleNotFound: thread-stream/lib/worker.js` errors during installation due to pino's dynamic worker thread resolution that Bun's bundler cannot statically analyze.

### Changed

- Logger implementation now uses `consola` internally. The public `Logger` class API remains unchanged - no code changes required for consumers.

### Removed

- Removed `pino` and `pino-pretty` dependencies from `@artemiskit/core`.
