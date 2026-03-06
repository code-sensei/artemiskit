---
"@artemiskit/cli": patch
"@artemiskit/sdk": patch
---

Fix npm install error caused by unresolved workspace:\* dependencies

The published package contained workspace:\* protocol references for @artemiskit/adapter-deepagents and @artemiskit/adapter-langchain, which npm doesn't support. These are now properly resolved to version numbers during publish.

Fix npm install error caused by unresolved workspace:\* dependencies

The published package contained workspace:\* protocol references for @artemiskit/adapter-deepagents and @artemiskit/adapter-langchain, which npm doesn't support. These are now properly resolved to version numbers during publish.
