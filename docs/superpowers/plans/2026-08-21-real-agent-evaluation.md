# Real-Agent Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, safe ArtemisKit foundation for outcome-based real-agent evaluations, with TrueForge as the first adapter and a local Docker MCP sandbox backend.

**Architecture:** Core owns harness-neutral task, trace, and manifest contracts. Optional packages own TrueForge event mapping and Docker-backed MCP tooling. The first end-to-end fixture repairs a malformed ArtemisKit scenario and verifies it locally.

**Tech Stack:** TypeScript, Bun workspaces, Zod, Docker CLI, MCP TypeScript SDK, TrueForge HTTP/TypeScript SDK.

---

### Task 1: Add core real-agent contracts

**Files:** Create `packages/core/src/agent-evaluation/{types.ts,index.ts,types.test.ts}`; modify `packages/core/src/index.ts`.

- [x] Define `AgentTask`, `AgentAction`, `AgentTrace`, `AgentOutcome`, and `AgentHarness` with fixture path, allowed paths/tools, command/time budgets, acceptance commands, normalized actions, and final diff.
- [x] Write focused tests for valid task/outcome shapes and trace budget accounting.
- [x] Export contracts from core and run `bun test packages/core/src/agent-evaluation/types.test.ts && bun run --filter '@artemiskit/core' typecheck`.
- [x] Commit `feat: add real agent evaluation contracts`.

### Task 2: Implement local Docker MCP sandbox package

**Files:** Create `packages/mcp-docker-sandbox/{package.json,tsconfig.json,src/{policy.ts,workspace.ts,server.ts,policy.test.ts,index.ts}}`; modify root workspace metadata and lockfile.

- [x] Write failing policy tests for rejected host paths, network/install commands, remote Git, and commands outside the allowlist.
- [x] Implement a sandbox policy that accepts only fixture-root reads/patches, Git status/diff, and `bun test`, `bun run typecheck`, `bun run build`, `akit validate`.
- [x] Implement Docker workspace provisioning with a fresh host temporary workspace copied from the fixture, an exclusive writable bind mount for that disposable copy, host Git control data outside the mount, `--network none`, a read-only container root filesystem, resource/time limits, and cleanup.
- [x] Expose MCP tools `workspace_read`, `workspace_patch`, `workspace_status`, `workspace_diff`, and `workspace_run` through the policy.
- [x] Run package tests/typecheck and commit `feat: add Docker MCP sandbox`.

### Task 3: Implement TrueForge adapter package

**Files:** Create `packages/adapters/trueforge/{package.json,tsconfig.json,src/{client.ts,mapper.ts,client.test.ts,index.ts}}`; modify core registry only if adapter registration is appropriate.

- [x] Write mocked SDK/event tests that normalize session/turn/model/tool/sandbox events into `AgentTrace` without secrets.
- [x] Implement configuration for localhost TrueForge, custom Ling model name, MCP server reference, and turn timeout.
- [x] Implement session/turn execution, event persistence, artifact metadata retrieval, and conversion to `AgentOutcome`.
- [x] Run package tests/typecheck and commit `feat: add TrueForge agent evaluation adapter`.

### Task 4: Add fixture task and acceptance scorer

**Files:** Create `examples/agent-evaluation/scenario-repair/{fixture,task.yaml,acceptance.ts,README.md}`; create `packages/core/src/agent-evaluation/scorer.ts` and tests.

- [x] Seed a malformed scenario with one invalid expectation type and a task allowing only that file to change.
- [x] Implement scorer checks for allowed changed paths, validation command result, valid parsed scenario, and prohibited actions.
- [x] Write tests for success, changed-path violation, and failed validation.
- [x] Run fixture locally through the Docker MCP server without a model; commit `test: add agent scenario repair benchmark`.

### Task 5: Run compatibility spike and document results

**Files:** Create ignored `agent-evaluation-runs/` through `.gitignore`; create `docs/agent-evaluation/trueforge.md`.

- [x] Start TrueForge localhost-only, configure Ling as a custom OpenAI-compatible provider, and attach the local MCP server.
- [x] Execute repeated Flash and Tiny scenario-repair runs; save sanitized TrueForge events, diff, acceptance result, tokens, and latency to ignored artifacts.
- [x] Run core/package tests, build, typecheck, lint, and secret/diff audit.
- [x] Document setup, safety limits, current TrueForge sandbox limitation, and exact spike outcome. Do not push.
