import { describe, expect, it } from 'bun:test';
import {
  Redactor,
  createDefaultRedactor,
  createNoOpRedactor,
  hashText,
  redactText,
  redactWithHash,
  resolvePatterns,
} from './redactor';
import { BUILTIN_PATTERNS, DEFAULT_REDACTION_PATTERNS } from './types';

describe('redactText', () => {
  it('should redact email addresses', () => {
    const text = 'Contact me at john.doe@example.com for more info';
    const patterns = [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g];
    const result = redactText(text, patterns);

    expect(result.wasRedacted).toBe(true);
    expect(result.redactionCount).toBe(1);
    expect(result.text).toBe('Contact me at [REDACTED] for more info');
  });

  it('should redact multiple occurrences', () => {
    const text = 'Email john@test.com or jane@test.com';
    const patterns = [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g];
    const result = redactText(text, patterns);

    expect(result.wasRedacted).toBe(true);
    expect(result.redactionCount).toBe(2);
    expect(result.text).toBe('Email [REDACTED] or [REDACTED]');
  });

  it('should use custom replacement', () => {
    const text = 'Call me at 555-123-4567';
    const patterns = [/\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g];
    const result = redactText(text, patterns, '***');

    expect(result.text).toBe('Call me at ***');
  });

  it('should return original text when no matches', () => {
    const text = 'Hello world';
    const patterns = [/\b\d{3}-\d{3}-\d{4}\b/g];
    const result = redactText(text, patterns);

    expect(result.wasRedacted).toBe(false);
    expect(result.redactionCount).toBe(0);
    expect(result.text).toBe('Hello world');
  });

  it('should handle empty text', () => {
    const result = redactText('', [/test/g]);
    expect(result.wasRedacted).toBe(false);
    expect(result.text).toBe('');
  });

  it('should handle empty patterns', () => {
    const result = redactText('some text', []);
    expect(result.wasRedacted).toBe(false);
    expect(result.text).toBe('some text');
  });
});

describe('resolvePatterns', () => {
  it('should resolve built-in pattern names', () => {
    const patterns = resolvePatterns([BUILTIN_PATTERNS.EMAIL, BUILTIN_PATTERNS.PHONE]);
    expect(patterns).toHaveLength(2);
    expect(patterns[0].name).toBe('email');
    expect(patterns[1].name).toBe('phone');
  });

  it('should handle custom regex strings', () => {
    const patterns = resolvePatterns(['\\btest\\b', 'custom-pattern']);
    expect(patterns).toHaveLength(2);
    expect(patterns[0].name).toContain('custom:');
  });

  it('should filter out invalid regex', () => {
    const patterns = resolvePatterns(['[invalid', 'valid']);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toContain('custom:');
  });
});

describe('hashText', () => {
  it('should generate consistent SHA-256 hash', () => {
    const text = 'sensitive data';
    const hash1 = hashText(text);
    const hash2 = hashText(text);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it('should generate different hashes for different text', () => {
    const hash1 = hashText('text1');
    const hash2 = hashText('text2');

    expect(hash1).not.toBe(hash2);
  });
});

describe('redactWithHash', () => {
  it('should return both redacted text and original hash', () => {
    const original = 'Contact: test@email.com';
    const patterns = [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g];
    const result = redactWithHash(original, patterns);

    expect(result.wasRedacted).toBe(true);
    expect(result.text).toBe('Contact: [REDACTED]');
    expect(result.originalHash).toHaveLength(64);
    expect(result.originalHash).toBe(hashText(original));
  });
});

describe('Redactor class', () => {
  it('should create with default patterns when enabled', () => {
    const redactor = createDefaultRedactor();
    expect(redactor.enabled).toBe(true);
    expect(redactor.patternNames.length).toBeGreaterThan(0);
  });

  it('should create no-op redactor when disabled', () => {
    const redactor = createNoOpRedactor();
    expect(redactor.enabled).toBe(false);

    const result = redactor.redact('test@email.com');
    expect(result.wasRedacted).toBe(false);
    expect(result.text).toBe('test@email.com');
  });

  it('should redact prompts when configured', () => {
    const redactor = new Redactor({
      enabled: true,
      redactPrompts: true,
      patterns: [BUILTIN_PATTERNS.EMAIL],
    });

    const result = redactor.redactPrompt('Send to user@test.com');
    expect(result.wasRedacted).toBe(true);
    expect(result.text).toBe('Send to [REDACTED]');
  });

  it('should not redact prompts when disabled', () => {
    const redactor = new Redactor({
      enabled: true,
      redactPrompts: false,
      patterns: [BUILTIN_PATTERNS.EMAIL],
    });

    const result = redactor.redactPrompt('Send to user@test.com');
    expect(result.wasRedacted).toBe(false);
    expect(result.text).toBe('Send to user@test.com');
  });

  it('should redact responses when configured', () => {
    const redactor = new Redactor({
      enabled: true,
      redactResponses: true,
      patterns: [BUILTIN_PATTERNS.PHONE],
    });

    const result = redactor.redactResponse('Call me at 555-123-4567');
    expect(result.wasRedacted).toBe(true);
    expect(result.text).toBe('Call me at [REDACTED]');
  });

  it('should use custom replacement string', () => {
    const redactor = new Redactor({
      enabled: true,
      replacement: '<<HIDDEN>>',
      patterns: [BUILTIN_PATTERNS.EMAIL],
    });

    const result = redactor.redact('test@example.com');
    expect(result.text).toBe('<<HIDDEN>>');
  });

  it('should redact metadata when enabled', () => {
    const redactor = new Redactor({
      enabled: true,
      redactMetadata: true,
      patterns: [BUILTIN_PATTERNS.EMAIL],
    });

    const metadata = {
      user: 'john@test.com',
      action: 'login',
    };

    const result = redactor.redactMetadata(metadata);
    expect(result.user).toBe('[REDACTED]');
    expect(result.action).toBe('login');
  });

  it('should not redact metadata when disabled', () => {
    const redactor = new Redactor({
      enabled: true,
      redactMetadata: false,
      patterns: [BUILTIN_PATTERNS.EMAIL],
    });

    const metadata = { user: 'john@test.com' };
    const result = redactor.redactMetadata(metadata);
    expect(result.user).toBe('john@test.com');
  });
});

describe('Built-in patterns', () => {
  const createTestRedactor = (pattern: string) =>
    new Redactor({ enabled: true, patterns: [pattern] });

  it('should redact credit card numbers', () => {
    const redactor = createTestRedactor(BUILTIN_PATTERNS.CREDIT_CARD);
    const result = redactor.redact('Card: 4111-1111-1111-1111');
    expect(result.wasRedacted).toBe(true);
  });

  it('should redact SSN', () => {
    const redactor = createTestRedactor(BUILTIN_PATTERNS.SSN);
    const result = redactor.redact('SSN: 123-45-6789');
    expect(result.wasRedacted).toBe(true);
  });

  it('should redact API keys', () => {
    const redactor = createTestRedactor(BUILTIN_PATTERNS.API_KEY);
    // Using clearly fake test key pattern (not a real key format)
    const result = redactor.redact('Key: sk_test_FAKE_KEY_FOR_TESTING_1234567890');
    expect(result.wasRedacted).toBe(true);
  });

  it('should redact AWS keys', () => {
    const redactor = createTestRedactor(BUILTIN_PATTERNS.AWS_KEY);
    const result = redactor.redact('AWS: AKIAIOSFODNN7EXAMPLE');
    expect(result.wasRedacted).toBe(true);
  });

  it('should redact secrets in assignments', () => {
    const redactor = createTestRedactor(BUILTIN_PATTERNS.SECRETS);
    const result = redactor.redact('password=mysecretpass123');
    expect(result.wasRedacted).toBe(true);
  });

  it('should redact IPv4 addresses', () => {
    const redactor = createTestRedactor(BUILTIN_PATTERNS.IPV4);
    const result = redactor.redact('Server: 192.168.1.100');
    expect(result.wasRedacted).toBe(true);
  });

  it('should redact JWT tokens', () => {
    const redactor = createTestRedactor(BUILTIN_PATTERNS.JWT);
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const result = redactor.redact(`Token: ${jwt}`);
    expect(result.wasRedacted).toBe(true);
  });
});
