import { describe, expect, test } from 'bun:test';
import { validateScenario } from '../scenario/parser';

describe('Ling provider contract', () => {
  test('accepts Ling provider controls in a scenario', () => {
    const scenario = validateScenario({
      name: 'ling-contract',
      provider: 'ling',
      model: 'Ling-3.0-flash',
      providerConfig: {
        thinking: { type: 'enabled' },
        enableSearch: true,
        searchOptions: { max_results: 3 },
      },
      cases: [{ id: 'hello', prompt: 'hello', expected: { type: 'contains', values: ['hello'] } }],
    });

    expect(scenario.provider).toBe('ling');
    expect(scenario.providerConfig?.thinking).toEqual({ type: 'enabled' });
  });
});
