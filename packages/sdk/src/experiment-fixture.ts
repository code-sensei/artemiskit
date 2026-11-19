/**
 * Deterministic in-memory model client for fixture-mode experiments.
 *
 * Fixture runs exercise the full experiment pipeline (matrix, executor, evaluators, evidence,
 * reports) without any network access. Responses are fixed text, so fixture outcomes describe
 * the pipeline, never a model.
 */

import type {
  ExperimentTarget,
  GenerateOptions,
  GenerateResult,
  ModelClient,
} from '@artemiskit/core';
import { sha256Hex } from './experiment-files';

export const FIXTURE_PROVIDER = 'artemiskit-fixture';

/** Rough token estimate (about four characters per token) so usage is always reported. */
const CHARACTERS_PER_TOKEN = 4;

export interface ExperimentFixtureClientOptions {
  /**
   * Advertise structured tool use. The client accepts tool definitions but never calls a
   * tool, so a fixture workflow can run (the workflow engine requires tool support) and its
   * outcome depends only on the declared state and outcomes.
   */
  toolUse?: boolean;
}

/** Create the offline client bound to one fixture-mode target. */
export function createExperimentFixtureClient(
  target: ExperimentTarget,
  options: ExperimentFixtureClientOptions = {}
): ModelClient {
  const toolUse = options.toolUse === true;
  return {
    provider: FIXTURE_PROVIDER,
    async capabilities() {
      return { streaming: false, functionCalling: false, toolUse, maxContext: 128_000 };
    },
    async generate(options: GenerateOptions): Promise<GenerateResult> {
      const prompt = promptText(options.prompt);
      const text = `Fixture response from ${target.id}.`;
      const promptTokens = estimateTokens(prompt);
      const completionTokens = estimateTokens(text);
      return {
        id: `fixture-${sha256Hex(`${target.id}\n${prompt}`).slice(0, 16)}`,
        model: target.model,
        text,
        tokens: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
        },
        usageAvailable: true,
        latencyMs: 0,
        finishReason: 'stop',
      };
    },
  };
}

function promptText(prompt: GenerateOptions['prompt']): string {
  return typeof prompt === 'string' ? prompt : prompt.map((message) => message.content).join('\n');
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARACTERS_PER_TOKEN));
}
