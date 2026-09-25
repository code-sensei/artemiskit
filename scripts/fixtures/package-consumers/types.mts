import { LingAdapter } from '@artemiskit/adapter-ling';
import { OpenAIAdapter } from '@artemiskit/adapter-openai';
import { adapterRegistry } from '@artemiskit/core';
import { generateHTMLReport } from '@artemiskit/reports';
import {
  type AgentTarget,
  type AgentWorkflow,
  ArtemisKit,
  type ModelClient,
  type WorkflowPolicy,
  createModelClientTarget,
  executeSimulatedTool,
  listWorkflowTools,
} from '@artemiskit/sdk';
import { scenario } from '@artemiskit/sdk/builders';
import { defineAdapter } from '@artemiskit/sdk/contracts';
import { jestMatchers } from '@artemiskit/sdk/jest';
import { artemiskitMatchers } from '@artemiskit/sdk/matchers';
import type { RunResult } from '@artemiskit/sdk/types';
import { assertDefined } from '@artemiskit/sdk/utils';
import { vitestMatchers } from '@artemiskit/sdk/vitest';

declare const client: ModelClient;
declare const workflow: AgentWorkflow;
declare const policy: WorkflowPolicy;
declare const run: RunResult;
const target: AgentTarget = createModelClientTarget(client);
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
