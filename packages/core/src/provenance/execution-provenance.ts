/** Bounded execution provenance derived from declared and observed run evidence. */

import type { CaseResult, ExecutionProvenance } from '../artifacts/types';

export function createExecutionProvenance(options: {
  provider: string;
  requestedModel?: string;
  temperature?: number;
  maxTokens?: number;
  seed?: number;
  cases: CaseResult[];
}): ExecutionProvenance {
  const requestedModels = uniqueStrings([
    options.requestedModel,
    ...options.cases.map((caseResult) => caseResult.target?.requested_model),
  ]);
  const observedModels = uniqueStrings(
    options.cases.flatMap((caseResult) => caseResult.target?.observed_models ?? [])
  );
  const evaluatorModels = uniqueStrings(
    options.cases.map((caseResult) => caseResult.evidence?.model)
  );
  const generation = omitUndefined({
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    seed: options.seed,
  });

  return {
    schema_version: '1',
    target: {
      provider: boundedString(options.provider, 100) ?? 'unknown',
      ...(requestedModels.length ? { requested_models: requestedModels } : {}),
      ...(observedModels.length ? { observed_models: observedModels } : {}),
      ...(Object.keys(generation).length ? { generation } : {}),
    },
    ...(evaluatorModels.length ? { evaluator: { models: evaluatorModels } } : {}),
  };
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => boundedString(value, 200)).filter(Boolean))] as string[];
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, maxLength) : undefined;
}

function omitUndefined<T extends Record<string, number | undefined>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>;
}
