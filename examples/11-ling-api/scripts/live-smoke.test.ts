import { describe, expect, it } from 'bun:test';
import { liveTestsEnabled, runLiveSmoke } from './live-smoke';

describe('Ling live smoke guard', () => {
  it('requires both an explicit opt-in and an API key', () => {
    expect(liveTestsEnabled({})).toBe(false);
    expect(liveTestsEnabled({ LING_API_KEY: 'key' })).toBe(false);
    expect(liveTestsEnabled({ LING_LIVE_TESTS: '1' })).toBe(false);
    expect(liveTestsEnabled({ LING_LIVE_TESTS: '1', LING_API_KEY: 'key' })).toBe(true);
  });

  it('skips without performing a request when the opt-in is absent', async () => {
    const previous = process.env.LING_LIVE_TESTS;
    delete process.env.LING_LIVE_TESTS;
    await expect(runLiveSmoke()).resolves.toBe(0);
    if (previous === undefined) delete process.env.LING_LIVE_TESTS;
    else process.env.LING_LIVE_TESTS = previous;
  });
});
