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
  });

  it('accepts a confirmed address returned directly by reservation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: true, result: { hme: 'one@icloud.com' } }));
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);
    await expect(client.reserve('one@icloud.com', 'example.com')).resolves.toBe('one@icloud.com');
  });

  it('rejects a mismatched reservation confirmation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        result: { hme: { hme: 'other@icloud.com' } },
      })
    );
    const client = new AppleClient(undefined, 'https://p123-maildomainws.icloud.com', fetcher);
    await expect(client.reserve('candidate@icloud.com', 'example.com')).rejects.toMatchObject({
      code: 'reservation_failure',
    });
  });
});
