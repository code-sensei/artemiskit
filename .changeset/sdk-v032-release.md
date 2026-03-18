---
"@artemiskit/sdk": patch
---

## SDK v0.3.2 - Guardian Enhancements & SDK Parity

### New Features
- **SDK Parity Methods**: Added `kit.validate()` for pre-flight scenario validation and `kit.compare()` for regression detection
- **Guardian Mode Normalization**: Canonical modes (observe/selective/strict) with deprecation warnings for legacy modes
- **Semantic Validation**: LLM-as-judge pattern for content validation with configurable thresholds
- **Programmatic Scenario Builders**: Type-safe fluent API for building scenarios programmatically
- **Type Contracts**: Strict type contracts for safe SDK usage

### Guardian Security Improvements
- Added `shouldBlockViolation` callback for mode-aware per-violation blocking decisions
- Hardened `parseResponse` to detect multiple JSON candidates as potential prompt injection
- Added `circuit_breaker` to GuardrailType for type safety
- Fixed streaming bypass security gap - streaming now throws instead of bypassing protections

### Bug Fixes
- Fixed case-insensitive pattern matching in guardrails
- Added `addedCases`/`removedCases` to comparison results
- Fixed lint warnings in semantic validator
