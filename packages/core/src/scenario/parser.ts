/**
 * Scenario parser for YAML files
 */

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { ArtemisError } from '../utils/errors';
import { type Scenario, ScenarioSchema } from './schema';

/**
 * Parse a scenario from a YAML file
 */
export async function parseScenarioFile(filePath: string): Promise<Scenario> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return parseScenarioString(content, filePath);
  } catch (error) {
    if (error instanceof ArtemisError) {
      throw error;
    }
    throw new ArtemisError(`Failed to read scenario file: ${filePath}`, 'SCENARIO_READ_ERROR', {
      cause: error as Error,
    });
  }
}

/**
 * Parse a scenario from a YAML string
 */
export function parseScenarioString(content: string, source?: string): Scenario {
  try {
    const raw = parseYaml(content);
    const result = ScenarioSchema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');

      throw new ArtemisError(
        `Invalid scenario${source ? ` in ${source}` : ''}:\n${issues}`,
        'SCENARIO_VALIDATION_ERROR',
        { zodError: result.error }
      );
    }

    return result.data;
  } catch (error) {
    if (error instanceof ArtemisError) {
      throw error;
    }
    throw new ArtemisError(
      `Failed to parse scenario YAML${source ? ` from ${source}` : ''}`,
      'SCENARIO_PARSE_ERROR',
      { cause: error as Error }
    );
  }
}

/**
 * Validate a scenario object
 */
export function validateScenario(scenario: unknown): Scenario {
  const result = ScenarioSchema.safeParse(scenario);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');

    throw new ArtemisError(`Invalid scenario:\n${issues}`, 'SCENARIO_VALIDATION_ERROR', {
      zodError: result.error,
    });
  }

  return result.data;
}
