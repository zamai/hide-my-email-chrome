export const DEFAULT_SETUP_URL = 'https://setup.icloud.com/setup/ws/1';
export const CHINA_SETUP_URL = 'https://setup.icloud.com.cn/setup/ws/1';

export type ConnectionStatus = 'disconnected' | 'ready' | 'reconnect_required';

export type ConnectionState = {
  status: ConnectionStatus;
  setupUrl?: string;
  serviceUrl?: string;
  connectedAt?: string;
};

export const DISCONNECTED: ConnectionState = { status: 'disconnected' };

export type ErrorCode =
  | 'disconnected'
  | 'session_expired'
  | 'subscription_unavailable'
  | 'network_failure'
  | 'generation_failure'
  | 'reservation_failure'
  | 'clipboard_failure'
  | 'unsupported_page'
  | 'already_in_progress';

export class ExtensionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ExtensionError';
  }
}

export function normalizeHostname(serializedUrl: string): string {
  let url: URL;
  try {
    url = new URL(serializedUrl);
  } catch (cause) {
    throw new ExtensionError('unsupported_page', 'This page has no website domain.', {
      cause,
    });
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new ExtensionError('unsupported_page', 'Use this command on an HTTP or HTTPS website.');
  }

  return url.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

export function userMessage(error: unknown): string {
  const code = error instanceof ExtensionError ? error.code : 'network_failure';
  const messages: Record<ErrorCode, string> = {
    disconnected: 'Open the extension, sign in at iCloud.com, and connect.',
    session_expired: 'Your iCloud session expired. Sign in at iCloud.com, then reconnect.',
    subscription_unavailable: 'Hide My Email is not active for this iCloud account.',
    network_failure: 'Could not reach iCloud. Check your connection and try again.',
    generation_failure: 'iCloud could not generate an address. Try again.',
    reservation_failure: 'iCloud did not confirm the reservation. No address was copied.',
    clipboard_failure: 'The address was reserved, but Chrome could not copy it.',
    unsupported_page: 'Use Generate new email on an ordinary HTTP or HTTPS website.',
    already_in_progress: 'A Hide My Email address is already being generated for this tab.',
  };
  return messages[code];
}
