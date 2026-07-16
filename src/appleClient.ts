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

function reservationResponseShape(data: JsonRecord, candidate: string): string {
  const describe = (value: unknown): string => {
    if (typeof value === 'string')
      return value === candidate ? 'matching-string' : 'different-string';
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };
  const result = readRecord(data, 'result');
  const hme = result?.hme;
  const nestedHme = isRecord(hme) ? hme.hme : undefined;
  const error = readRecord(data, 'error');
  const sanitize = (value: unknown): string => {
    if (typeof value !== 'string' && typeof value !== 'number') return typeof value;
    return String(value)
      .replaceAll(candidate, '[candidate]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .slice(0, 200);
  };
  const success =
    data.success === true ? 'true' : data.success === false ? 'false' : describe(data.success);
  return `success=${success}; result=${describe(data.result)}; result.hme=${describe(hme)}; result.hme.hme=${describe(nestedHme)}; error.code=${sanitize(error?.errorCode ?? error?.code)}; error.message=${sanitize(error?.errorMessage ?? error?.message)}`;
}

type ReservationVerification = { confirmed: boolean; summary: string };

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
    let data: JsonRecord;
    try {
      data = await this.request(`${baseUrl}/v1/hme/reserve`, 'reservation_failure', {
        hme: candidate,
        label,
        note: '',
      });
    } catch (cause) {
      if (cause instanceof ExtensionError && cause.code === 'session_expired') throw cause;
      const verification = await this.verifyReserved(candidate);
      if (verification.confirmed) return candidate;
      throw new ExtensionError('reservation_failure', 'Reservation was not confirmed.', {
        cause: new Error(
          `reservation=${cause instanceof ExtensionError ? cause.code : 'unreadable'}; verification=${verification.summary}`,
          { cause }
        ),
      });
    }
    const result = readRecord(data, 'result');
    const hmeResult = result?.hme;
    const reservation = isRecord(hmeResult) ? hmeResult : undefined;
    const echoedAddress = typeof hmeResult === 'string' ? hmeResult : reservation?.hme;
    const hasConflictingEcho = typeof echoedAddress === 'string' && echoedAddress !== candidate;
    if (data.success !== true || hasConflictingEcho) {
      const verification = await this.verifyReserved(candidate);
      if (!verification.confirmed) {
        throw new ExtensionError('reservation_failure', 'Reservation was not confirmed.', {
          cause: new Error(
            `reservation=${reservationResponseShape(data, candidate)}; verification=${verification.summary}`
          ),
        });
      }
    }
    return candidate;
  }

  private async verifyReserved(candidate: string): Promise<ReservationVerification> {
    let summary = 'not-attempted';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const data = await this.request(
          `${this.requireServiceUrl()}/v2/hme/list`,
          'reservation_failure',
          undefined,
          'GET'
        );
        const result = readRecord(data, 'result');
        const emails = result?.hmeEmails;
        const matches = Array.isArray(emails)
          ? emails.filter((email) => isRecord(email) && email.hme === candidate).length
          : 0;
        summary = `success=${data.success === true}; emails=${Array.isArray(emails) ? emails.length : typeof emails}; matches=${matches}`;
        if (data.success === true && matches > 0) return { confirmed: true, summary };
      } catch (error) {
        if (error instanceof ExtensionError && error.code === 'session_expired') throw error;
        summary = `request-error=${error instanceof ExtensionError ? error.code : typeof error}`;
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    return { confirmed: false, summary };
  }

  private requireServiceUrl(): string {
    return assertAppleServiceUrl(this.serviceUrl);
  }

  private async request(
    url: string,
    fallbackCode: 'session_expired' | 'generation_failure' | 'reservation_failure',
    data?: JsonRecord,
    method: 'GET' | 'POST' = 'POST'
  ): Promise<JsonRecord> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        credentials: 'include',
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
