/**
 * Opt-in Studio smoke gate. This file deliberately never reads or prints the
 * API key; Bun supplies it to the spawned CLI only when both guards are set.
 */
import { fileURLToPath } from 'node:url';

export function liveTestsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LING_LIVE_TESTS === '1' && Boolean(env.LING_API_KEY);
}

export async function runLiveSmoke(): Promise<number> {
  if (!liveTestsEnabled()) {
    console.log('Skipping Ling live smoke: set LING_LIVE_TESTS=1 and LING_API_KEY to enable.');
    return 0;
  }

  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const config = 'examples/11-ling-api/artemis.config.example.yaml';
  const scenarios = [
    'examples/11-ling-api/scenarios/flash-core.yaml',
    'examples/11-ling-api/scenarios/tiny-core.yaml',
    'examples/11-ling-api/scenarios/flash-tool-loop.yaml',
  ];

  for (const scenario of scenarios) {
    const child = Bun.spawn(
      ['bun', 'packages/cli/bin/artemis.ts', 'run', scenario, '--config', config, '--redact'],
      { cwd: root, stdout: 'inherit', stderr: 'inherit', env: process.env }
    );
    if ((await child.exited) !== 0) return 1;
  }
  return 0;
}

if (import.meta.main) process.exitCode = await runLiveSmoke();
