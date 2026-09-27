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
  evaluateWorkflowDeterministicOutcomes,
  evaluateWorkflowSemantics,
  executeSimulatedTool,
  listWorkflowTools,
  readWorkflowRecord,
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
  SavedWorkflowRecord,
  WorkflowCheckpointOptions,
  WorkflowFault,
  WorkflowJudgeOptions,
  WorkflowOutcomeAssessment,
  WorkflowRecoveryEvidence,
  WorkflowRetry,
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
const judge: WorkflowJudgeOptions = {
  client,
  provider: 'openai',
  model: 'judge-model',
  limits: { maxRequests: 1, maxTokens: 100, maxOutputTokens: 20, timeoutMs: 1000 },
};
const options: WorkflowRunOptions = {
  workflow,
  target,
  cleanupTimeoutMs: 1000,
  semanticJudge: judge,
};
const saved: SavedWorkflowRecord = readWorkflowRecord('{}');
const outcomes: WorkflowOutcomeAssessment | undefined =
  saved.schemaVersion !== '1' ? saved.outcomes : undefined;
if (saved.schemaVersion === '1') {
  const unscored: 'unavailable' = saved.taskVerification;
  void unscored;
}
// @ts-expect-error judges require explicit bounded limits
const badJudge: WorkflowJudgeOptions = { client, provider: 'openai', model: 'judge-model' };
void [outcomes, badJudge, evaluateWorkflowDeterministicOutcomes, evaluateWorkflowSemantics];
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

const checkpoint: WorkflowCheckpointOptions = {
  directory: '.private-run',
  mode: 'resume',
  configurationId: 'approved-transport-v1',
};
const resumedOptions: WorkflowRunOptions = { workflow, target, checkpoint, pauseAfterActions: 2 };
const resumable = createAgentWorkflowSession(
  resumedOptions as WorkflowRunOptions & { workflow: AgentWorkflow; target: AgentTarget }
);
resumable.pause();
const recovery: WorkflowRecoveryEvidence | undefined = record.recovery;
const fault: WorkflowFault = {
  id: 'first-tool',
  tool: 'read_file',
  occurrence: 1,
  kind: 'unavailable_tool',
};
const retry: WorkflowRetry = { max_attempts: 2 };
// @ts-expect-error checkpoints require an explicit host configuration identity
const incompleteCheckpoint: WorkflowCheckpointOptions = {
  directory: '.private-run',
  mode: 'resume',
};
const invalidFault: WorkflowFault = {
  id: 'bad',
  tool: 'read_file',
  occurrence: 1,
  // @ts-expect-error fault kinds are a closed union
  kind: 'live-network',
};
void [checkpoint, resumedOptions, recovery, fault, retry, incompleteCheckpoint, invalidFault];
