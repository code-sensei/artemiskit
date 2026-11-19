---
"@artemiskit/sdk": patch
---

`new CircuitBreaker(config)` now types its parameter as `Partial<CircuitBreakerConfig>`, matching what it already did at runtime: omitted fields default to `enabled: true`, `threshold: 5`, `windowMs: 60000`, `cooldownMs: 300000` and `halfOpenRequests: 3`. Type-only change; behaviour is unchanged and full configs still type-check.
