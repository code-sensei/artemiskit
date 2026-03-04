/**
 * Action Validator
 *
 * Validates tool/function calls before execution.
 * Ensures agents only perform allowed actions with valid parameters.
 */

import { nanoid } from 'nanoid';
import type {
  ActionDefinition,
  ActionParameter,
  GuardrailResult,
  InterceptedToolCall,
  ParameterValidation,
  Violation,
  ViolationSeverity,
} from './types';

/**
 * Action validation result
 */
export interface ActionValidationResult {
  valid: boolean;
  violations: Violation[];
  sanitizedArguments?: Record<string, unknown>;
  requiresApproval?: boolean;
}

/**
 * Action validator configuration
 */
export interface ActionValidatorConfig {
  /** Allowed actions with their definitions */
  allowedActions?: ActionDefinition[];
  /** Default behavior for undefined actions */
  defaultAllow?: boolean;
  /** Default risk level for undefined actions */
  defaultRiskLevel?: ViolationSeverity;
  /** Block high-risk actions automatically */
  blockHighRisk?: boolean;
  /** Custom validation function */
  customValidator?: (toolCall: InterceptedToolCall) => Promise<ActionValidationResult>;
}

/**
 * Action Validator
 *
 * Validates tool/function calls against defined policies.
 */
export class ActionValidator {
  private config: ActionValidatorConfig;
  private actionMap: Map<string, ActionDefinition>;
  private callHistory: InterceptedToolCall[];
  private callCounts: Map<string, { count: number; windowStart: number }>;

  constructor(config: ActionValidatorConfig = {}) {
    this.config = {
      defaultAllow: false,
      defaultRiskLevel: 'medium',
      blockHighRisk: true,
      ...config,
    };
    this.actionMap = new Map();
    this.callHistory = [];
    this.callCounts = new Map();

    // Index allowed actions
    if (config.allowedActions) {
      for (const action of config.allowedActions) {
        this.actionMap.set(action.name, action);
      }
    }
  }

  /**
   * Validate a tool/function call
   */
  async validate(toolCall: InterceptedToolCall): Promise<ActionValidationResult> {
    const violations: Violation[] = [];
    let sanitizedArguments = { ...toolCall.arguments };
    let requiresApproval = false;

    // Record the call
    this.callHistory.push(toolCall);

    // Get action definition
    const actionDef = this.actionMap.get(toolCall.toolName);

    // Check if action is defined
    if (!actionDef) {
      if (!this.config.defaultAllow) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: this.config.defaultRiskLevel ?? 'medium',
          message: `Unknown action: ${toolCall.toolName}`,
          details: { toolName: toolCall.toolName },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
      }
    } else {
      // Check if action is allowed
      if (actionDef.allowed === false) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: actionDef.riskLevel ?? 'high',
          message: `Action not allowed: ${toolCall.toolName}`,
          details: { toolName: toolCall.toolName, reason: 'explicitly_disabled' },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
      }

      // Check rate limits
      const rateLimitViolation = this.checkRateLimit(toolCall.toolName, actionDef);
      if (rateLimitViolation) {
        violations.push(rateLimitViolation);
      }

      // Check if requires approval
      if (actionDef.requiresApproval) {
        requiresApproval = true;
      }

      // Block high-risk actions if configured
      if (
        this.config.blockHighRisk &&
        (actionDef.riskLevel === 'high' || actionDef.riskLevel === 'critical')
      ) {
        if (!requiresApproval) {
          // Auto-block unless approval is required
          violations.push({
            id: nanoid(),
            type: 'action_validation',
            severity: actionDef.riskLevel,
            message: `High-risk action blocked: ${toolCall.toolName}`,
            details: { toolName: toolCall.toolName, riskLevel: actionDef.riskLevel },
            timestamp: new Date(),
            action: 'block',
            blocked: true,
          });
        }
      }

      // Validate parameters
      if (actionDef.parameters) {
        const paramResult = this.validateParameters(toolCall.arguments, actionDef.parameters);
        violations.push(...paramResult.violations);
        if (paramResult.sanitized) {
          sanitizedArguments = paramResult.sanitized;
        }
      }
    }

    // Run custom validator if provided
    if (this.config.customValidator) {
      const customResult = await this.config.customValidator(toolCall);
      violations.push(...customResult.violations);
      if (customResult.sanitizedArguments) {
        sanitizedArguments = customResult.sanitizedArguments;
      }
      if (customResult.requiresApproval) {
        requiresApproval = true;
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      sanitizedArguments,
      requiresApproval,
    };
  }

  /**
   * Create a guardrail function from this validator
   */
  asGuardrail(): (content: string, context?: Record<string, unknown>) => Promise<GuardrailResult> {
    return async (_content: string, context?: Record<string, unknown>) => {
      // Extract tool call from context if available
      const toolCall = context?.toolCall as InterceptedToolCall | undefined;

      if (!toolCall) {
        return { passed: true, violations: [] };
      }

      const result = await this.validate(toolCall);
      return {
        passed: result.valid,
        violations: result.violations,
      };
    };
  }

  /**
   * Register an allowed action
   */
  registerAction(action: ActionDefinition): void {
    this.actionMap.set(action.name, action);
  }

  /**
   * Remove an action from allowed list
   */
  unregisterAction(name: string): void {
    this.actionMap.delete(name);
  }

  /**
   * Get all registered actions
   */
  getRegisteredActions(): ActionDefinition[] {
    return Array.from(this.actionMap.values());
  }

  /**
   * Get call history
   */
  getCallHistory(): InterceptedToolCall[] {
    return [...this.callHistory];
  }

  /**
   * Clear call history
   */
  clearHistory(): void {
    this.callHistory = [];
    this.callCounts.clear();
  }

  /**
   * Check rate limit for an action
   */
  private checkRateLimit(toolName: string, actionDef: ActionDefinition): Violation | null {
    if (!actionDef.maxCallsPerMinute) {
      return null;
    }

    const now = Date.now();
    const windowMs = 60000; // 1 minute
    let entry = this.callCounts.get(toolName);

    if (!entry || now - entry.windowStart >= windowMs) {
      // Start new window
      entry = { count: 1, windowStart: now };
      this.callCounts.set(toolName, entry);
      return null;
    }

    entry.count++;

    if (entry.count > actionDef.maxCallsPerMinute) {
      return {
        id: nanoid(),
        type: 'rate_limit',
        severity: 'medium',
        message: `Rate limit exceeded for action: ${toolName}`,
        details: {
          toolName,
          limit: actionDef.maxCallsPerMinute,
          current: entry.count,
        },
        timestamp: new Date(),
        action: 'block',
        blocked: true,
      };
    }

    return null;
  }

  /**
   * Validate parameters against definitions
   */
  private validateParameters(
    args: Record<string, unknown>,
    params: ActionParameter[]
  ): { violations: Violation[]; sanitized: Record<string, unknown> | null } {
    const violations: Violation[] = [];
    const sanitized = { ...args };

    for (const param of params) {
      const value = args[param.name];

      // Check required
      if (param.required && (value === undefined || value === null)) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: 'medium',
          message: `Missing required parameter: ${param.name}`,
          details: { parameter: param.name },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
        continue;
      }

      if (value === undefined || value === null) {
        continue;
      }

      // Type checking
      if (!this.checkType(value, param.type)) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: 'medium',
          message: `Invalid type for parameter: ${param.name} (expected ${param.type})`,
          details: { parameter: param.name, expected: param.type, actual: typeof value },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
      }

      // Run validation rules
      if (param.validation) {
        const validationViolations = this.runValidation(param.name, value, param.validation);
        violations.push(...validationViolations);
      }
    }

    return {
      violations,
      sanitized: violations.length === 0 ? sanitized : null,
    };
  }

  /**
   * Check if value matches expected type
   */
  private checkType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Run validation rules on a parameter value
   */
  private runValidation(
    paramName: string,
    value: unknown,
    validation: ParameterValidation
  ): Violation[] {
    const violations: Violation[] = [];
    const strValue = String(value);

    // Pattern matching
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(strValue)) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: 'medium',
          message: `Parameter ${paramName} does not match required pattern`,
          details: { parameter: paramName, pattern: validation.pattern },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
      }
    }

    // Length checks for strings
    if (typeof value === 'string') {
      if (validation.minLength && value.length < validation.minLength) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: 'low',
          message: `Parameter ${paramName} is too short (min: ${validation.minLength})`,
          details: { parameter: paramName, minLength: validation.minLength },
          timestamp: new Date(),
          action: 'warn',
          blocked: false,
        });
      }
      if (validation.maxLength && value.length > validation.maxLength) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: 'medium',
          message: `Parameter ${paramName} is too long (max: ${validation.maxLength})`,
          details: { parameter: paramName, maxLength: validation.maxLength },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
      }
    }

    // Numeric range checks
    if (typeof value === 'number') {
      if (validation.minValue !== undefined && value < validation.minValue) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: 'medium',
          message: `Parameter ${paramName} is below minimum (min: ${validation.minValue})`,
          details: { parameter: paramName, minValue: validation.minValue },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
      }
      if (validation.maxValue !== undefined && value > validation.maxValue) {
        violations.push({
          id: nanoid(),
          type: 'action_validation',
          severity: 'medium',
          message: `Parameter ${paramName} exceeds maximum (max: ${validation.maxValue})`,
          details: { parameter: paramName, maxValue: validation.maxValue },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
      }
    }

    // Allowed values check
    if (validation.allowedValues && !validation.allowedValues.includes(value as string | number)) {
      violations.push({
        id: nanoid(),
        type: 'action_validation',
        severity: 'medium',
        message: `Parameter ${paramName} has invalid value`,
        details: {
          parameter: paramName,
          value,
          allowedValues: validation.allowedValues,
        },
        timestamp: new Date(),
        action: 'block',
        blocked: true,
      });
    }

    // Blocked values check
    if (validation.blockedValues?.includes(value as string | number)) {
      violations.push({
        id: nanoid(),
        type: 'action_validation',
        severity: 'high',
        message: `Parameter ${paramName} contains blocked value`,
        details: { parameter: paramName, value },
        timestamp: new Date(),
        action: 'block',
        blocked: true,
      });
    }

    // Blocked patterns check
    if (validation.blockedPatterns) {
      for (const pattern of validation.blockedPatterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(strValue)) {
          violations.push({
            id: nanoid(),
            type: 'action_validation',
            severity: 'high',
            message: `Parameter ${paramName} matches blocked pattern`,
            details: { parameter: paramName, pattern },
            timestamp: new Date(),
            action: 'block',
            blocked: true,
          });
        }
      }
    }

    return violations;
  }
}

/**
 * Create a pre-configured action validator with common dangerous actions blocked
 */
export function createDefaultActionValidator(): ActionValidator {
  return new ActionValidator({
    defaultAllow: true,
    blockHighRisk: true,
    allowedActions: [
      // File operations - high risk
      {
        name: 'delete_file',
        description: 'Delete a file from the filesystem',
        category: 'filesystem',
        riskLevel: 'critical',
        allowed: false,
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        category: 'filesystem',
        riskLevel: 'high',
        requiresApproval: true,
        parameters: [
          {
            name: 'path',
            type: 'string',
            required: true,
            validation: {
              blockedPatterns: ['\\.env', 'credentials', 'password', 'secret', '/etc/', '/root/'],
            },
          },
        ],
      },
      // Network operations
      {
        name: 'http_request',
        description: 'Make an HTTP request',
        category: 'network',
        riskLevel: 'medium',
        maxCallsPerMinute: 60,
        parameters: [
          {
            name: 'url',
            type: 'string',
            required: true,
            validation: {
              blockedPatterns: [
                'localhost',
                '127\\.0\\.0\\.1',
                '0\\.0\\.0\\.0',
                'internal',
                '\\.local',
              ],
            },
          },
        ],
      },
      // Database operations
      {
        name: 'execute_sql',
        description: 'Execute SQL query',
        category: 'database',
        riskLevel: 'critical',
        allowed: false,
      },
      {
        name: 'query_database',
        description: 'Read-only database query',
        category: 'database',
        riskLevel: 'medium',
        maxCallsPerMinute: 100,
      },
      // System operations
      {
        name: 'execute_command',
        description: 'Execute a shell command',
        category: 'system',
        riskLevel: 'critical',
        allowed: false,
      },
      // Email/messaging
      {
        name: 'send_email',
        description: 'Send an email',
        category: 'communication',
        riskLevel: 'high',
        requiresApproval: true,
        maxCallsPerMinute: 10,
      },
    ],
  });
}
