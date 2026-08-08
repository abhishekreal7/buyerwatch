# BuyerWatch Chrome extension

BuyerWatch captures a Reddit post only when the user presses **Capture
conversation**. It can also prefill an approved draft into Reddit's composer,
but it never presses Reddit's submit button.

## Production package

Build the reviewed production ZIP from the tracked extension source:

```text
npm run extension:package
```

Verify that the committed ZIP is byte-for-byte in sync with every packaged
source file:

```text
npm run extension:check
```

Load the signed production manifest in an isolated Chromium profile and test
its exact production origin and extension identity before any store upload:

```text
npm run extension:smoke:production
```

The production manifest is restricted to BuyerWatch, the configured Supabase
project, and Reddit conversation paths. Production session handoff uses
Chrome's externally-connectable messaging API, restricted to BuyerWatch's two
HTTPS origins. Do not add localhost, wildcard service hosts, or broad Reddit
listing paths to the production manifest.

## Local development

Generate an unpacked development build, then load the generated folder from
`chrome://extensions`:

```text
npm run extension:dev
```

The generated folder is `tmp/buyerwatch-extension-dev`. Its development-only
manifest permits `http://localhost:3000`; use the extension settings page to
switch the BuyerWatch URL to localhost.

Run the real-browser release smoke after generating the development build:

```text
npm run extension:smoke
```

This launches Playwright's extension-capable Chromium, loads the MV3 service
worker, verifies origin-restricted messaging, captures a fixture Reddit post,
and checks pending-reply storage.

The development server accepts any `chrome-extension://` origin. Production
accepts only the stable packaged extension origin plus explicitly configured
`CHROME_EXTENSION_ORIGINS` entries.

## User data and safety

- Capture is user initiated.
- Captured data is limited to the public post URL, title, body, author,
  community, and publication time.
- BuyerWatch session data and a short-lived pending reply are stored in Chrome
  extension storage.
- Production session tokens are transferred directly to the extension service
  worker; they are never broadcast through the page DOM.
- Pending replies expire after 15 minutes.
- The extension never reads Reddit private messages or authentication cookies.
- The extension never submits a Reddit reply automatically.

The public disclosure is available at `https://buyerwatch.co/privacy`.
