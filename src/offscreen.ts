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
    input.remove();
    sendResponse({ ok: copied });
  } catch {
    sendResponse({ ok: false });
  } finally {
    input.remove();
  }
  return false;
});
