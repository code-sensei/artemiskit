import { readFile, writeFile } from 'node:fs/promises';
import { session } from './backends.mjs';
import { cases, taskIds } from './cases.mjs';
import { context } from './common.mjs';

// Run in a disposable process: the parent also enforces a wall-clock watchdog.
const options = JSON.parse(process.argv[2]);
const original = cases.find((c) => c.id === options.case);
if (!original) throw new Error('Unknown case');
const spec = options.live ? { ...original, maxRequests: 4, maxTokens: 4096 } : original;
const saved =
  options.phase === 2 ? JSON.parse(await readFile(options.checkpoint, 'utf8')) : undefined;
const c = context(spec, options.live, saved?.context);
const started = performance.now();
let s;
let answer = { status: 'unavailable', text: '' };
let initializationMs;
let checkpointBytes;
let isolationPassed;
let error;
let toolsPendingAtClose = 0;
const timer = setTimeout(
  () => {
    c.cancelled = true;
    c.controller.abort();
  },
  options.live ? 55_000 : 7_000
);
try {
  s = await session(options.backend, c, saved?.session);
  initializationMs = performance.now() - started;
  answer = await s.ask(options.phase === 2 ? spec.resumePrompt : spec.prompt);
  if (options.phase === 1) {
    const snapshot = await s.snapshot();
    const serialized = JSON.stringify({
      session: snapshot,
      context: {
        state: c.state,
        requests: c.requests,
        usage: c.usage,
        usageKnown: c.usageKnown,
        scriptIndex: c.scriptIndex,
        admittedActions: c.admittedActions,
      },
    });
    checkpointBytes = Buffer.byteLength(serialized);
    await writeFile(options.checkpoint, serialized, { mode: 0o600 });
  }
  if (spec.id === 'fresh_state') {
    await s.close();
    s = undefined;
    const fresh = context(cases.find((c) => c.id === 'document'));
    const next = await session(options.backend, fresh);
    try {
      await next.ask('Read document brief.');
      isolationPassed =
        c.state.files['resume.txt'] === 'resume-marker' &&
        Object.keys(fresh.state.files).length === 0 &&
        !fresh.historyObserved.includes(true);
    } finally {
      await next.close();
    }
  }
} catch (caught) {
  // Error messages from providers may contain input or secrets. Retain the class only.
  error = caught?.name ?? 'Error';
  answer.status = 'error';
} finally {
  if (s) await s.close();
  toolsPendingAtClose = c.pendingTools.size;
  await Promise.allSettled([...c.pendingTools]);
  clearTimeout(timer);
}
const observation = { ...c, ...answer, isolationPassed };
const passed =
  options.phase === 1
    ? c.state.files['resume.txt'] === 'resume-marker' && checkpointBytes > 0
    : spec.check(observation);
const starts = c.events.filter((e) => e.type === 'tool_start').map((e) => e.id);
const ends = c.events.filter((e) => e.type === 'tool_end').map((e) => e.id);
console.log(
  JSON.stringify({
    backend: options.backend,
    case: spec.id,
    phase: options.phase ?? null,
    live: !!options.live,
    passed,
    category: taskIds.includes(spec.id) ? 'task' : 'control',
    taskOutcome: taskIds.includes(spec.id)
      ? passed
        ? 'passed'
        : 'failed'
      : spec.id === 'false_success'
        ? 'failed'
        : 'not_applicable',
    reportedStatus: answer.status,
    error: error ?? null,
    requests: c.requests,
    tokens: c.usageKnown ? c.usage : null,
    usageKnown: c.usageKnown,
    paidProviderCostUsd: 0,
    localComputeCostUsd: null,
    initializationMs: Math.round(initializationMs ?? 0),
    elapsedMs: Math.round(performance.now() - started),
    trace: c.trace,
    events: c.events,
    guardStops: c.guardStops,
    inputs: c.inputs,
    // These checks concern tool IDs/counts, not the completeness of a production evidence stream.
    toolEventsPaired: starts.length === ends.length && starts.every((id) => ends.includes(id)),
    toolsPendingAtClose,
    strictRawArguments: spec.strictRawArguments ?? false,
    finalFiles: Object.keys(c.state.files),
    approvalStatus: c.state.workflow_state.approvals?.status ?? null,
    isolationPassed: isolationPassed ?? null,
    checkpointBytes: checkpointBytes ?? null,
  })
);
