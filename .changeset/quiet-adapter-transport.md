---
"@artemiskit/adapter-openai": patch
"@artemiskit/adapter-anthropic": patch
"@artemiskit/adapter-ling": patch
---

Send provider requests through the runtime's built-in `fetch`. The Node-targeted bundles previously fell back to the SDKs' bundled node-fetch, which calls the deprecated `url.parse()` and printed a `DEP0169` warning to stderr on every request under Bun 1.4+.
