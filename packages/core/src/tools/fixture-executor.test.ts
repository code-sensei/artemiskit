import { describe, expect, it } from 'bun:test';
import { FixtureToolExecutor } from './fixture-executor';

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['city'],
        properties: { city: { type: 'string' } },
      },
    },
  },
];

const call = (arguments_: string, name = 'get_weather') => ({
  id: 'call-1',
  type: 'function' as const,
  function: { name, arguments: arguments_ },
});

describe('FixtureToolExecutor', () => {
  it('returns a deterministic matching fixture result', async () => {
    const executor = new FixtureToolExecutor({
      tools,
      fixtures: { get_weather: [{ when: { city: 'Lagos' }, result: { temperature_c: 28 } }] },
    });

    await expect(executor.execute(call('{"city":"Lagos"}'))).resolves.toEqual({
      status: 'success',
      result: { temperature_c: 28 },
    });
  });

  it('rejects undeclared tools, invalid JSON, and unmatched fixtures', async () => {
    const executor = new FixtureToolExecutor({ tools, fixtures: { get_weather: [] } });

    await expect(executor.execute(call('{}', 'delete_weather'))).resolves.toMatchObject({
      status: 'error',
      error: { code: 'TOOL_UNKNOWN' },
    });
    await expect(executor.execute(call('{city:Lagos}'))).resolves.toMatchObject({
      status: 'error',
      error: { code: 'TOOL_ARGUMENTS_INVALID' },
    });
    await expect(executor.execute(call('{"city":"Lagos"}'))).resolves.toMatchObject({
      status: 'error',
      error: { code: 'TOOL_FIXTURE_NOT_FOUND' },
    });
  });

  it('returns controlled fixture errors and result-size failures', async () => {
    const errorExecutor = new FixtureToolExecutor({
      tools,
      fixtures: { get_weather: [{ error: 'Weather service is unavailable.' }] },
    });
    const limitedExecutor = new FixtureToolExecutor({
      tools,
      fixtures: { get_weather: [{ result: { forecast: 'x'.repeat(32) } }] },
      maxToolResultBytes: 16,
    });

    await expect(errorExecutor.execute(call('{"city":"Lagos"}'))).resolves.toMatchObject({
      status: 'error',
      error: { code: 'TOOL_EXECUTION_FAILED' },
    });
    await expect(limitedExecutor.execute(call('{"city":"Lagos"}'))).resolves.toMatchObject({
      status: 'error',
      error: { code: 'TOOL_RESULT_TOO_LARGE' },
    });
  });

  it('rejects unsafe fixture configuration and fixtures for undeclared tools', () => {
    expect(
      () =>
        new FixtureToolExecutor({
          tools,
          fixtures: { get_weather: [{ result: { command: 'curl example.invalid' } }] },
        })
    ).toThrow('TOOL_FIXTURE_UNSAFE');
    expect(() => new FixtureToolExecutor({ tools, fixtures: { no_such_tool: [] } })).toThrow(
      'TOOL_UNKNOWN'
    );
  });
});
