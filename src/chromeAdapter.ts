import { type ConnectionState, DISCONNECTED } from './domain';
import type { WorkflowPort } from './workflow';

const CONNECTION_KEY = 'connection';
const MENU_ID = 'generate-new-email';

export class ChromeAdapter implements WorkflowPort {
  async getConnection(): Promise<ConnectionState> {
    const stored = await chrome.storage.local.get(CONNECTION_KEY);
    return (stored[CONNECTION_KEY] as ConnectionState | undefined) ?? DISCONNECTED;
  }

  async saveConnection(state: ConnectionState): Promise<void> {
    await chrome.storage.local.set({ [CONNECTION_KEY]: state });
  }

  async copy(text: string): Promise<void> {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [offscreenUrl],
    });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.CLIPBOARD],
        justification: 'Copy the confirmed Hide My Email address after a user command.',
      });
    }
    const response: unknown = await chrome.runtime.sendMessage({
      type: 'copy',
      text,
    });
    if (!isMessageResponse(response) || !response.ok) throw new Error('Clipboard copy failed');
  }

  async notify(title: string, message: string): Promise<void> {
    await chrome.notifications.create({
      type: 'basic',
      title,
      message,
      iconUrl: 'icon-128.png',
    });
  }
}

export async function installContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Generate new email',
    contexts: ['all'],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
  });
}

export function isGenerateMenuClick(info: chrome.contextMenus.OnClickData): boolean {
  return info.menuItemId === MENU_ID;
}

function isMessageResponse(value: unknown): value is { ok: boolean } {
  return typeof value === 'object' && value !== null && 'ok' in value;
}
