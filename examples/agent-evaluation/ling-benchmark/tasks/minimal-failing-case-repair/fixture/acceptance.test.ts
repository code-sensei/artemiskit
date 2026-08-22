import { expect, test } from 'bun:test';

test('the release-readiness expectation matches the prompt', async () => {
  const source = await Bun.file(new URL('./scenario.yaml', import.meta.url)).text();
  const scenario = Bun.YAML.parse(source) as {
    cases: Array<{ expected: { type: string; value?: string } }>;
  };

  expect(scenario.cases[0]?.expected).toEqual({ type: 'exact', value: 'READY' });
});
