import { describe, expect, test } from 'bun:test';
import { workflowTransportIdentity } from './workflow-identity';

describe('private workflow transport identity', () => {
  test('binds SDK ambient endpoint and project defaults without printing them', () => {
    const keys = ['OPENAI_BASE_URL', 'OPENAI_PROJECT_ID', 'ANTHROPIC_AUTH_TOKEN'] as const;
    const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:10001/v1';
      process.env.OPENAI_PROJECT_ID = 'fixture-project-one';
      const config = {
        provider: 'openai' as const,
        apiKey: 'fixture-only',
        defaultModel: 'fixture',
      };
      const initial = workflowTransportIdentity(config);
      expect(initial).toMatch(/^[a-f0-9]{64}$/);
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:10002/v1';
      expect(workflowTransportIdentity(config)).not.toBe(initial);
      const explicit = { ...config, baseUrl: 'http://127.0.0.1:10003/v1' };
      const fixed = workflowTransportIdentity(explicit);
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:10004/v1';
      expect(workflowTransportIdentity(explicit)).toBe(fixed);
      process.env.OPENAI_PROJECT_ID = 'fixture-project-two';
      expect(workflowTransportIdentity(explicit)).not.toBe(fixed);
      process.env.ANTHROPIC_AUTH_TOKEN = 'fixture-auth-one';
      const anthropic = { provider: 'anthropic' as const, apiKey: 'fixture-only' };
      const auth = workflowTransportIdentity(anthropic);
      process.env.ANTHROPIC_AUTH_TOKEN = 'fixture-auth-two';
      expect(workflowTransportIdentity(anthropic)).not.toBe(auth);
    } finally {
      for (const key of keys) {
        if (before[key] === undefined) delete process.env[key];
        else process.env[key] = before[key];
      }
    }
  });
});
