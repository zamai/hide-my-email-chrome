import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromeAppleFetch, ChromeAdapter } from '../src/chromeAdapter';

describe('ChromeAdapter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('copies after inserting into a focused field', async () => {
    const executeScript = vi.fn().mockResolvedValue([{ result: true }]);
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('chrome', {
      runtime: {
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
        getURL: vi.fn(() => 'chrome-extension://extension/offscreen.html'),
        getContexts: vi.fn().mockResolvedValue([{}]),
        sendMessage,
      },
      scripting: { executeScript },
    });

    await expect(new ChromeAdapter().deliver('alias@icloud.com', 42, true)).resolves.toBe('input');
    expect(executeScript).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'copy',
      text: 'alias@icloud.com',
    });
  });

  it('copies without attempting insertion when no editable field was selected', async () => {
    const executeScript = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('chrome', {
      runtime: {
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
        getURL: vi.fn(() => 'chrome-extension://extension/offscreen.html'),
        getContexts: vi.fn().mockResolvedValue([{}]),
        sendMessage,
      },
      scripting: { executeScript },
    });

    await expect(new ChromeAdapter().deliver('alias@icloud.com', 42, false)).resolves.toBe(
      'clipboard'
    );
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'copy',
      text: 'alias@icloud.com',
    });
  });

  it('creates an offscreen document authorized for clipboard and audio', async () => {
    const createDocument = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      runtime: {
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
        getURL: vi.fn(() => 'chrome-extension://extension/offscreen.html'),
        getContexts: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      },
      offscreen: {
        Reason: {
          CLIPBOARD: 'CLIPBOARD',
          AUDIO_PLAYBACK: 'AUDIO_PLAYBACK',
        },
        createDocument,
      },
      scripting: { executeScript: vi.fn() },
    });

    await new ChromeAdapter().deliver('alias@icloud.com', 42, false);

    expect(createDocument).toHaveBeenCalledWith({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD', 'AUDIO_PLAYBACK'],
      justification: 'Copy the confirmed Hide My Email address and play a brief completion sound.',
    });
  });
});

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
