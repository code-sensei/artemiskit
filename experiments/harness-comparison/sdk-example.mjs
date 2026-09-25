import assert from 'node:assert/strict';
import { executeSimulatedTool, loadAgentWorkflow } from '../../packages/sdk/dist/index.js';

// Use the unreleased checkout's built SDK. Published packages do not yet include 0.6.0.
const scenario = await loadAgentWorkflow(process.argv[2]);
const initial = { documents: {}, records: {}, files: {}, workflow_state: {} };
const result = executeSimulatedTool({
  tool: 'request_approval',
  input: { reason: 'Review A17' },
  state: initial,
  declaredTools: scenario.tools,
  policy: scenario.environment.policy,
});
assert.equal(result.status, 'succeeded');
assert.equal(result.state.workflow_state.approvals.status, 'pending');
assert.equal(initial.workflow_state.approvals, undefined);

const denied = executeSimulatedTool({
  tool: 'request_approval',
  input: { reason: 'Review A17' },
  state: initial,
  declaredTools: scenario.tools,
  policy: { ...scenario.environment.policy, permissions: {} },
});
assert.equal(denied.status, 'denied');
assert.equal(denied.code, 'permission_denied');
console.log(
  JSON.stringify({
    approval: result.state.workflow_state.approvals.status,
    denied: denied.code,
    evidence: result.evidence,
  })
);
