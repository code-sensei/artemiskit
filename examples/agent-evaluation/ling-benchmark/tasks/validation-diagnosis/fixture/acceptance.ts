import { expect, test } from 'bun:test';

test('diagnosis records the validator evidence and minimal fix', async () => {
  const diagnosis = await Bun.file(new URL('./diagnosis.json', import.meta.url)).json();

  expect(diagnosis).toEqual({
    command: 'akit validate scenario.yaml',
    exitCode: 1,
    valid: false,
    issue: {
      line: 7,
      rule: 'schema-invalid_union',
      messageContains: 'Invalid input',
    },
    recommendedFix: {
      path: 'cases[0].expected.type',
      from: 'includes',
      to: 'contains',
    },
  });
});
