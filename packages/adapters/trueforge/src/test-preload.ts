import { mock } from 'bun:test';
import { createDefaultRedactor } from '../../../core/src/redaction/redactor';

mock.module('@artemiskit/core', () => ({ createDefaultRedactor }));
