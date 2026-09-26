# Workflow faults and durable recovery

Implementation contract for milestone 0.6.3. This draft describes the accepted design; it is not a shipped-capability claim until the release record contains integrated and distribution qualification.

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

Public evidence includes bounded fault, retry, state-change and recovery summaries, digests, counts and omitted-evidence counts. It excludes raw fixture outputs, instructions, file paths, model text and checkpoint locations. A finished run is still independently evaluated against its declared outcomes; recovery itself is not proof of task success.

## Qualification boundary

Milestone acceptance requires CLI and SDK separate-process restart, multi-call cursor restoration, duplicate and terminal restore refusal, pending-write and missing-usage refusal, expired/corrupt/incompatible checkpoints, budget and authority preservation, retry exhaustion, all declared fault categories, evidence redaction and truncation, historical record compatibility and fresh installed consumers. CI repair, external-system recovery and professional reports are outside 0.6.3.
