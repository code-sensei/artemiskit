import { writeSync } from 'node:fs';
import { runAgentWorkflow } from '../session';
import { recoveryTarget, recoveryWorkflow } from './scenario';

const options = JSON.parse(process.argv[2]);
const target = recoveryTarget();
if (options.crash === 'model')
  target.turn = async () => {
    writeSync(1, 'crashed\n');
    process.exit(0);
  };
const result = await runAgentWorkflow({
  workflow: recoveryWorkflow(),
  target,
  checkpoint: {
    directory: options.directory,
    mode: options.mode,
    configurationId: 'fixture-transport',
  },
  ...(options.pauseAfterActions === undefined
    ? {}
    : { pauseAfterActions: options.pauseAfterActions }),
  onEvent: (event) => {
    if (
      options.crash === 'ready' &&
      event.type === 'model_requested' &&
      event.operationId === 'model-2'
    ) {
      writeSync(1, 'crashed\n');
      process.exit(0);
    }
    if (options.crash === 'tool' && event.type === 'tool_completed') {
      writeSync(1, 'crashed\n');
      process.exit(0);
    }
  },
});
writeSync(1, `${JSON.stringify(result.record)}\n`);
