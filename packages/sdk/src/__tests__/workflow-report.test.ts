import { describe, expect, test } from 'bun:test';
import { createAgentWorkflowSession, validateAgentWorkflow } from '@artemiskit/core';
import {
  ArtemisKit,
  createWorkflowReport,
  generateWorkflowReport,
  renderWorkflowReportHTML,
  renderWorkflowReportMarkdown,
} from '../index';

async function evidence() {
  const workflow = validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'report-only',
    target: { provider: 'openai', model: 'fixture' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { workflow_state: 'read' },
        budgets: { max_actions: 2, timeout_ms: 1000 },
      },
    },
    tools: ['get_workflow_state'],
    workflow: {
      system_instructions: 'Fixture',
      initial_state: { workflow_state: { ready: true } },
      turns: [{ role: 'user', content: 'Do not persist private prose.' }],
    },
    outcomes: { deterministic: [{ type: 'workflow_state', path: 'ready', equals: true }] },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
  return (
    await createAgentWorkflowSession({
      workflow,
      target: {
        provider: 'openai',
        capabilities: async () => ({
          status: 'available',
          toolUse: true,
          transportCancellation: true,
        }),
        turn: async () => ({
          status: 'completed',
          id: 'fixture',
          model: 'fixture',
          message: { role: 'assistant', content: 'Do not persist private prose.' },
          tokens: { prompt: 1, completion: 1, total: 2 },
          latencyMs: 1,
        }),
      },
    }).run()
  ).record;
}
describe('SDK offline workflow reports', () => {
  test('top-level and class surfaces share canonical model and both deterministic renderers', async () => {
    const record = await evidence();
    expect(record.taskVerification).toBe('passed');
    const kit = new ArtemisKit({
      provider: 'openai',
      providerConfig: { apiKey: 'not-a-credential' },
    });
    const fetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('Reporting attempted network');
    }) as typeof fetch;
    try {
      const before = JSON.stringify(record);
      const model = createWorkflowReport(record);
      expect(kit.createWorkflowReport(record)).toEqual(model);
      for (const view of ['technical', 'executive', 'comprehensive'] as const) {
        for (const format of ['html', 'markdown'] as const) {
          const text = generateWorkflowReport(record, { view, format });
          expect(kit.generateWorkflowReport(record, { view, format })).toBe(text);
          expect(text).toBe(
            format === 'html'
              ? renderWorkflowReportHTML(model, { view })
              : renderWorkflowReportMarkdown(model, { view })
          );
          expect(text).not.toContain('private prose');
        }
      }
      expect(JSON.stringify(record)).toBe(before);
      expect(() => kit.createWorkflowReport({ schemaVersion: '99' })).toThrow();
      expect(() => generateWorkflowReport(record, { format: 'pdf' } as never)).toThrow(
        'Invalid workflow report options'
      );
      for (const options of [{ format: null }, { view: null }, { unexpected: true }]) {
        expect(() => generateWorkflowReport(record, options as never)).toThrow(
          'Invalid workflow report options'
        );
      }
      let accessed = false;
      expect(() =>
        generateWorkflowReport(record, {
          get view() {
            accessed = true;
            throw new Error('sensitive');
          },
        } as never)
      ).toThrow('Invalid workflow report options');
      expect(accessed).toBe(false);
    } finally {
      globalThis.fetch = fetch;
    }
  });
});
