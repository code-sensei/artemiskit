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
import { checkForUpdate, formatUpdateMessage, formatVersionDisplay } from './utils/update-checker';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('artemiskit')
    .description(
      'ArtemisKit - Open-source Agent Reliability Toolkit - Test, validate, audit and evaluate LLMs and LLM-driven agents'
    )
    .version(version, '-v, --version', 'Output the current version')
    .option('-V, --version-check', 'Output version and check for updates')
    .action(async () => {
      // Handle root command with --version-check flag
      const opts = program.opts();
      if (opts.versionCheck) {
        console.log(formatVersionDisplay(version));
        console.log('\nChecking for updates...');
        const updateInfo = await checkForUpdate();
        if (updateInfo?.updateAvailable) {
          console.log(formatUpdateMessage(updateInfo.currentVersion, updateInfo.latestVersion));
        } else if (updateInfo) {
          console.log('You are using the latest version.');
        } else {
          console.log('Could not check for updates (network unavailable).');
        }
      } else {
        // No subcommand provided, show help
        program.help();
      }
    });

  program.addCommand(initCommand());
  program.addCommand(runCommand());
  program.addCommand(compareCommand());
  program.addCommand(historyCommand());
  program.addCommand(reportCommand());
  program.addCommand(redteamCommand());
  program.addCommand(stressCommand());

  return program;
}
