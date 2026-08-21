# Real-Agent Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, safe ArtemisKit foundation for outcome-based real-agent evaluations, with TrueForge as the first adapter and a local Docker MCP sandbox backend.

**Architecture:** Core owns harness-neutral task, trace, and manifest contracts. Optional packages own TrueForge event mapping and Docker-backed MCP tooling. The first end-to-end fixture repairs a malformed ArtemisKit scenario and verifies it locally.

**Tech Stack:** TypeScript, Bun workspaces, Zod, Docker CLI, MCP TypeScript SDK, TrueForge HTTP/TypeScript SDK.

---

### Task 1: Add core real-agent contracts

**Files:** Create `packages/core/src/agent-evaluation/{types.ts,index.ts,types.test.ts}`; modify `packages/core/src/index.ts`.

- [ ] Define `AgentTask`, `AgentAction`, `AgentTrace`, `AgentOutcome`, and `AgentHarness` with fixture path, allowed paths/tools, command/time budgets, acceptance commands, normalized actions, and final diff.
- [ ] Write focused tests for valid task/outcome shapes and trace budget accounting.
- [ ] Export contracts from core and run `bun test packages/core/src/agent-evaluation/types.test.ts && bun run --filter '@artemiskit/core' typecheck`.
- [ ] Commit `feat: add real agent evaluation contracts`.

### Task 2: Implement local Docker MCP sandbox package

**Files:** Create `packages/agent-sandboxes/mcp-docker/{package.json,tsconfig.json,src/{policy.ts,workspace.ts,server.ts,policy.test.ts,index.ts}}`; modify root workspace metadata and lockfile.

- [ ] Write failing policy tests for rejected host paths, network/install commands, remote Git, and commands outside the allowlist.
- [ ] Implement a sandbox policy that accepts only fixture-root reads/patches, Git status/diff, and `bun test`, `bun run typecheck`, `bun run build`, `akit validate`.
- [ ] Implement Docker workspace provisioning with `--network none`, read-only base fixture, writable ephemeral volume, resource/time limits, and cleanup.
- [ ] Expose MCP tools `workspace_read`, `workspace_patch`, `workspace_status`, `workspace_diff`, and `workspace_run` through the policy.
- [ ] Run package tests/typecheck and commit `feat: add Docker MCP sandbox`.

### Task 3: Implement TrueForge adapter package

**Files:** Create `packages/adapters/trueforge/{package.json,tsconfig.json,src/{client.ts,mapper.ts,client.test.ts,index.ts}}`; modify core registry only if adapter registration is appropriate.

- [ ] Write mocked SDK/event tests that normalize session/turn/model/tool/sandbox events into `AgentTrace` without secrets.
- [ ] Implement configuration for localhost TrueForge, custom Ling model name, MCP server reference, and turn timeout.
- [ ] Implement session/turn execution, event persistence, artifact metadata retrieval, and conversion to `AgentOutcome`.
- [ ] Run package tests/typecheck and commit `feat: add TrueForge agent evaluation adapter`.

### Task 4: Add fixture task and acceptance scorer

**Files:** Create `examples/agent-evaluation/scenario-repair/{fixture,task.yaml,acceptance.ts,README.md}`; create `packages/core/src/agent-evaluation/scorer.ts` and tests.

- [ ] Seed a malformed scenario with one invalid expectation type and a task allowing only that file to change.
- [ ] Implement scorer checks for allowed changed paths, validation command result, valid parsed scenario, and prohibited actions.
- [ ] Write tests for success, changed-path violation, and failed validation.
- [ ] Run fixture locally through the Docker MCP server without a model; commit `test: add agent scenario repair benchmark`.

### Task 5: Run compatibility spike and document results

**Files:** Create ignored `agent-evaluation-runs/` through `.gitignore`; create `docs/agent-evaluation/trueforge.md`.

- [ ] Start TrueForge localhost-only, configure Ling as a custom OpenAI-compatible provider, and attach the local MCP server.
- [ ] Execute one Flash scenario-repair run; save sanitized TrueForge events, diff, acceptance result, tokens, and latency to ignored artifacts.
- [ ] Run core/package tests, build, typecheck, and secret/diff audit.
- [ ] Document setup, safety limits, current TrueForge sandbox limitation, and exact spike outcome; commit docs only. Do not push.
