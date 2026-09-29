import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { generateWorkflowReport } from '@artemiskit/reports';
import { Command, Option } from 'commander';

const recordLimit = 1_048_576;
const collectionLimit = 8 * recordLimit;

/** Bound reads before parsing; do not block on devices or follow checkpoint symlinks. */
async function readRecordFile(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > recordLimit) throw new Error('invalid_input_file');
    const bytes = Buffer.alloc(recordLimit + 1);
    let total = 0;
    while (total < bytes.length) {
      const result = await handle.read(bytes, total, bytes.length - total, null);
      if (result.bytesRead === 0) break;
      total += result.bytesRead;
    }
    if (total > recordLimit) throw new Error('input_limit');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, total));
  } finally {
    await handle.close();
  }
}

export function workflowReportCommand(): Command {
  return new Command('report')
    .description(
      'Generate an offline assessment from saved workflow records; no provider configuration'
    )
    .argument('<files...>', 'One saved V1, V2 or V3 workflow record per JSON file (maximum 50)')
    .addOption(
      new Option('--format <format>', 'Export format').choices(['html', 'markdown']).default('html')
    )
    .addOption(
      new Option('--view <view>', 'Report audience')
        .choices(['technical', 'executive', 'comprehensive'])
        .default('comprehensive')
    )
    .option(
      '--output <file>',
      'Write a new report file (0600); otherwise print the report to stdout'
    )
    .action(
      async (
        files: string[],
        options: {
          format: 'html' | 'markdown';
          view: 'technical' | 'executive' | 'comprehensive';
          output?: string;
        }
      ) => {
        let phase: 'read' | 'validate' | 'write' = 'validate';
        try {
          if (files.length < 1 || files.length > 50) throw new Error('input_limit');
          phase = 'read';
          const records: string[] = [];
          let bytes = 0;
          for (const file of files) {
            const record = await readRecordFile(file);
            bytes += Buffer.byteLength(record);
            if (bytes > collectionLimit) throw new Error('input_limit');
            records.push(record);
          }
          phase = 'validate';
          const report = generateWorkflowReport(records, {
            format: options.format,
            view: options.view,
          });
          phase = 'write';
          if (options.output !== undefined) {
            const output = await open(options.output, 'wx', 0o600);
            try {
              await output.writeFile(report, 'utf8');
              await output.sync();
            } finally {
              await output.close();
            }
            console.log('Workflow report written.');
          } else {
            process.stdout.write(report);
          }
          // Generation success is independent of the assessed task's pass/fail status.
          process.exitCode = 0;
        } catch {
          process.exitCode = phase === 'validate' ? 2 : 1;
          console.error(
            phase === 'validate'
              ? 'Workflow report: invalid, unsupported or conflicting saved evidence; no report generated.'
              : phase === 'read'
                ? 'Workflow report: unable to read bounded regular input files.'
                : 'Workflow report: output unavailable; choose a new writable file.'
          );
        }
      }
    );
}
