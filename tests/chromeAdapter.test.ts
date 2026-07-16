import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeAppleFetch } from '../src/chromeAdapter';

describe('chromeAppleFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not retry an unreadable reservation response', async () => {
    const responseError = new TypeError('Failed to fetch');
    const extensionFetch = vi.fn<typeof fetch>().mockRejectedValue(responseError);
    const executeScript = vi.fn();
    vi.stubGlobal('fetch', extensionFetch);
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 42 }]) },
      scripting: { executeScript },
    });

    await expect(
      chromeAppleFetch('https://p123.icloud.com/v1/hme/reserve', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hme: 'candidate@icloud.com' }),
      })
    ).rejects.toBe(responseError);
    expect(extensionFetch).toHaveBeenCalledOnce();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('uses the extension request directly for idempotent Apple operations', async () => {
    const expected = new Response(JSON.stringify({ success: true }));
    const extensionFetch = vi.fn<typeof fetch>().mockResolvedValue(expected);
    const executeScript = vi.fn();
    vi.stubGlobal('fetch', extensionFetch);
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn() },
      scripting: { executeScript },
    });

    await expect(
      chromeAppleFetch('https://setup.icloud.com/setup/ws/1/validate', { method: 'POST' })
    ).resolves.toBe(expected);
    expect(extensionFetch).toHaveBeenCalledOnce();
    expect(executeScript).not.toHaveBeenCalled();
  });
});
