/**
 * ArtemisKit CLI - Main entry point
 */

import { Command } from 'commander';
import { version } from '../package.json';
import { compareCommand } from './commands/compare';
import { historyCommand } from './commands/history';
import { initCommand } from './commands/init';
import { redteamCommand } from './commands/redteam';
import { reportCommand } from './commands/report';
import { runCommand } from './commands/run';
import { stressCommand } from './commands/stress';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('artemiskit')
    .description('ArtemisKit - Open-source Agent Reliability Toolkit - Test, validate, audit and evaluate LLMs and LLM-driven agents')
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
