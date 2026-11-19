/**
 * Target generation settings.
 *
 * An experiment target may declare its own sampling and output length in `settings`, so one
 * workload can run with each model's recommended generation configuration. Declared values
 * replace the scenario's own for that target's model requests only; evaluator (`llm_grader`)
 * and embedding requests keep their own settings.
 */

/** Generation keys a target may declare in `settings`, in display order. */
export const GENERATION_SETTING_KEYS = [
  'temperature',
  'top_p',
  'top_k',
  'min_p',
  'presence_penalty',
  'max_output_tokens',
] as const;

export type GenerationSettingKey = (typeof GENERATION_SETTING_KEYS)[number];

/** Declared generation values, keyed as written in target settings. */
export type GenerationSettings = Partial<Record<GenerationSettingKey, number>>;

interface GenerationSettingRange {
  minimum: number;
  maximum: number;
  integer: boolean;
}

/** Upper bound for `max_output_tokens`. */
export const MAX_OUTPUT_TOKENS_LIMIT = 131072;

export const GENERATION_SETTING_RANGES: Readonly<
  Record<GenerationSettingKey, GenerationSettingRange>
> = {
  temperature: { minimum: 0, maximum: 2, integer: false },
  top_p: { minimum: 0, maximum: 1, integer: false },
  top_k: { minimum: 1, maximum: Number.MAX_SAFE_INTEGER, integer: true },
  min_p: { minimum: 0, maximum: 1, integer: false },
  presence_penalty: { minimum: -2, maximum: 2, integer: false },
  max_output_tokens: { minimum: 1, maximum: MAX_OUTPUT_TOKENS_LIMIT, integer: true },
};

/**
 * Generation values a scenario run applies to target requests instead of the scenario's own.
 * Only fields a `GenerateOptions` request can carry: `top_k` and `min_p` have no transport.
 */
export interface GenerationOverrides {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
}

/** Declared keys that no built-in request transport sends. */
export const UNTRANSPORTED_GENERATION_SETTINGS: readonly GenerationSettingKey[] = [
  'top_k',
  'min_p',
];

export interface GenerationSettingIssue {
  key: GenerationSettingKey;
  message: string;
}

export function isGenerationSettingKey(key: string): key is GenerationSettingKey {
  return (GENERATION_SETTING_KEYS as readonly string[]).includes(key);
}

/** Human-readable accepted range, for example `a number from 0 to 2`. */
export function describeGenerationSettingRange(key: GenerationSettingKey): string {
  const range = GENERATION_SETTING_RANGES[key];
  if (range.maximum === Number.MAX_SAFE_INTEGER) return `an integer of at least ${range.minimum}`;
  return `${range.integer ? 'an integer' : 'a number'} from ${range.minimum} to ${range.maximum}`;
}

/**
 * Read the generation keys from target settings. Other keys are ignored here; values outside
 * their range, or not numbers, are returned as issues and left out of `settings`.
 */
export function readGenerationSettings(settings: Record<string, unknown> | undefined): {
  settings: GenerationSettings;
  issues: GenerationSettingIssue[];
} {
  const declared: GenerationSettings = {};
  const issues: GenerationSettingIssue[] = [];
  for (const key of GENERATION_SETTING_KEYS) {
    if (!settings || !Object.hasOwn(settings, key)) continue;
    const value = settings[key];
    const range = GENERATION_SETTING_RANGES[key];
    const valid =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= range.minimum &&
      value <= range.maximum &&
      (!range.integer || Number.isSafeInteger(value));
    if (valid) declared[key] = value;
    else
      issues.push({
        key,
        message: `settings.${key} must be ${describeGenerationSettingRange(key)}`,
      });
  }
  return { settings: declared, issues };
}

/** Map declared settings onto the request overrides the runner applies. */
export function toGenerationOverrides(settings: GenerationSettings): GenerationOverrides {
  const overrides: GenerationOverrides = {};
  if (settings.temperature !== undefined) overrides.temperature = settings.temperature;
  if (settings.max_output_tokens !== undefined) overrides.maxTokens = settings.max_output_tokens;
  if (settings.top_p !== undefined) overrides.topP = settings.top_p;
  if (settings.presence_penalty !== undefined) {
    overrides.presencePenalty = settings.presence_penalty;
  }
  return overrides;
}
