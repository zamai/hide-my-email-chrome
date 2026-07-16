# Hide My Email for Chrome

A small, auditable Manifest V3 extension that reserves one Apple Hide My Email address from Chrome's page context menu.

The extension deliberately does **not** ask for or store an Apple ID, password, 2FA code, copied cookie, session token, or generated-address history. Authentication stays on Apple's website and requests reuse the iCloud session already managed by the current Chrome profile. Only the Apple setup endpoint, discovered Premium Mail Settings URL, connection status, and connection time are stored in `chrome.storage.local`.

Apple's Hide My Email web API is undocumented and may change without notice. This is an independent project and is not endorsed by or affiliated with Apple.

## Use

1. Sign in at [iCloud.com](https://www.icloud.com/) in the Chrome profile where the extension is installed.
2. Open the extension and select **Connect iCloud**.
3. On any HTTP or HTTPS website, right-click and select **Generate new email**.
4. After Apple confirms the reservation, the extension fills the focused email/text field. If no supported field is focused, it copies the address to the clipboard instead. Chrome then displays a notification.

If the Apple session expires, sign in at iCloud.com again and select **Reconnect iCloud**. The command is unavailable on internal Chrome pages, extension pages, local files, and other URLs without a website hostname.

## Develop

Requirements: Node 25 (see `.nvmrc`) and current Google Chrome.

```sh
nvm use
npm ci
npm run verify
```

For an edit/test loop:

```sh
npm run dev
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository's `build` directory. If it was already loaded, click its reload button once after starting `npm run dev`. From that point onward, successful TypeScript or static-asset rebuilds make the development build reload itself automatically through a loopback-only WebSocket. Production builds do not contain or connect to this reload channel.

For a production build, run `npm run build` and load the same `build` directory. Do not install a build produced by an untrusted machine; build from the reviewed source and committed lockfile.

## Manual smoke test

Use a test iCloud+ account if possible, because a successful smoke test creates a real alias.

1. Run `npm run verify`, load `build`, and inspect the extension details. Expected permissions are context menus, notifications, offscreen clipboard, local storage, request-header rules, and Apple iCloud hosts only.
2. Open iCloud.com and sign in using Apple's page. Confirm the extension never renders password or 2FA inputs.
3. Select **Connect iCloud**. Close and reopen the popup; it should remain connected.
4. Open `https://example.com/path?query=1`, invoke **Generate new email** once, and confirm one success notification and one clipboard value.
5. In iCloud Hide My Email settings, confirm exactly one new alias with label `example.com` and an empty note. Remove or deactivate the test alias manually.
6. Repeat two context-menu clicks quickly in one tab. Only one reservation should occur. Separate tabs may proceed independently.
7. Sign out at iCloud.com, invoke the command, and confirm the extension reports that reconnection is required and copies nothing.
8. Confirm the command does not appear on `chrome://extensions` or a local `file://` page.

Mocked tests cannot prove current Apple endpoint compatibility, cookie behavior, or Origin handling, so this live check is required after Apple-facing changes.

## Security boundary

See [SECURITY.md](SECURITY.md) for the audit summary, permissions rationale, stored-data inventory, and maintenance checklist.

This project began from Dimitrios Dedoussis's MIT-licensed [`icloud-hide-my-email-browser-extension`](https://github.com/dedoussis/icloud-hide-my-email-browser-extension). The fork was reduced to the narrower Chrome-only workflow described here.
