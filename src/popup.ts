import type { ConnectionState } from './domain';

type Response = { ok: true; state: ConnectionState } | { ok: false; error: string };

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Popup element is missing: ${selector}`);
  return element;
}

const status = requiredElement<HTMLElement>('#status');
const detail = requiredElement<HTMLElement>('#detail');
const connectButton = requiredElement<HTMLButtonElement>('#connect');
const disconnectButton = requiredElement<HTMLButtonElement>('#disconnect');
const chinaCheckbox = requiredElement<HTMLInputElement>('#china');

function render(state: ConnectionState): void {
  const ready = state.status === 'ready';
  status.textContent = ready
    ? 'Connected'
    : state.status === 'reconnect_required'
      ? 'Reconnect required'
      : 'Not connected';
  status.dataset.state = state.status;
  detail.textContent = ready
    ? 'Right-click any ordinary web page and choose “Generate new email”.'
    : 'Sign in at iCloud.com in this Chrome profile, then connect. Your Apple password, 2FA code, and cookies stay with Apple and Chrome.';
  connectButton.textContent =
    state.status === 'reconnect_required' ? 'Reconnect iCloud' : 'Connect iCloud';
  connectButton.hidden = ready;
  disconnectButton.hidden = !ready;
}

async function send(message: object): Promise<Response> {
  return (await chrome.runtime.sendMessage(message)) as Response;
}

async function refresh(): Promise<void> {
  const response = await send({ type: 'get-state' });
  if (response.ok) render(response.state);
}

connectButton.addEventListener('click', () => {
  connectButton.disabled = true;
  detail.textContent = 'Checking the iCloud session…';
  void send({ type: 'connect', china: chinaCheckbox.checked })
    .then((response) => {
      if (response.ok) render(response.state);
      else detail.textContent = `${response.error} Sign in at iCloud.com and try again.`;
    })
    .finally(() => {
      connectButton.disabled = false;
    });
});

disconnectButton.addEventListener('click', () => {
  void send({ type: 'disconnect' }).then((response) => {
    if (response.ok) render(response.state);
  });
});

void refresh();
