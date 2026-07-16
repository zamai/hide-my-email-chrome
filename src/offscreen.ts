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

  void navigator.clipboard.writeText(message.text).then(
    () => sendResponse({ ok: true }),
    () => sendResponse({ ok: false })
  );
  return true;
});
