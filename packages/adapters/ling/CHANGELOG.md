# Changelog

## 0.1.11

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.6.3

## 0.1.10

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.6.2

## 0.1.9

### Patch Changes

- Add native controlled workflow execution for milestone 0.6.1. CLI workflow run/preflight and SDK
  sessions share strict tool and permission enforcement, cumulative budgets, explicit tool-protocol
  preflight, measured-usage states, bounded events, cancellation, and truthful cleanup evidence.
  Run against detached simulated state or a disposable Docker filesystem with a fixed local image,
  no host mounts or network, and no arbitrary command tool. Save bounded execution metadata separately
  from explicitly requested sensitive state exports. Task verification remains unavailable until 0.6.2.

  OpenAI and Ling workflow transports forward abort signals, disable automatic retries, and distinguish
  missing or malformed token usage from explicitly measured zero. Preserve existing scenario APIs and
  offline workflow validation. Package versions remain independent of the milestone label.

- Updated dependencies
  - @artemiskit/core@0.6.1

## 0.1.8

### Patch Changes

- 2ca73a5: Introduce the 0.6.0 agent-workflow contract: strict versioned scenarios, twelve simulated tools,
  provider-neutral single-turn targets, CLI authoring and offline validation, and public SDK exports.
  Preserve OpenAI structured tool-call transcripts for continuation. Full workflow execution,
  cumulative budgets, sandbox environments, scoring and recovery remain later milestones.

  Publish Node-compatible library bundles and NodeNext-compatible TypeScript declarations, verified
  with fresh tarball consumers on Node 24 and Bun 1.3. The CLI and Docker MCP server retain Bun entry
  points. Package versions remain independent; the milestone release manifest records their mapping.

- Updated dependencies [2ca73a5]
  - @artemiskit/core@0.6.0

## 0.1.7

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.5.3

## 0.1.6

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.5.2

## 0.1.5

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.5.1

## 0.1.4

### Patch Changes

- Updated dependencies [b826698]
  - @artemiskit/core@0.5.0

## 0.1.3

### Patch Changes

- Updated dependencies [8716ca6]
  - @artemiskit/core@0.4.2

## 0.1.2

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.4.1

## 0.1.1

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.4.0

## 0.1.0

- Initial native Ling Studio adapter with chat generation, streaming, JSON output, thinking/search fields, and tool calls.
