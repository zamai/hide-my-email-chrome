# Security notes

## Audit baseline

The inherited source was audited at upstream commit `c87ea312374816ab662643633716d54110de023f`. It contained no telemetry, analytics, third-party API destinations, cookie reads, Apple credential inputs, dynamic code loading, external extension messaging, native messaging, or intentional credential exfiltration. The local repository matched the original author's `main` commit exactly at the audit point.

The inherited build was not retained unchanged because it exposed a content script to every website, allowed page DOM events to initiate iCloud-backed generation, trusted a discovered service URL without validation, requested broad page/tab/web-request access, and carried stale build dependencies. Those surfaces were removed during the Chrome-only reduction.

## Current boundary

- Apple credentials and 2FA codes are entered only on Apple's pages.
- Apple cookies stay in Chrome's cookie store. The extension has no `cookies` permission.
- HTTP requests are restricted by manifest permissions and runtime validation to HTTPS iCloud hostnames.
- The stored connection object contains only status, an allowlisted setup URL, an allowlisted service URL, and a timestamp.
- Alias candidates and reserved aliases are not persisted or logged.
- The page context menu is offered only for HTTP and HTTPS documents.
- `activeTab` grants temporary access only to the page where the user invokes the command, allowing the reserved address to be inserted into its focused field.
- `clipboardWrite` allows the reserved address to be copied after the asynchronous Apple reservation finishes and the original user activation has elapsed.
- There is no content script, remote code, telemetry, analytics, or non-Apple network request.
- Clipboard access is isolated in an extension-owned offscreen document and occurs only after Apple's allowlisted reservation endpoint returns a consistent `success: true` acknowledgement or Apple's alias-list endpoint confirms the exact requested candidate.
- Non-idempotent alias reservations are sent exactly once. If Chrome cannot read the response, the extension verifies that exact candidate through Apple's idempotent alias-list endpoint instead of retrying the reservation. Idempotent validation, generation, and listing requests may safely retry in the main world of an already-open iCloud.com tab. Only JSON responses return to the service worker; cookies remain inaccessible to extension code.

The declarative request rules set Apple Origin and Referer headers for extension-initiated iCloud requests. This compatibility mechanism is intentionally restricted to Apple hostnames and is required because the private web API may reject a `chrome-extension://` origin.

## Review checklist

Before installing a new revision:

1. Review changes to `src/manifest.json`, `src/rules.json`, `src/appleClient.ts`, and `package-lock.json`.
2. Run `npm ci --ignore-scripts`, `npm audit`, and `npm run verify`.
3. Confirm `npm audit --omit=dev` reports no production dependencies (the extension currently has none).
4. Inspect `build/manifest.json` and search the production bundle for unexpected URLs.
5. Complete the live smoke test in `README.md` with a disposable test alias.

Apple's private API remains the main operational risk. Treat response-shape, endpoint, cookie, CORS, or Origin failures as expected compatibility work; never work around them by collecting Apple credentials or exporting cookies into extension storage.
