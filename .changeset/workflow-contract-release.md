---
'@artemiskit/core': minor
'@artemiskit/cli': minor
'@artemiskit/sdk': minor
'@artemiskit/adapter-openai': patch
'@artemiskit/adapter-anthropic': patch
'@artemiskit/adapter-vercel-ai': patch
'@artemiskit/adapter-deepagents': patch
'@artemiskit/adapter-langchain': patch
'@artemiskit/adapter-ling': patch
'@artemiskit/adapter-trueforge': patch
'@artemiskit/redteam': patch
'@artemiskit/reports': patch
---

Introduce the 0.6.0 agent-workflow contract: strict versioned scenarios, twelve simulated tools,
provider-neutral single-turn targets, CLI authoring and offline validation, and public SDK exports.
Preserve OpenAI structured tool-call transcripts for continuation. Full workflow execution,
cumulative budgets, sandbox environments, scoring and recovery remain later milestones.

Publish Node-compatible library bundles and NodeNext-compatible TypeScript declarations, verified
with fresh tarball consumers on Node 24 and Bun 1.3. The CLI and Docker MCP server retain Bun entry
points. Package versions remain independent; the milestone release manifest records their mapping.
