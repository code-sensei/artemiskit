import { createHash } from 'node:crypto';
import { type WorkflowOutcomeDecision, decideWorkflowOutcome } from './outcome-status';
import {
  type WorkflowDeterministicSummary,
  evaluateWorkflowDeterministicOutcomes,
} from './outcomes';
import type { AgentWorkflow } from './schema';
import {
  type WorkflowJudgeOptions,
  type WorkflowSemanticEvaluation,
  evaluateWorkflowSemantics,
} from './semantic';
import type { AgentWorkflowResult } from './session';

export interface WorkflowOutcomeAssessment extends WorkflowOutcomeDecision {
  schemaVersion: '1';
  configurationSha256?: string;
  stateSha256?: string;
  cancelled: boolean;
  deterministic: WorkflowDeterministicSummary;
  semantic: WorkflowSemanticEvaluation;
}

const counts = () => ({ declared: 0, passed: 0, failed: 0, invalid: 0, unavailable: 0, valid: 0 });

/** Unevaluated placeholder, also used for capability-only sessions. */
export function emptyWorkflowAssessment(): WorkflowOutcomeAssessment {
  return {
    schemaVersion: '1',
    status: 'unavailable',
    reason: 'execution_incomplete',
    task: { eligible: 0, passed: 0, failed: 0 },
    cancelled: false,
    deterministic: { status: 'unavailable', assertions: [], counts: counts() },
    semantic: {
      assertions: [],
      counts: counts(),
      capability: { jsonMode: null, transportCancellation: null },
      usage: {
        status: 'unavailable',
        reported: { prompt: 0, completion: 0, total: 0 },
        missingRequests: 0,
        inFlightUnknown: false,
        pendingOperations: 0,
      },
      budgets: {
        requests: 0,
        requestAccounting: 'client_invocations',
        transportAttempts: 'unavailable',
        tokenOvershoot: 0,
        elapsedMs: 0,
      },
      evidence: { status: 'unavailable', limitBytes: 65_536 },
    },
  };
}

/** Required deterministic evidence gates optional judge spending and the final task decision. */
export async function assessWorkflowOutcome(options: {
  workflow?: AgentWorkflow;
  result: AgentWorkflowResult;
  judge?: WorkflowJudgeOptions;
  signal: AbortSignal;
}): Promise<WorkflowOutcomeAssessment> {
  const { workflow, result, signal } = options;
  const assessment = emptyWorkflowAssessment();
  if (result.record.configuration)
    assessment.configurationSha256 = result.record.configuration.sha256;
  if (result.record.artifacts.stateSha256)
    assessment.stateSha256 = result.record.artifacts.stateSha256;
  if (workflow && result.record.purpose === 'workflow') {
    assessment.deterministic = evaluateWorkflowDeterministicOutcomes(workflow, result);
    const preliminary = decideWorkflowOutcome({
      purpose: result.record.purpose,
      record: result.record,
      deterministic: assessment.deterministic.counts,
      semantic: counts(),
      cancelled: signal.aborted,
    });
    if (preliminary.status === 'passed') {
      assessment.semantic = await evaluateWorkflowSemantics({
        workflow,
        result,
        judge: options.judge,
        signal,
      });
    } else {
      assessment.semantic.assertions = (workflow.outcomes.semantic ?? []).map(
        (criterion, index) => ({
          index,
          status: 'unavailable',
          reason: 'prerequisite_failed',
          criterionSha256: createHash('sha256').update(JSON.stringify(criterion)).digest('hex'),
        })
      );
      assessment.semantic.counts.declared = assessment.semantic.assertions.length;
      assessment.semantic.counts.unavailable = assessment.semantic.assertions.length;
    }
  }
  assessment.cancelled = signal.aborted;
  return {
    ...assessment,
    ...decideWorkflowOutcome({
      purpose: result.record.purpose,
      record: result.record,
      deterministic: assessment.deterministic.counts,
      semantic: assessment.semantic.counts,
      cancelled: assessment.cancelled,
    }),
  };
}
