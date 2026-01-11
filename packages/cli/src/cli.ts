/**
 * Artemis CLI - Main entry point
 */

import { Command } from 'commander';
import { version } from '../package.json';
import { runCommand } from './commands/run';
import { initCommand } from './commands/init';
import { compareCommand } from './commands/compare';
import { historyCommand } from './commands/history';
import { reportCommand } from './commands/report';
import { redteamCommand } from './commands/redteam';
import { stressCommand } from './commands/stress';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('artemis')
    .description('Agent Reliability Toolkit - Test, validate, and audit LLM-driven agents')
    .version(version);

  program.addCommand(initCommand());
  program.addCommand(runCommand());
  program.addCommand(compareCommand());
  program.addCommand(historyCommand());
  program.addCommand(reportCommand());
  program.addCommand(redteamCommand());
  program.addCommand(stressCommand());

  return program;
}
