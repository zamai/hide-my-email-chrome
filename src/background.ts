import { AppleClient } from './appleClient';
import {
  chromeAppleFetch,
  ChromeAdapter,
  installContextMenu,
  isGenerateMenuClick,
} from './chromeAdapter';
import { DEFAULT_SETUP_URL } from './domain';
import { enableDevelopmentReload, reportDevelopmentError } from './devReload';
import { HideMyEmailWorkflow } from './workflow';

if (__DEV__) enableDevelopmentReload();

const adapter = new ChromeAdapter();
const workflow = new HideMyEmailWorkflow(
  adapter,
  (setupUrl, serviceUrl) => new AppleClient(setupUrl, serviceUrl, chromeAppleFetch)
);

chrome.runtime.onInstalled.addListener(() => void installContextMenu());
chrome.runtime.onStartup.addListener(() => void installContextMenu());

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!isGenerateMenuClick(info) || tab?.id === undefined) return;
  const pageUrl = info.pageUrl ?? tab.url;
  if (!pageUrl) return;
  void workflow.generateForTab(tab.id, pageUrl).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isPopupMessage(message)) return false;

  const task = (() => {
    switch (message.type) {
      case 'get-state':
        return adapter.getConnection();
      case 'connect':
        return workflow.connect(
          message.china ? 'https://setup.icloud.com.cn/setup/ws/1' : DEFAULT_SETUP_URL
        );
      case 'disconnect':
        return workflow.disconnect().then(() => adapter.getConnection());
    }
  })();

  void task.then(
    (state) => sendResponse({ ok: true, state }),
    (error: unknown) => {
      if (__DEV__) reportDevelopmentError(error);
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  );
  return true;
});

type PopupMessage =
  | { type: 'get-state' }
  | { type: 'connect'; china: boolean }
  | { type: 'disconnect' };

function isPopupMessage(value: unknown): value is PopupMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false;
  const type = value.type;
  if (type === 'get-state' || type === 'disconnect') return true;
  return type === 'connect' && 'china' in value && typeof value.china === 'boolean';
}
