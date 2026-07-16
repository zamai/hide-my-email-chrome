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

  async deliver(text: string, tabId: number, preferInput: boolean): Promise<'input' | 'clipboard'> {
    if (preferInput && (await insertIntoFocusedField(tabId, text))) return 'input';
    await this.copy(text);
    return 'clipboard';
  }

  private async copy(text: string): Promise<void> {
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

async function insertIntoFocusedField(tabId: number, text: string): Promise<boolean> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (value: string) => {
        const element = document.activeElement;
        const isTextArea = element instanceof HTMLTextAreaElement;
        const isSupportedInput =
          element instanceof HTMLInputElement &&
          ['', 'email', 'search', 'tel', 'text', 'url'].includes(element.type);
        if ((!isTextArea && !isSupportedInput) || element.disabled || element.readOnly)
          return false;

        const prototype = isTextArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      args: [text],
    });
    return injection?.result === true;
  } catch {
    return false;
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

export const chromeAppleFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (extensionFetchError) {
    const url = input instanceof Request ? input.url : input.toString();
    const tabs = await chrome.tabs.query({ url: 'https://www.icloud.com/*' });
    const tab = tabs.find((candidate) => candidate.id !== undefined);
    if (tab?.id === undefined) throw extensionFetchError;

    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const request = {
      method: init?.method ?? 'GET',
      credentials: 'include' as const,
      headers,
      ...(typeof init?.body === 'string' ? { body: init.body } : {}),
    };

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async (requestUrl: string, requestInit: RequestInit) => {
        const response = await fetch(requestUrl, requestInit);
        return {
          body: await response.text(),
          status: response.status,
          statusText: response.statusText,
        };
      },
      args: [url, request],
    });
    if (!injection?.result) throw extensionFetchError;
    return new Response(injection.result.body, {
      status: injection.result.status,
      statusText: injection.result.statusText,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function isMessageResponse(value: unknown): value is { ok: boolean } {
  return typeof value === 'object' && value !== null && 'ok' in value;
}
