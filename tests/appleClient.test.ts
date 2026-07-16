import { describe, expect, it, vi } from 'vitest';
import { AppleClient, assertAppleServiceUrl } from '../src/appleClient';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AppleClient', () => {
  it('connects only when Hide My Email is active and the service is Apple-hosted', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        dsInfo: { isHideMyEmailSubscriptionActive: true },
        webservices: {
          premiummailsettings: { url: 'https://p123-maildomainws.icloud.com' },
        },
      })
    );
    const result = await new AppleClient(undefined, undefined, fetcher).connect();
    expect(result.serviceUrl).toBe('https://p123-maildomainws.icloud.com');
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/validate$/),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it.each([
    'https://icloud.com.attacker.example',
    'http://p123.icloud.com',
    'https://user@icloud.com',
  ])('rejects untrusted service URL %s', (url) => {
    expect(() => assertAppleServiceUrl(url)).toThrow(/untrusted/);
  });

  it('returns only the address confirmed by reservation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: true, result: { hme: 'one@icloud.com' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { hme: { hme: 'one@icloud.com' } },
        })
      );
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);
    const candidate = await client.generate();
    await expect(client.reserve(candidate, 'example.com')).resolves.toBe(candidate);
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ hme: candidate, label: 'example.com', note: '' })
    );
    expect(fetcher.mock.calls[1]?.[1]?.headers).toBeUndefined();
  });

  it('accepts a confirmed address returned directly by reservation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: true, result: { hme: 'one@icloud.com' } }));
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);
    await expect(client.reserve('one@icloud.com', 'example.com')).resolves.toBe('one@icloud.com');
  });

  it.each([{ success: true }, { success: true, result: {} }, { success: true, result: null }])(
    'accepts a successful reservation acknowledgement without an echoed address',
    async (response) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));
      const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);
      await expect(client.reserve('one@icloud.com', 'example.com')).resolves.toBe('one@icloud.com');
    }
  );

  it('rejects an unsuccessful reservation acknowledgement', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: false, result: {} }));
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);
    await expect(client.reserve('candidate@icloud.com', 'example.com')).rejects.toMatchObject({
      code: 'reservation_failure',
      cause: expect.objectContaining({
        message: expect.stringContaining(
          'reservation=success=false; result=object; result.hme=undefined; result.hme.hme=undefined'
        ),
      }),
    });
  });

  it('verifies an unreadable reservation response against the alias list', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { hmeEmails: [{ hme: 'candidate@icloud.com' }] },
        })
      );
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);

    await expect(client.reserve('candidate@icloud.com', 'example.com')).resolves.toBe(
      'candidate@icloud.com'
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://p123-maildomainws.icloud.com/v2/hme/list');
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe('GET');
  });

  it('verifies an unsuccessful reservation acknowledgement against the alias list', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { hmeEmails: [{ hme: 'candidate@icloud.com' }] },
        })
      );
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);

    await expect(client.reserve('candidate@icloud.com', 'example.com')).resolves.toBe(
      'candidate@icloud.com'
    );
  });

  it('verifies a malformed reservation response against the alias list', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { hmeEmails: [{ hme: 'candidate@icloud.com' }] },
        })
      );
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);

    await expect(client.reserve('candidate@icloud.com', 'example.com')).resolves.toBe(
      'candidate@icloud.com'
    );
  });

  it('verifies a conflicting reservation echo against the alias list', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, result: { hme: { hme: 'other@icloud.com' } } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          result: { hmeEmails: [{ hme: 'candidate@icloud.com' }] },
        })
      );
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);

    await expect(client.reserve('candidate@icloud.com', 'example.com')).resolves.toBe(
      'candidate@icloud.com'
    );
  });

  it('preserves session expiry during reservation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 401));
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);

    await expect(client.reserve('candidate@icloud.com', 'example.com')).rejects.toMatchObject({
      code: 'session_expired',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('preserves session expiry during reservation verification', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false }))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);

    await expect(client.reserve('candidate@icloud.com', 'example.com')).rejects.toMatchObject({
      code: 'session_expired',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects an unreadable reservation response when the alias is absent from the list', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, result: { hmeEmails: [{ hme: 'other@icloud.com' }] } })
      );
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);

    await expect(client.reserve('candidate@icloud.com', 'example.com')).rejects.toMatchObject({
      code: 'reservation_failure',
    });
  });

  it.each([
    { success: true, result: { hme: 'other@icloud.com' } },
    { success: true, result: { hme: { hme: 'other@icloud.com' } } },
  ])('rejects a mismatched reservation confirmation', async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);
    await expect(client.reserve('candidate@icloud.com', 'example.com')).rejects.toMatchObject({
      code: 'reservation_failure',
    });
  });
});
