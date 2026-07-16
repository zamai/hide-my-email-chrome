const RELOAD_SERVER = 'ws://127.0.0.1:17345';
let developmentSocket: WebSocket | undefined;

export function enableDevelopmentReload(): void {
  const connect = () => {
    developmentSocket = new WebSocket(RELOAD_SERVER);
    developmentSocket.addEventListener('open', () =>
      developmentSocket?.send(JSON.stringify({ type: 'connected', extensionId: chrome.runtime.id }))
    );
    developmentSocket.addEventListener('message', (event) => {
      if (event.data === 'reload') chrome.runtime.reload();
    });
    developmentSocket.addEventListener('close', () => setTimeout(connect, 1_000));
  };

  connect();
}

export function reportDevelopmentError(error: unknown): void {
  if (developmentSocket?.readyState !== WebSocket.OPEN) return;
  const cause = error instanceof Error ? error.cause : undefined;
  developmentSocket.send(
    JSON.stringify({
      type: 'error',
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      cause: cause instanceof Error ? cause.message : cause ? String(cause) : undefined,
      code:
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : undefined,
    })
  );
}
