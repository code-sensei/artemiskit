import { LingAdapter } from '@artemiskit/adapter-ling';
import { OpenAIAdapter } from '@artemiskit/adapter-openai';
import { adapterRegistry } from '@artemiskit/core';
import { generateHTMLReport } from '@artemiskit/reports';
import {
  type AgentTarget,
  type AgentWorkflow,
  type AgentWorkflowResult,
  type AgentWorkflowSession,
  ArtemisKit,
  type ModelClient,
  type WorkflowPolicy,
  createAgentWorkflowSession,
  createDockerWorkflowEnvironmentFactory,
  createModelClientTarget,
  executeSimulatedTool,
  listWorkflowTools,
  runAgentWorkflow,
} from '@artemiskit/sdk';
import { scenario } from '@artemiskit/sdk/builders';
import { defineAdapter } from '@artemiskit/sdk/contracts';
import { jestMatchers } from '@artemiskit/sdk/jest';
import { artemiskitMatchers } from '@artemiskit/sdk/matchers';
import type {
  AgentWorkflowRecord,
  DockerWorkflowEnvironmentOptions,
  RunResult,
  WorkflowRunOptions,
} from '@artemiskit/sdk/types';
import { assertDefined } from '@artemiskit/sdk/utils';
import { vitestMatchers } from '@artemiskit/sdk/vitest';

declare const client: ModelClient;
declare const workflow: AgentWorkflow;
declare const policy: WorkflowPolicy;
declare const run: RunResult;
const target: AgentTarget = createModelClientTarget(client);
const session: AgentWorkflowSession = createAgentWorkflowSession({ workflow, target });
const execution: Promise<AgentWorkflowResult> = runAgentWorkflow({ workflow, target });
const options: WorkflowRunOptions = { workflow, target, cleanupTimeoutMs: 1000 };
const kit = new ArtemisKit();
const wrappedSession: Promise<AgentWorkflowSession> = kit.createWorkflowSession(options);
const wrappedExecution: Promise<AgentWorkflowResult> = kit.runWorkflow(options);
declare const record: AgentWorkflowRecord;
const sandboxOptions: DockerWorkflowEnvironmentOptions = {
  operationTimeoutMs: 5000,
  cleanupTimeoutMs: 3000,
};
const sandboxFactory = createDockerWorkflowEnvironmentFactory(sandboxOptions);
const tools = listWorkflowTools();
executeSimulatedTool({
  tool: tools[0].id,
  input: {},
  state: {},
  policy,
  declaredTools: workflow.tools,
});
// These must remain errors; an unresolved declaration or accidental any must fail this fixture.
// @ts-expect-error tool catalog IDs are a closed union
const bad: (typeof tools)[0]['id'] = 'undeclared-tool';
// @ts-expect-error workflows must carry their required contract fields
const invalid: AgentWorkflow = {};
void [
  target,
  session,
  execution,
  wrappedSession,
  wrappedExecution,
  record,
  sandboxFactory,
  run,
  bad,
  invalid,
  new ArtemisKit(),
  adapterRegistry,
  scenario,
  defineAdapter,
  artemiskitMatchers,
  vitestMatchers,
  jestMatchers,
  assertDefined,
  OpenAIAdapter,
  LingAdapter,
  generateHTMLReport,
];
