# Best Practices for Terminal Use by an AI Agent

This document describes safe, robust, and practical guidelines for an AI agent that launches and interacts with terminal processes. The focus is on preventing indefinite hangs and using timers intelligently so processes are allowed reasonable time to complete, while ensuring the agent can cleanly recover if a process stalls.

## Principles

- Assume any terminal process can hang, block on input, or never terminate.
- Prefer non-blocking interaction patterns (async or threads) over blocking waits.
- Enforce time limits but make them adaptive: permit longer runs when there is clear progress.
- Always perform deterministic cleanup (close fds, kill child processes, remove temp files).

## High-Level Strategy

1. Use a per-command timeout as the primary defense against indefinite waits.
2. Use a watchdog timer that can be extended when the process shows progress (output, CPU usage).
3. Escalate termination signals gracefully: request graceful shutdown first, then forcibly kill.
4. Keep an overall session timeout to avoid runaway multi-step operations.
5. Log timestamps, stdout/stderr, exit codes, and kill reasons for diagnostics and future tuning in project's `.claude/log` folder to allow for future referencing.

## Timeout and Leeway Recommendations

- Default timeout: choose a conservative default (for example, 30–120 seconds) depending on the task class.
- Adaptive leeway:
  - If a command is expected to be quick, multiply expected time by a factor (e.g., 1.5–2×) and add a small absolute buffer (e.g., +5–10s).
  - If the process produces regular output, extend the timeout incrementally (e.g., add N seconds after each output chunk).
  - If the process is CPU-bound and using >X% CPU for Y seconds, consider extending; if idle for prolonged time, prepare to terminate.
- For long-running but legitimate commands (backups, builds, downloads), use a much larger timeout or an alternate monitoring approach rather than the quick default.

## Progress Detection Heuristics

- Output heartbeat: if stdout/stderr yields data at reasonable intervals, treat this as progress and extend the timer.
- Resource heartbeat: if the child process consumes nontrivial CPU or performs I/O, prefer to wait.
- Checkpointing: prefer commands that can report progress (verbose flags, progress bars, logging) and use those signals.

## Implementation Patterns

- Non-blocking IO:
  - Use asynchronous subprocess APIs (async/await) or background threads reading stdout/stderr to avoid deadlocks on full pipes.
  - Read streams incrementally and flush to logs to detect activity.
- Watchdog timer:
  - Start a timer when the process launches.
  - Reset or extend the timer when progress is observed (output or resource usage).
  - On timeout, initiate escalation (see below).
- Escalation sequence:
  - Send SIGINT (or platform-appropriate interruption) first; wait a short grace period (e.g., 3–10s).
  - If still running, send SIGTERM; wait another grace period.
  - Finally send SIGKILL to ensure termination.
  - On Windows, use GenerateConsoleCtrlEvent, then TerminateProcess if necessary.
- Cleanup:
  - Close pipes and PTYs.
  - Reap child processes to avoid zombies.
  - Remove or mark temporary resources.
  - Persist partial outputs if useful for debugging or retry.

## Practical Guidelines

- Avoid commands that expect interactive input; if unavoidable, supply input programmatically or run in a PTY and set timeouts.
- Use utilities like `timeout` (Linux) or set process timeouts in your language runtime (e.g., subprocess.run(timeout=...)) when appropriate.
- Provide a configurable timeout per-command and per-session. Do not hard-code a single global value.
- For commands that can be resumed, save checkpoints so forced termination does not lose progress.
- Consider sandboxing commands (containers, chroot) to limit collateral damage if forced to kill them.

## Logging & Observability

- Record:
  - Command, args, environment, working directory.
  - Start and end timestamps.
  - Captured stdout/stderr up to a reasonable size (truncate if necessary).
  - Exit code or kill signal and reason (timeout, error).
- Expose progress metrics to upstream systems for dynamic timeout tuning (e.g., average runtime, frequency of output).
All in the `.claude/logs` folder.

## Example Timer Heuristic (pseudocode)

- expected_time = estimate_for_command(cmd)
- timeout = max(default_timeout, expected_time * factor + buffer)
- start process
- start watchdog with timeout
- while process running:
  - if stdout/Stderr receives data: extend watchdog by output_extension seconds
  - else if resource_usage indicates progress: extend by resource_extension seconds
  - else if watchdog expires: escalate termination
- collect logs and exit status

## Caveats & Edge Cases

- Beware of commands that produce occasional bursts separated by long silence; prefer longer initial timeouts or rely on resource heuristics.
- Pipes can block if output buffers fill; ensure reading is continuous to avoid deadlocks.
- PTYs may change buffering behavior (some programs detect TTY and alter output); use PTY only when necessary.
- Timeouts cannot replace correct program design. If an operation frequently needs forced termination, investigate the root cause.

## Checklist Before Launching a Terminal Command

- [ ] Determine expected runtime and set a configurable timeout.
- [ ] Use async/non-blocking IO to capture output.
- [ ] Implement a watchdog that can be extended on progress.
- [ ] Plan signal escalation and platform-specific termination strategy.
- [ ] Ensure logs and partial outputs are captured.
- [ ] Provide a safe default but allow per-command overrides.

By combining sensible defaults, adaptive timers, progress detection, and robust cleanup, an AI agent can safely interact with terminals while minimizing hangs and avoiding premature interruption of legitimate work.
