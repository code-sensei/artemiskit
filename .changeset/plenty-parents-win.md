---
"@artemiskit/adapter-anthropic": patch
"@artemiskit/adapter-openai": patch
"@artemiskit/adapter-vercel-ai": patch
"@artemiskit/cli": patch
"@artemiskit/core": patch
"@artemiskit/redteam": patch
"@artemiskit/reports": patch
---

fix: resolve npm install error caused by workspace:\* protocol

Fixed an issue where `npm i -g @artemiskit/cli` would fail with
"Unsupported URL Type workspace:_" error. The publish workflow now
automatically replaces workspace:_ dependencies with actual version
numbers before publishing to npm.
