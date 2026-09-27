import { types } from 'node:util';

export type WorkflowJson =
  | null
  | boolean
  | number
  | string
  | WorkflowJson[]
  | { [key: string]: WorkflowJson };
export const forbiddenWorkflowKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Limit both recursive work and retained fixture size before schema parsing/cloning. */
export function isWorkflowJson(value: unknown): value is WorkflowJson {
  let nodes = 0;
  let textBytes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 10_000 || depth > 16) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') {
      textBytes += Buffer.byteLength(item);
      return textBytes <= 1_048_576;
    }
    if (typeof item !== 'object' || types.isProxy(item) || ancestors.has(item)) return false;
    if (Array.isArray(item) && Object.getPrototypeOf(item) !== Array.prototype) return false;
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      return false;
    if (Object.getOwnPropertySymbols(item).length) return false;
    if (
      Array.isArray(item) &&
      (item.length > 10_000 ||
        Object.keys(item).length !== item.length ||
        Object.keys(item).some((key, index) => key !== String(index)))
    )
      return false;
    ancestors.add(item);
    for (const key of Object.getOwnPropertyNames(item)) {
      if (Array.isArray(item) && key === 'length') continue;
      textBytes += Buffer.byteLength(key);
      const entry = Object.getOwnPropertyDescriptor(item, key);
      if (
        textBytes > 1_048_576 ||
        forbiddenWorkflowKeys.has(key) ||
        !entry ||
        !('value' in entry) ||
        !entry.enumerable ||
        !visit(entry.value, depth + 1)
      )
        return false;
    }
    ancestors.delete(item);
    return true;
  }
  return visit(value, 0);
}
