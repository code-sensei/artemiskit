import { type AgentAction, createDefaultRedactor } from '@artemiskit/core';
import type { SanitizedTrueForgeEvent, TrueForgeEvent } from './types';

const REDACTED = '[REDACTED]';
const CORE_REDACTOR = createDefaultRedactor();
const SENSITIVE_KEYS = new Set([
  'apikey',
  'authorization',
  'cookie',
  'idtoken',
  'password',
  'refreshtoken',
  'secret',
  'setcookie',
  'token',
  'accesstoken',
]);
const SECRET_ASSIGNMENT_PATTERN =
  /\b(password|secret|token|apikey|api_key|auth)(\s*[=:]\s*)(['"]?)([^\s'"]+)/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*\b/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeTrueForgeText(
  text: string,
  sensitiveValues: readonly string[] = []
): string {
  let result = text.replace(
    SECRET_ASSIGNMENT_PATTERN,
    (_match, _key: string, _separator: string, quote: string) => `${quote}${REDACTED}`
  );
  result = CORE_REDACTOR.redact(result).text;
  result = result.replace(JWT_PATTERN, REDACTED);
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue.length > 0) {
      result = result.replace(new RegExp(escapeRegExp(sensitiveValue), 'g'), REDACTED);
    }
  }
  return result;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_]/g, '').toLowerCase();
  return SENSITIVE_KEYS.has(normalized) || normalized.endsWith('apikey');
}

function sanitizeValue(value: unknown, sensitiveValues: readonly string[], key?: string): unknown {
  if (key && isSensitiveKey(key)) return REDACTED;
  if (typeof value === 'string') return sanitizeTrueForgeText(value, sensitiveValues);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, sensitiveValues));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, sensitiveValues, entryKey),
      ])
    );
  }
  return value;
}

export function sanitizeTrueForgeEvents(
  events: readonly TrueForgeEvent[],
  sensitiveValues: readonly string[] = []
): SanitizedTrueForgeEvent[] {
  return events.map((event) => sanitizeValue(event, sensitiveValues) as SanitizedTrueForgeEvent);
}

function actionType(name: string): AgentAction['type'] {
  if (/(?:^|_)(?:run|command|exec|shell)(?:$|_)/i.test(name)) return 'command';
  if (/(?:^|_)(?:read|write|patch|file)(?:$|_)/i.test(name)) return 'file';
  return 'tool';
}

function normalizeToolName(name: string): string {
  const segments = name.split(/__|[/:.]/).filter(Boolean);
  return segments.at(-1) ?? name;
}

function responseStatus(content: string): AgentAction['status'] {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.isError === true || parsed.error !== undefined) return 'error';
    if (typeof parsed.exitCode === 'number' && parsed.exitCode !== 0) return 'error';
    if (parsed.status === 'error' || parsed.status === 'rejected') return parsed.status;
  } catch {
    if (/\b(?:error|denied|rejected|failed)\b/i.test(content)) return 'error';
  }
  return 'success';
}

function timestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const result = Date.parse(value);
  return Number.isNaN(result) ? undefined : result;
}

export function normalizeTrueForgeActions(
  events: readonly TrueForgeEvent[],
  sensitiveValues: readonly string[] = []
): AgentAction[] {
  const pending = new Map<
    string,
    { name: string; startedAt?: number; type: AgentAction['type'] }
  >();
  const actions: AgentAction[] = [];

  for (const event of events) {
    if (event.type === 'model.message') {
      const startedAt = timestamp(event.createdAt);
      for (const toolCall of event.toolCalls ?? []) {
        const name = normalizeToolName(toolCall.toolInfo.name || toolCall.function.name);
        pending.set(toolCall.id, { name, startedAt, type: actionType(name) });
      }
      continue;
    }

    if (event.type !== 'tool.response') continue;
    const call = pending.get(event.toolCallId);
    const completedAt = timestamp(event.createdAt);
    const durationMs =
      call?.startedAt !== undefined && completedAt !== undefined
        ? Math.max(0, completedAt - call.startedAt)
        : 0;
    actions.push({
      type: call?.type ?? 'tool',
      name: call?.name ?? event.toolCallId,
      status: responseStatus(event.content),
      durationMs,
      summary: sanitizeTrueForgeText(event.content, sensitiveValues).slice(0, 1_000),
    });
    pending.delete(event.toolCallId);
  }

  for (const call of pending.values()) {
    actions.push({
      type: call.type,
      name: call.name,
      status: 'rejected',
      durationMs: 0,
      summary: 'No tool response before the turn completed',
    });
  }

  return actions;
}
