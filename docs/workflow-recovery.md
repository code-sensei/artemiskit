# Workflow faults and durable recovery

Implemented contract for milestone 0.6.3. See the [release record](releases/0.6.3.md) for qualification and publication status; implementation does not mean the version has been published.

A fresh workflow remains the default. Checkpointing is an explicit operation because it retains conversation text, tool arguments and results, workflow state and file contents. Metadata-only execution records remain separate from this working data.

## Authority and identity

A resume continues the same logical run, with a new attempt identity. It restores the existing conversation, state, cursor, operation identifiers, consumed target usage, action/model/tool counters and declared fault schedule. It must match the original workflow, tool catalogue, policy, native harness and host-supplied transport configuration identity. Resume cannot change authority, reset budgets, or become a new independent repetition. A different workflow or configuration requires a fresh run.

The original absolute deadline includes time while the process is stopped. Expired checkpoints and backward movement of the wall clock relative to the last committed observation are refused before a provider call or environment creation. Missing target usage remains unknown; it cannot become a free request on restart. Completed preflight is preserved instead of rerun.

## Atomic boundaries and interruption

The engine records an admitted pending operation before invoking a model or tool. A ready checkpoint contains a coherent conversation and cursor after a completed transition. If the process stops with a pending operation, resume refuses automatically: the request may have consumed unreported tokens, and an interrupted write may already have happened. Cancellation does not undo effects.

An explicit pause waits for a safe boundary and confirmed environment cleanup. Resume recreates the built-in simulation or sandbox from its saved state and artifacts. An active sandbox crash is refused because the old container's cleanup cannot be inferred from a file. Custom environments do not acquire checkpoint support merely by implementing execute/snapshot/close.

Checkpoints retain the unfinished logical event ledger. The pause result has its own terminal presentation; those terminal events are never fed back into the resumed run. Evaluation starts only after a terminal checkpoint has been committed. A crash during a semantic judge cannot replay that judge by resuming the execution checkpoint.

## Storage and retention

Storage is local, same-user, private working data: directory mode 0700 and checkpoint/lock files mode 0600 on the supported POSIX filesystem. Files are bounded; reads reject unsafe links, permissions, ownership, corrupt envelopes and unknown versions. Writes use an exclusive temporary file, fsync, atomic rename and directory fsync. A checksum detects corruption; it is not an authenticity signature against the user who owns the directory.

An exclusive local process claim prevents two sessions from restoring the same directory concurrently. A dead local owner can be reclaimed after identity checks; live, foreign or indeterminate owners are refused. A crashed recovery guard fails closed and needs operator investigation. Copying a checkpoint directory is outside this duplicate-restore protection. This is not a distributed lock or an external-system exactly-once guarantee.

Checkpoint files are retained for the operator to inspect or remove under the application's data-retention policy. They are not automatically uploaded, included in ordinary reports, or deleted after evaluation. Lost or manually edited checkpoint data is not repaired by inventing missing evidence.

## Faults and retries

Faults are declared in the scenario and applied only after original tool arguments and host policy pass validation. The schedule is deterministic and retained across restart. Supported cases are unavailable tools, stale or incomplete read data, malformed read results, simulated timeouts and conflicting instructions in read content. Declared read fixtures cannot fabricate successful writes or grant authority.

Retries must be explicitly bounded and consume action/tool budgets. Automatic retry is limited to declared failures known to occur before an effect. Unexpected environment failures and ambiguous interrupted operations do not get an automatic retry. A recovered run retains its failed attempts; ordinary successful completion does not erase them.

For example, this declaration makes the first logical document read unavailable once. Its next
attempt can execute normally; both attempts consume the same run's action and tool-call budgets.

```yaml
faults:
  - id: document-temporarily-unavailable
    tool: read_document
    occurrence: 1
    kind: unavailable_tool
retry:
  max_attempts: 2
```

`occurrence` counts original calls to that tool, not retries. Multiple declarations for the same
tool and occurrence apply in declaration order to attempts 1 through 5. A declaration is consumed
once and is not injected again after resume. `max_attempts` includes the initial attempt; its
maximum is 5 and the default is 1. Only declared `unavailable_tool` and `timeout` failures can
trigger automatic retry. A timeout optionally supplies `timeout_ms` (1–60000); its delay consumes
the original wall-clock budget. A timeout without a delay immediately reports the declared fault.
Malformed results stop as invalid evidence without automatic retry. Stale/incomplete fixtures must
satisfy the selected read tool's output schema; conflicting instructions append bounded content to
a document/file read. These observations never change tool policy or fabricate a write effect.

The scenario permits at most 32 faults. Output fixtures are bounded to 16 KiB and conflicting
instructions to 4096 bytes. A recovered logical call contributes one successful tool-trace call,
while the budget and event ledger retain every admitted attempt. State-change evidence contains
before/after digests for successful changes, with counts for omitted entries. Truncated event
ledgers leave trace assertions unavailable instead of inferring missing successes.

Public evidence includes bounded fault, retry, state-change and recovery summaries, digests, counts and omitted-evidence counts. It excludes raw fixture outputs, instructions, file paths, model text and checkpoint locations. A finished run is still independently evaluated against its declared outcomes; recovery itself is not proof of task success.

## CLI and SDK interfaces

The CLI deliberately separates a fresh run from restoring private working data:

```sh
akit workflow run examples/07-agentic/fault-recovery-workflow.yaml \
  --config artemis.config.yaml --checkpoint-dir .artemis-checkpoint \
  --pause-after-actions 2 --output paused.json

akit workflow resume examples/07-agentic/fault-recovery-workflow.yaml \
  --config artemis.config.yaml --checkpoint-dir .artemis-checkpoint \
  --output resumed.json
```

A confirmed pause exits `10`, with task verification unavailable. The action threshold counts this
attempt and takes effect at the next safe boundary; an in-progress operation is allowed to settle.
Existing cancellation, policy, budget and task-outcome exits retain their meanings. Omit
`--pause-after-actions` on resume to continue until completion or another stopping condition.
Output files must be new paths. If preflight was selected for the original run, specify the same
selection on resume; its completed model calls are not repeated.

The CLI binds checkpoints to the effective target transport configuration and, when selected,
the independent judge transport/limits. Changed endpoints or credentials make that checkpoint
incompatible. Only digests are retained in public evidence. Judge configuration remains explicit
through `--judge-config`; checkpointing does not authorize an implicit judge.

The SDK uses the same engine through `ArtemisKit.createWorkflowSession()` and `runWorkflow()`:

```ts
import { ArtemisKit } from '@artemiskit/sdk';

const kit = new ArtemisKit({
  providerConfig: { apiKey: process.env.OPENAI_API_KEY },
});
const checkpoint = {
  directory: '.artemis-checkpoint',
  configurationId: 'approved-openai-transport-v1',
};
const paused = await kit.runWorkflow({
  workflow: 'examples/07-agentic/fault-recovery-workflow.yaml',
  checkpoint: { ...checkpoint, mode: 'create' },
  pauseAfterActions: 2,
});
// A later process uses the same authorized configuration and private directory.
const resumed = await kit.runWorkflow({
  workflow: 'examples/07-agentic/fault-recovery-workflow.yaml',
  checkpoint: { ...checkpoint, mode: 'resume' },
});
console.log(resumed.record.taskVerification, resumed.record.recovery);
```

For SDK clients and custom targets, the application owns `configurationId`: change it whenever
transport, credentials or implementation change materially. It is an explicit host attestation,
not a way for ArtemisKit to inspect an opaque client. Keep checkpoint directories out of version
control and shared artifact uploads. They contain sensitive working data even when ordinary saved
records are redacted. A final checkpoint is retained but cannot be resumed as another repetition.

A live session also supports `session.pause()` to request the next safe boundary. `session.cancel()`
continues to mean cancellation; interruption can leave a pending checkpoint that safely refuses
replay. Check the returned checkpoint status before promising resumability to a user.

## Qualification boundary

Milestone acceptance requires CLI and SDK separate-process restart, multi-call cursor restoration, duplicate and terminal restore refusal, pending-write and missing-usage refusal, expired/corrupt/incompatible checkpoints, budget and authority preservation, retry exhaustion, all declared fault categories, evidence redaction and truncation, historical record compatibility and fresh installed consumers. CI repair, external-system recovery and professional reports are outside 0.6.3.
