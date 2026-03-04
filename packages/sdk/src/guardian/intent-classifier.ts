/**
 * Intent Classifier
 *
 * Analyzes AI/agent intent to determine what it's trying to accomplish,
 * not just the literal action. Uses pattern matching and optionally LLM-based
 * classification to detect potentially risky intents.
 */

import type { ModelClient } from '@artemiskit/core';
import { nanoid } from 'nanoid';
import type { GuardrailResult, IntentClassification, Violation, ViolationSeverity } from './types';

/**
 * Intent category definition
 */
export interface IntentCategory {
  name: string;
  description: string;
  riskLevel: ViolationSeverity;
  patterns?: RegExp[];
  keywords?: string[];
  examples?: string[];
  action?: 'allow' | 'warn' | 'block';
}

/**
 * Intent classifier configuration
 */
export interface IntentClassifierConfig {
  /** Pre-defined intent categories */
  categories?: IntentCategory[];
  /** Use LLM for classification */
  useLLM?: boolean;
  /** LLM client for classification */
  llmClient?: ModelClient;
  /** Minimum confidence threshold */
  confidenceThreshold?: number;
  /** Block unknown intents */
  blockUnknown?: boolean;
  /** Block high-risk intents */
  blockHighRisk?: boolean;
}

/**
 * Default intent categories for common risky patterns
 */
const DEFAULT_CATEGORIES: IntentCategory[] = [
  {
    name: 'data_exfiltration',
    description: 'Attempting to extract or transmit sensitive data',
    riskLevel: 'critical',
    action: 'block',
    patterns: [
      /send\s+(all|every|the)\s+(data|information|records|files)/i,
      /export\s+.*\s+(external|outside|remote)/i,
      /upload\s+.*\s+(server|cloud|external)/i,
      /transfer\s+.*\s+(data|files|records)/i,
    ],
    keywords: ['exfiltrate', 'steal', 'extract sensitive', 'leak data', 'send externally'],
  },
  {
    name: 'privilege_escalation',
    description: 'Attempting to gain elevated permissions',
    riskLevel: 'critical',
    action: 'block',
    patterns: [
      /become\s+(admin|root|superuser)/i,
      /grant\s+.*\s+(admin|root|all)\s+permissions/i,
      /elevate\s+.*\s+privileges/i,
      /bypass\s+.*\s+(auth|permission|security)/i,
    ],
    keywords: ['sudo', 'admin access', 'root access', 'elevated privileges', 'bypass security'],
  },
  {
    name: 'system_modification',
    description: 'Attempting to modify system configuration',
    riskLevel: 'high',
    action: 'warn',
    patterns: [
      /modify\s+.*\s+(system|config|settings)/i,
      /change\s+.*\s+(permissions|ownership)/i,
      /install\s+.*\s+(software|package|dependency)/i,
      /update\s+.*\s+(system|os|kernel)/i,
    ],
    keywords: ['system config', 'install package', 'modify settings', 'change permissions'],
  },
  {
    name: 'destructive_action',
    description: 'Attempting destructive operations',
    riskLevel: 'critical',
    action: 'block',
    patterns: [
      /delete\s+(all|every|\*)/i,
      /drop\s+(table|database|collection)/i,
      /remove\s+.*\s+(permanently|forever)/i,
      /destroy\s+.*\s+(data|files|records)/i,
      /wipe\s+.*\s+(clean|everything)/i,
    ],
    keywords: ['rm -rf', 'drop database', 'delete all', 'wipe clean', 'destroy'],
  },
  {
    name: 'sensitive_access',
    description: 'Attempting to access sensitive information',
    riskLevel: 'high',
    action: 'warn',
    patterns: [
      /access\s+.*\s+(password|secret|key|credential)/i,
      /read\s+.*\s+(\.env|config|secret)/i,
      /show\s+.*\s+(password|api.?key|token)/i,
      /list\s+.*\s+(credentials|secrets|keys)/i,
    ],
    keywords: ['api key', 'password', 'secret', 'credential', 'private key', 'access token'],
  },
  {
    name: 'reconnaissance',
    description: 'Gathering information about systems or infrastructure',
    riskLevel: 'medium',
    action: 'warn',
    patterns: [
      /scan\s+.*\s+(network|ports|hosts)/i,
      /enumerate\s+.*\s+(users|services|endpoints)/i,
      /discover\s+.*\s+(systems|services|hosts)/i,
      /list\s+.*\s+(all|every)\s+(user|service|endpoint)/i,
    ],
    keywords: ['port scan', 'network scan', 'enumerate', 'fingerprint', 'probe'],
  },
  {
    name: 'code_execution',
    description: 'Attempting to execute arbitrary code',
    riskLevel: 'critical',
    action: 'block',
    patterns: [
      /execute\s+.*\s+(command|script|code)/i,
      /run\s+.*\s+(shell|bash|command)/i,
      /eval\s*\(/i,
      /exec\s*\(/i,
    ],
    keywords: ['execute code', 'run command', 'shell command', 'eval', 'exec'],
  },
  {
    name: 'social_engineering',
    description: 'Attempting social engineering or manipulation',
    riskLevel: 'high',
    action: 'block',
    patterns: [
      /pretend\s+(to be|you are)/i,
      /impersonate\s+/i,
      /ignore\s+.*\s+(instructions|rules|guidelines)/i,
      /forget\s+.*\s+(previous|earlier)\s+(instructions|rules)/i,
    ],
    keywords: ['pretend to be', 'ignore instructions', 'forget rules', 'act as', 'jailbreak'],
  },
  {
    name: 'financial_transaction',
    description: 'Attempting financial operations',
    riskLevel: 'high',
    action: 'warn',
    patterns: [
      /transfer\s+.*\s+(money|funds|payment)/i,
      /send\s+.*\s+(payment|money)/i,
      /make\s+.*\s+(purchase|payment|transaction)/i,
      /withdraw\s+.*\s+(funds|money)/i,
    ],
    keywords: ['transfer funds', 'send payment', 'make purchase', 'withdraw money'],
  },
  {
    name: 'communication',
    description: 'Attempting to send communications',
    riskLevel: 'medium',
    action: 'warn',
    patterns: [
      /send\s+.*\s+(email|message|notification)/i,
      /post\s+.*\s+(message|comment|update)/i,
      /publish\s+.*\s+(content|article|post)/i,
    ],
    keywords: ['send email', 'post message', 'publish content', 'notify'],
  },
];

/**
 * Intent Classifier
 *
 * Analyzes text to determine the underlying intent and assess risk.
 */
export class IntentClassifier {
  private config: IntentClassifierConfig;
  private categories: IntentCategory[];

  constructor(config: IntentClassifierConfig = {}) {
    this.config = {
      confidenceThreshold: 0.7,
      blockUnknown: false,
      blockHighRisk: true,
      ...config,
    };
    this.categories = [...DEFAULT_CATEGORIES, ...(config.categories ?? [])];
  }

  /**
   * Classify the intent of a given text
   */
  async classify(text: string): Promise<IntentClassification[]> {
    const classifications: IntentClassification[] = [];

    // Pattern-based classification
    for (const category of this.categories) {
      let confidence = 0;
      let matches = 0;
      const totalChecks = (category.patterns?.length ?? 0) + (category.keywords?.length ?? 0);

      // Check patterns
      if (category.patterns) {
        for (const pattern of category.patterns) {
          if (pattern.test(text)) {
            matches++;
            confidence += 0.8; // Pattern matches are high confidence
          }
        }
      }

      // Check keywords
      if (category.keywords) {
        const lowerText = text.toLowerCase();
        for (const keyword of category.keywords) {
          if (lowerText.includes(keyword.toLowerCase())) {
            matches++;
            confidence += 0.5; // Keyword matches are medium confidence
          }
        }
      }

      if (matches > 0) {
        // Normalize confidence
        const normalizedConfidence = Math.min(1, confidence / Math.max(1, totalChecks));

        classifications.push({
          intent: category.name,
          confidence: normalizedConfidence,
          category: category.description,
          riskLevel: category.riskLevel,
        });
      }
    }

    // LLM-based classification if enabled
    if (this.config.useLLM && this.config.llmClient) {
      const llmClassifications = await this.classifyWithLLM(text);
      classifications.push(...llmClassifications);
    }

    // Sort by confidence descending
    classifications.sort((a, b) => b.confidence - a.confidence);

    return classifications;
  }

  /**
   * Create a guardrail function from this classifier
   */
  asGuardrail(): (content: string, context?: Record<string, unknown>) => Promise<GuardrailResult> {
    return async (content: string) => {
      const result = await this.validate(content);
      return result;
    };
  }

  /**
   * Validate content and return guardrail result
   */
  async validate(text: string): Promise<GuardrailResult> {
    const classifications = await this.classify(text);
    const violations: Violation[] = [];

    for (const classification of classifications) {
      if (classification.confidence < (this.config.confidenceThreshold ?? 0.7)) {
        continue;
      }

      const category = this.categories.find((c) => c.name === classification.intent);
      const action = category?.action ?? 'warn';
      const shouldBlock =
        action === 'block' ||
        (this.config.blockHighRisk === true &&
          (classification.riskLevel === 'high' || classification.riskLevel === 'critical'));

      if (action !== 'allow') {
        violations.push({
          id: nanoid(),
          type: 'intent_classification',
          severity: classification.riskLevel ?? 'medium',
          message: `Detected risky intent: ${classification.intent}`,
          details: {
            intent: classification.intent,
            confidence: classification.confidence,
            category: classification.category,
          },
          timestamp: new Date(),
          action: shouldBlock ? 'block' : 'warn',
          blocked: shouldBlock,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      metadata: { classifications },
    };
  }

  /**
   * Add a custom intent category
   */
  addCategory(category: IntentCategory): void {
    this.categories.push(category);
  }

  /**
   * Remove an intent category
   */
  removeCategory(name: string): void {
    this.categories = this.categories.filter((c) => c.name !== name);
  }

  /**
   * Get all categories
   */
  getCategories(): IntentCategory[] {
    return [...this.categories];
  }

  /**
   * Classify using LLM (for more nuanced understanding)
   */
  private async classifyWithLLM(text: string): Promise<IntentClassification[]> {
    if (!this.config.llmClient) {
      return [];
    }

    const prompt = `Analyze the following text and identify any potentially risky intents.
For each intent found, provide:
- intent: a short name for the intent
- confidence: a number between 0 and 1
- category: a brief description
- riskLevel: one of "low", "medium", "high", "critical"

Text to analyze:
"${text}"

Respond with a JSON array of intent objects. If no risky intents are found, respond with an empty array [].`;

    try {
      const result = await this.config.llmClient.generate({
        prompt,
        temperature: 0,
        maxTokens: 500,
      });

      // Parse JSON response
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed as IntentClassification[];
      }
    } catch {
      // Fall back to pattern-based only
    }

    return [];
  }
}

/**
 * Create a default intent classifier
 */
export function createIntentClassifier(config: IntentClassifierConfig = {}): IntentClassifier {
  return new IntentClassifier(config);
}
