# BuyerWatch Chrome extension

The extension captures the currently open Reddit, Bluesky, or X conversation
and sends it to BuyerWatch. Captures are stored immediately and remain in
`Awaiting analysis` until the AI worker is configured.

## Local installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `browser-extension` folder.
4. Open the extension's settings and set the BuyerWatch URL to
   `http://localhost:3000`.
5. Copy the displayed extension origin into `CHROME_EXTENSION_ORIGINS` in
   `.env.local`, then restart the Next.js development server.
6. Sign in with an existing BuyerWatch email/password account.

## Production

Publish the extension through the Chrome Web Store, then set
`CHROME_EXTENSION_ORIGINS` in Vercel to the exact assigned origin:

```text
chrome-extension://<extension-id>
```

Multiple origins can be supplied as a comma-separated list. The extension
authenticates directly with Supabase and sends only the resulting access token
to BuyerWatch. Passwords are never sent to the BuyerWatch API.
