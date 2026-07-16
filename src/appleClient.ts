import { DEFAULT_SETUP_URL, ExtensionError } from './domain';

type JsonRecord = Record<string, unknown>;

export type ConnectedAppleClient = {
  setupUrl: string;
  serviceUrl: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function readRecord(parent: JsonRecord, key: string): JsonRecord | undefined {
  const value = parent[key];
  return isRecord(value) ? value : undefined;
}

export function assertAppleServiceUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ExtensionError('subscription_unavailable', 'Missing Premium Mail Settings service.');
  }

  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const isAppleHost = hostname === 'icloud.com' || hostname.endsWith('.icloud.com');

  if (url.protocol !== 'https:' || !isAppleHost || url.username || url.password) {
    throw new ExtensionError('network_failure', 'iCloud returned an untrusted service URL.');
  }
  return url.origin + url.pathname.replace(/\/$/, '');
}

export class AppleClient {
  constructor(
    readonly setupUrl = DEFAULT_SETUP_URL,
    private serviceUrl?: string,
    private readonly fetcher: typeof fetch = fetch
  ) {
    if (setupUrl !== DEFAULT_SETUP_URL) {
      throw new ExtensionError('network_failure', 'Unsupported iCloud setup endpoint.');
    }
  }

  async connect(): Promise<ConnectedAppleClient> {
    const data = await this.request(`${this.setupUrl}/validate`, 'session_expired');
    const dsInfo = readRecord(data, 'dsInfo');
    if (dsInfo?.isHideMyEmailSubscriptionActive !== true) {
      throw new ExtensionError(
        'subscription_unavailable',
        'Hide My Email subscription is unavailable.'
      );
    }

    const webservices = readRecord(data, 'webservices');
    const premiumMail = webservices && readRecord(webservices, 'premiummailsettings');
    this.serviceUrl = assertAppleServiceUrl(premiumMail?.url);
    return { setupUrl: this.setupUrl, serviceUrl: this.serviceUrl };
  }

  async generate(): Promise<string> {
    const baseUrl = this.requireServiceUrl();
    const data = await this.request(`${baseUrl}/v1/hme/generate`, 'generation_failure');
    const result = readRecord(data, 'result');
    const hme = result?.hme;
    if (data.success !== true || typeof hme !== 'string' || !hme.includes('@')) {
      throw new ExtensionError('generation_failure', 'Malformed generation response.');
    }
    return hme;
  }

  async reserve(candidate: string, label: string): Promise<string> {
    const baseUrl = this.requireServiceUrl();
    const data = await this.request(`${baseUrl}/v1/hme/reserve`, 'reservation_failure', {
      hme: candidate,
      label,
      note: '',
    });
    const result = readRecord(data, 'result');
    const hmeResult = result?.hme;
    const reservation = isRecord(hmeResult) ? hmeResult : undefined;
    const echoedAddress = typeof hmeResult === 'string' ? hmeResult : reservation?.hme;
    const hasConflictingEcho = typeof echoedAddress === 'string' && echoedAddress !== candidate;
    if (data.success !== true || hasConflictingEcho) {
      throw new ExtensionError('reservation_failure', 'Reservation was not confirmed.');
    }
    return candidate;
  }

  private requireServiceUrl(): string {
    return assertAppleServiceUrl(this.serviceUrl);
  }

  private async request(
    url: string,
    fallbackCode: 'session_expired' | 'generation_failure' | 'reservation_failure',
    data?: JsonRecord
  ): Promise<JsonRecord> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
    } catch (cause) {
      throw new ExtensionError('network_failure', 'iCloud request failed.', {
        cause,
      });
    }

    if ([401, 403, 421].includes(response.status)) {
      throw new ExtensionError('session_expired', 'iCloud session expired.');
    }
    if (!response.ok) {
      throw new ExtensionError(fallbackCode, `iCloud request failed (${response.status}).`);
    }

    try {
      const json: unknown = await response.json();
      if (!isRecord(json)) throw new Error('Expected an object');
      return json;
    } catch (cause) {
      throw new ExtensionError(fallbackCode, 'iCloud returned malformed JSON.', { cause });
    }
  }
}
