# BuyerWatch Chrome extension

The extension captures the currently open Reddit conversation and sends it to
BuyerWatch. Captures are stored immediately and remain in
`Awaiting analysis` until the AI worker is configured.

## Local installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `browser-extension` folder.
4. Open the extension's settings and set the BuyerWatch URL to
   `http://localhost:3000`.
5. Add `chrome-extension://akfjpaggkndebeidadabipjpkbchlhfe` to
   `CHROME_EXTENSION_ORIGINS` in `.env.local`, then restart Next.js.
6. Sign in with an existing BuyerWatch email/password account.

## Production

The packaged extension has a stable identity. BuyerWatch accepts this exact
production origin:

```text
chrome-extension://akfjpaggkndebeidadabipjpkbchlhfe
```

Multiple origins can be supplied as a comma-separated list. The extension
authenticates directly with Supabase and sends only the resulting access token
to BuyerWatch. Passwords are never sent to the BuyerWatch API.
