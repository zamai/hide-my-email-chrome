import { AppleClient, type ConnectedAppleClient } from './appleClient';
import {
  type ConnectionState,
  DISCONNECTED,
  ExtensionError,
  normalizeHostname,
  userMessage,
} from './domain';

export type WorkflowPort = {
  getConnection(): Promise<ConnectionState>;
  saveConnection(state: ConnectionState): Promise<void>;
  copy(text: string): Promise<void>;
  notify(title: string, message: string): Promise<void>;
};

export type ClientPort = Pick<AppleClient, 'connect' | 'generate' | 'reserve'>;
export type ClientFactory = (setupUrl?: string, serviceUrl?: string) => ClientPort;

export class HideMyEmailWorkflow {
  private readonly inProgressTabs = new Set<number>();

  constructor(
    private readonly port: WorkflowPort,
    private readonly makeClient: ClientFactory = (setupUrl, serviceUrl) =>
      new AppleClient(setupUrl, serviceUrl)
  ) {}

  async connect(setupUrl?: string): Promise<ConnectionState> {
    try {
      const connected = await this.makeClient(setupUrl).connect();
      return await this.persistConnected(connected);
    } catch (error) {
      const state: ConnectionState = {
        status:
          error instanceof ExtensionError && error.code === 'session_expired'
            ? 'reconnect_required'
            : 'disconnected',
      };
      await this.port.saveConnection(state);
      throw error;
    }
  }

  async generateForTab(tabId: number, pageUrl: string): Promise<string> {
    if (this.inProgressTabs.has(tabId)) {
      throw new ExtensionError('already_in_progress', 'Duplicate invocation suppressed.');
    }
    this.inProgressTabs.add(tabId);

    try {
      const label = normalizeHostname(pageUrl);
      const state = await this.port.getConnection();
      if (state.status !== 'ready' || !state.setupUrl || !state.serviceUrl) {
        throw new ExtensionError('disconnected', 'Connect iCloud first.');
      }

      const client = this.makeClient(state.setupUrl, state.serviceUrl);
      const refreshed = await client.connect();
      await this.persistConnected(refreshed);

      const candidate = await client.generate();
      const confirmed = await client.reserve(candidate, label);
      try {
        await this.port.copy(confirmed);
      } catch (cause) {
        throw new ExtensionError('clipboard_failure', 'Clipboard write failed.', { cause });
      }
      await this.port.notify('Hide My Email created', `${confirmed} was copied to your clipboard.`);
      return confirmed;
    } catch (error) {
      if (error instanceof ExtensionError && error.code === 'session_expired') {
        await this.port.saveConnection({ status: 'reconnect_required' });
      }
      await this.port.notify('Hide My Email failed', userMessage(error));
      throw error;
    } finally {
      this.inProgressTabs.delete(tabId);
    }
  }

  async disconnect(): Promise<void> {
    await this.port.saveConnection(DISCONNECTED);
  }

  private async persistConnected(connected: ConnectedAppleClient): Promise<ConnectionState> {
    const state: ConnectionState = {
      status: 'ready',
      setupUrl: connected.setupUrl,
      serviceUrl: connected.serviceUrl,
      connectedAt: new Date().toISOString(),
    };
    await this.port.saveConnection(state);
    return state;
  }
}
