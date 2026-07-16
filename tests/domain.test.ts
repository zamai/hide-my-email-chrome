import { describe, expect, it } from 'vitest';
import { normalizeHostname } from '../src/domain';

describe('normalizeHostname', () => {
  it.each([
    ['https://example.com/path?q=1#part', 'example.com'],
    ['https://www.Example.COM:8443/path', 'example.com'],
    ['https://accounts.example.com/', 'accounts.example.com'],
    ['https://example.com./', 'example.com'],
    ['https://xn--bcher-kva.example/', 'xn--bcher-kva.example'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  it.each(['chrome://extensions', 'file:///tmp/index.html', 'data:text/plain,hello'])(
    'rejects %s',
    (input) => {
      expect(() => normalizeHostname(input)).toThrow(/HTTP or HTTPS/);
    }
  );
});
