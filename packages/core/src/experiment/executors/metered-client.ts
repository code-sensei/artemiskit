/**
 * Request metering for one experiment attempt's model client.
 */

import type { GenerateResult, ModelClient } from '../../adapters/types';
import type { ExperimentAttemptUsage } from '../types';

export interface ClientMeter {
  /** Client to hand to the scenario runner. Every model request flows through it. */
  client: ModelClient;
  /**
   * Requests started so far, with total tokens only when every request has settled and
   * reported provider usage. Embedding requests never report tokens.
   */
  usage(): ExperimentAttemptUsage;
  /** True when a request was refused because the attempt's request budget was spent. */
  budgetStopped(): boolean;
}

/** Thrown in place of a model request that would exceed the attempt's request budget. */
class RequestBudgetExhaustedError extends Error {
  constructor() {
    super('Experiment request budget exhausted');
  }
}

/**
 * Wrap `client` so every `generate` and `embed` call is counted and refused once
 * `maxRequests` requests have started. Streaming is not exposed because the scenario runner
 * does not use it and an unmetered path would defeat the budget.
 */
export function meterClient(client: ModelClient, maxRequests: number): ClientMeter {
  let requests = 0;
  let tokens = 0;
  let outstanding = 0;
  let usageUnreported = false;
  let stopped = false;

  const admit = (): void => {
    if (requests >= maxRequests) {
      stopped = true;
      throw new RequestBudgetExhaustedError();
    }
    requests += 1;
    outstanding += 1;
  };

  const metered: ModelClient = {
    provider: client.provider,
    capabilities: () => client.capabilities(),
    async generate(options) {
      admit();
      try {
        const result = await client.generate(options);
        if (reportsUsage(result)) tokens += result.tokens.total;
        else usageUnreported = true;
        return result;
      } catch (error) {
        usageUnreported = true;
        throw error;
      } finally {
        outstanding -= 1;
      }
    },
  };

  const embed = client.embed?.bind(client);
  if (embed) {
    metered.embed = async (text, model) => {
      admit();
      // Embedding responses carry no token usage, so the attempt total becomes unknown.
      usageUnreported = true;
      try {
        return await embed(text, model);
      } finally {
        outstanding -= 1;
      }
    };
  }

  return {
    client: metered,
    usage: () => (usageUnreported || outstanding > 0 ? { requests } : { requests, tokens }),
    budgetStopped: () => stopped,
  };
}

function reportsUsage(result: GenerateResult): boolean {
  const total = result?.tokens?.total;
  return result?.usageAvailable !== false && Number.isSafeInteger(total) && total >= 0;
}
