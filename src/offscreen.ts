const clipboardConfirmation = new Audio('clipboard-confirmation.wav');
clipboardConfirmation.preload = 'auto';

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (
    sender.id !== chrome.runtime.id ||
    typeof message !== 'object' ||
    message === null ||
    !('type' in message) ||
    message.type !== 'copy' ||
    !('text' in message) ||
    typeof message.text !== 'string'
  ) {
    return false;
  }

  const input = document.createElement('textarea');
  try {
    input.value = message.text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    input.setSelectionRange(0, input.value.length);
    const copied = document.execCommand('copy');
    if (copied) playClipboardConfirmation();
    input.remove();
    sendResponse({ ok: copied });
  } catch {
    sendResponse({ ok: false });
  } finally {
    input.remove();
  }
  return false;
});

function playClipboardConfirmation(): void {
  clipboardConfirmation.currentTime = 0;
  void clipboardConfirmation.play().catch(() => {
    // Clipboard delivery remains successful when audio is unavailable or muted.
  });
}
