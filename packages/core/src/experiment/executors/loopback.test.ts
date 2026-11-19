import { describe, expect, test } from 'bun:test';
import { isLoopbackEndpoint } from './loopback';

describe('isLoopbackEndpoint', () => {
  const accepted = [
    'http://127.0.0.1:11434/v1',
    'https://127.0.0.1/v1',
    'http://127.255.255.254:8080',
    'http://127.1:11434/v1',
    'http://localhost:11434/v1',
    'http://LOCALHOST:11434',
    'http://[::1]:11434/v1',
    'http://[0:0:0:0:0:0:0:1]:11434',
  ];

  const rejected = [
    'http://0.0.0.0:11434/v1',
    'http://128.0.0.1:11434',
    'http://10.0.0.5:11434/v1',
    'http://192.168.1.10:11434',
    'https://api.openai.com/v1',
    'http://localhost.example.com:11434',
    'http://127.0.0.1.example.com/v1',
    'http://foo.localhost:11434',
    'http://[::ffff:127.0.0.1]:11434',
    'http://[::]:11434',
    'http://user:secret@127.0.0.1:11434/v1',
    'http://user@localhost:11434',
    'ftp://127.0.0.1/v1',
    'file:///etc/hosts',
    'ws://localhost:11434',
    '127.0.0.1:11434',
    'localhost',
    '',
    'not a url',
  ];

  test.each(accepted)('accepts %s', (url) => {
    expect(isLoopbackEndpoint(url)).toBe(true);
  });

  test.each(rejected)('rejects %s', (url) => {
    expect(isLoopbackEndpoint(url)).toBe(false);
  });

  test('rejects non-string input without throwing', () => {
    expect(isLoopbackEndpoint(undefined as unknown as string)).toBe(false);
    expect(isLoopbackEndpoint(42 as unknown as string)).toBe(false);
  });
});
