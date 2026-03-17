---
"@artemiskit/sdk": patch
---

Add comprehensive programmatic types and exports for SDK consumers

### New Features

- **Fluent Builder Pattern**: Added `ScenarioBuilder` and `TestCaseBuilder` classes for programmatic scenario construction with a fluent API
  - Factory functions: `scenario()`, `testCase()`
  - Quick helpers: `containsCase`, `exactCase`, `regexCase`, `jsonCase`, `gradedCase`
  - Expectation helpers: `exact`, `contains`, `notContains`, `regex`, `fuzzy`, `jsonSchema`, `llmGrade`, `similarity`, `inline`, `allOf`, `anyOf`

- **Contract Types for Custom Implementations**: Added typed contracts for building custom integrations
  - `AdapterContract` for custom model adapters
  - `EvaluatorContract` for custom evaluators
  - `StorageContract` for custom storage backends
  - `ArtemisKitPlugin` interface for plugin system
  - Factory functions: `defineAdapter()`, `defineEvaluator()`, `defineStorage()`, `definePlugin()`

- **Utility Types and Helpers**: Added utility types and runtime helpers
  - Type aliases: `ProviderName`, `ExpectationType`, `AnyResult`
  - Type extraction: `ExtractRunCases`, `ExtractRedTeamCases`, `ExtractStressResults`, `ExtractManifest`
  - Partial types: `DeepPartial`, `PartialScenario`, `RequireFields`, `OptionalFields`
  - Type guards: `isRunResult`, `isRedTeamResult`, `isStressResult`
  - Result helpers: `getFailedCases`, `getPassedCases`, `getCasesByTag`, `calculateSuccessRate`
  - Assertion helpers: `assertDefined`, `assert`

- **Types-Only Export**: Added `@artemiskit/sdk/types` sub-export for consumers who only need type definitions

### New Sub-Exports

- `@artemiskit/sdk/builders` - Scenario and test case builders
- `@artemiskit/sdk/contracts` - Contract types and factory functions
- `@artemiskit/sdk/utils` - Utility types and helper functions
- `@artemiskit/sdk/types` - Types-only export (no runtime code)
