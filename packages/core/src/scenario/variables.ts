/**
 * Variable substitution for scenario templates
 * Supports {{variable}} syntax in strings
 */

import type { Variables } from './schema';

/**
 * Substitute variables in a string using {{variable}} syntax
 */
export function substituteString(str: string, variables: Variables): string {
  return str.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    if (varName in variables) {
      return String(variables[varName]);
    }
    // Leave unmatched variables as-is
    return match;
  });
}

/**
 * Recursively substitute variables in an object
 * Only substitutes in string values, preserving other types
 */
export function substituteVariables<T>(obj: T, variables: Variables): T {
  if (!variables || Object.keys(variables).length === 0) {
    return obj;
  }

  if (typeof obj === 'string') {
    return substituteString(obj, variables) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => substituteVariables(item, variables)) as T;
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteVariables(value, variables);
    }
    return result as T;
  }

  return obj;
}

/**
 * Merge variables with case-level overriding scenario-level
 */
export function mergeVariables(
  scenarioVars: Variables | undefined,
  caseVars: Variables | undefined
): Variables {
  return {
    ...scenarioVars,
    ...caseVars,
  };
}
