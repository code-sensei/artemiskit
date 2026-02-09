/**
 * Scenario Validator
 *
 * Validates scenario files for:
 * 1. YAML syntax errors
 * 2. Schema violations (required fields, types)
 * 3. Semantic errors (duplicate IDs, undefined variables)
 * 4. Warnings (deprecated patterns)
 */

import { readFileSync } from 'node:fs';
import yaml from 'yaml';
import type { ZodError } from 'zod';
import { ScenarioSchema } from '../scenario/schema';
import type { ValidationIssue, ValidationResult, ValidatorOptions } from './types';

/**
 * Scenario validator class
 */
export class ScenarioValidator {
  private _options: ValidatorOptions;

  constructor(options: ValidatorOptions = {}) {
    this._options = options;
  }

  get options(): ValidatorOptions {
    return this._options;
  }

  /**
   * Validate a scenario file
   */
  validate(filePath: string): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // Read file content
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      errors.push({
        line: 1,
        message: `Failed to read file: ${error.message}`,
        rule: 'file-read',
        severity: 'error',
      });
      return { file: filePath, valid: false, errors, warnings };
    }

    // Level 1: YAML Syntax validation
    let parsed: unknown;
    try {
      parsed = yaml.parse(content, {
        prettyErrors: true,
        strict: true,
      });
    } catch (err) {
      if (err instanceof yaml.YAMLError) {
        const linePos = err.linePos?.[0];
        errors.push({
          line: linePos?.line || 1,
          column: linePos?.col,
          message: `Invalid YAML syntax: ${err.message}`,
          rule: 'yaml-syntax',
          severity: 'error',
        });
      } else {
        errors.push({
          line: 1,
          message: `YAML parse error: ${(err as Error).message}`,
          rule: 'yaml-syntax',
          severity: 'error',
        });
      }
      return { file: filePath, valid: false, errors, warnings };
    }

    // Check if parsed result is null or not an object
    if (parsed === null || typeof parsed !== 'object') {
      errors.push({
        line: 1,
        message: 'Scenario must be a YAML object',
        rule: 'schema-type',
        severity: 'error',
      });
      return { file: filePath, valid: false, errors, warnings };
    }

    // Level 2: Schema validation using Zod
    const schemaResult = ScenarioSchema.safeParse(parsed);
    if (!schemaResult.success) {
      const zodErrors = this.formatZodErrors(schemaResult.error, content);
      errors.push(...zodErrors);
    }

    // Level 3: Semantic validation (only if schema passed)
    if (schemaResult.success) {
      const semanticErrors = this.validateSemantics(schemaResult.data, content);
      errors.push(...semanticErrors);
    }

    // Level 4: Warnings detection
    const detectedWarnings = this.detectWarnings(parsed, content);
    warnings.push(...detectedWarnings);

    return {
      file: filePath,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Format Zod errors into ValidationIssues
   */
  private formatZodErrors(error: ZodError, content: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const lines = content.split('\n');

    for (const issue of error.issues) {
      const path = issue.path.join('.');
      const line = this.findLineForPath(lines, issue.path);

      let message: string;
      switch (issue.code) {
        case 'invalid_type':
          message = `'${path}' expected ${issue.expected}, received ${issue.received}`;
          break;
        case 'invalid_enum_value':
          message = `'${path}' must be one of: ${(issue as { options: string[] }).options.join(', ')}`;
          break;
        case 'too_small':
          if ((issue as { type: string }).type === 'array') {
            message = `'${path}' must have at least ${(issue as { minimum: number }).minimum} item(s)`;
          } else {
            message = `'${path}' is too small`;
          }
          break;
        case 'unrecognized_keys':
          message = `Unrecognized field(s): ${(issue as { keys: string[] }).keys.join(', ')}`;
          break;
        default:
          message = issue.message;
      }

      issues.push({
        line,
        message,
        rule: `schema-${issue.code}`,
        severity: 'error',
      });
    }

    return issues;
  }

  /**
   * Find approximate line number for a YAML path
   */
  private findLineForPath(lines: string[], path: (string | number)[]): number {
    if (path.length === 0) return 1;

    // Simple heuristic: search for the key in the file
    const searchKey = String(path[path.length - 1]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check if line contains the key (accounting for YAML formatting)
      if (line.includes(`${searchKey}:`) || line.includes(`- ${searchKey}:`)) {
        return i + 1; // 1-indexed
      }
      // For array indices, look for "- id:" pattern
      if (typeof path[path.length - 1] === 'number' && path.includes('cases')) {
        if (line.trim().startsWith('- id:')) {
          return i + 1;
        }
      }
    }

    return 1; // Default to first line
  }

  /**
   * Validate semantic rules
   */
  private validateSemantics(
    scenario: {
      cases: Array<{ id: string; prompt: string | unknown; variables?: Record<string, unknown> }>;
      variables?: Record<string, unknown>;
    },
    content: string
  ): ValidationIssue[] {
    const errors: ValidationIssue[] = [];
    const lines = content.split('\n');

    // Check for duplicate case IDs
    const caseIds = new Set<string>();
    for (const testCase of scenario.cases) {
      if (caseIds.has(testCase.id)) {
        const line = this.findLineForCaseId(lines, testCase.id);
        errors.push({
          line,
          message: `Duplicate case ID: '${testCase.id}'`,
          rule: 'duplicate-case-id',
          severity: 'error',
        });
      }
      caseIds.add(testCase.id);
    }

    // Check variable references
    const globalVars = scenario.variables || {};
    for (const testCase of scenario.cases) {
      const caseVars = testCase.variables || {};
      const allVars = { ...globalVars, ...caseVars };

      const prompt =
        typeof testCase.prompt === 'string' ? testCase.prompt : JSON.stringify(testCase.prompt);

      const refs = this.extractVariableRefs(prompt);
      for (const ref of refs) {
        if (!(ref in allVars)) {
          const line = this.findLineForCaseId(lines, testCase.id);
          errors.push({
            line,
            message: `Undefined variable '{{${ref}}}' in case '${testCase.id}'`,
            rule: 'undefined-variable',
            severity: 'error',
            suggestion: `Define '${ref}' in scenario.variables or case.variables`,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Find line number for a case ID
   */
  private findLineForCaseId(lines: string[], caseId: string): number {
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes(`id: ${caseId}`) ||
        lines[i].includes(`id: "${caseId}"`) ||
        lines[i].includes(`id: '${caseId}'`)
      ) {
        return i + 1;
      }
    }
    return 1;
  }

  /**
   * Extract variable references from a string ({{varName}} format)
   */
  private extractVariableRefs(text: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const refs: string[] = [];
    const matches = text.matchAll(regex);
    for (const match of matches) {
      refs.push(match[1]);
    }
    return refs;
  }

  /**
   * Detect warnings (non-blocking issues)
   */
  private detectWarnings(parsed: unknown, content: string): ValidationIssue[] {
    const warnings: ValidationIssue[] = [];
    const lines = content.split('\n');

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;

      // Check for deprecated 'criteria' field (should be 'rubric' for llm_grader)
      if (this.hasDeepKey(obj, 'criteria')) {
        const line = this.findLineForKey(lines, 'criteria');
        warnings.push({
          line,
          message: "'criteria' is deprecated, use 'rubric' instead (llm_grader)",
          rule: 'deprecated-field',
          severity: 'warning',
          suggestion: "Replace 'criteria' with 'rubric'",
        });
      }

      // Check for very large number of cases without parallel recommendation
      const cases = obj.cases as unknown[] | undefined;
      if (Array.isArray(cases) && cases.length > 20) {
        warnings.push({
          line: 1,
          message: `Scenario has ${cases.length} cases. Consider using --parallel for faster execution.`,
          rule: 'performance-hint',
          severity: 'warning',
        });
      }

      // Check for missing description
      if (!obj.description) {
        warnings.push({
          line: 1,
          message:
            "Scenario is missing 'description' field. Adding a description improves documentation.",
          rule: 'missing-description',
          severity: 'warning',
        });
      }
    }

    return warnings;
  }

  /**
   * Check if object has a key at any depth
   */
  private hasDeepKey(obj: unknown, key: string): boolean {
    if (obj === null || typeof obj !== 'object') return false;

    if (key in (obj as Record<string, unknown>)) return true;

    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (this.hasDeepKey(value, key)) return true;
    }

    return false;
  }

  /**
   * Find line number for a key
   */
  private findLineForKey(lines: string[], key: string): number {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`${key}:`)) {
        return i + 1;
      }
    }
    return 1;
  }
}
