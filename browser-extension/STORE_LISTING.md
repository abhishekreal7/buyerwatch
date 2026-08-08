# Chrome Web Store release checklist

This file is operational documentation and is intentionally excluded from the
extension ZIP.

## Single purpose

Use this in the Chrome Web Store privacy form:

> Capture a Reddit conversation selected by the user into BuyerWatch and prefill
> an approved BuyerWatch draft for the user to review and submit themselves.

## Permission justifications

- `activeTab`: lets the popup identify the Reddit conversation in the tab where
  the user clicked BuyerWatch and send that tab an explicit capture request.
- `storage`: stores the user's BuyerWatch session and a pending reply locally so
  capture and prefill can continue across page navigation. Pending replies
  expire after 15 minutes.
- BuyerWatch host access: retrieves extension configuration and calls the two
  authenticated extension API routes.
- Exact Supabase project host access: signs in and refreshes the user's
  BuyerWatch session with BuyerWatch's authentication provider.
- Reddit conversation matches: reads only the public conversation that the user
  explicitly captures and prefills, without submitting, a reply selected in
  BuyerWatch.

## Data disclosures

Declare these categories in the Web Store privacy form:

- Authentication information: access and refresh tokens stored in extension
  storage; account email shown in the popup.
- Website content: URL, title, body, author, community, and publication time of
  a Reddit post only after the user presses **Capture conversation**.
- User-generated content: an approved reply temporarily stored for prefill.

State that data is used only for BuyerWatch's capture, scoring, drafting, and
reply-status features; is not sold; is not used for personalized advertising;
and is transmitted over HTTPS. Link the listing privacy policy to
`https://buyerwatch.co/privacy`.

## Submission sequence

1. Run `npm run verify:offline`, `npm run extension:smoke`, and
   `npm run extension:package` from a clean commit.
2. Upload `public/buyerwatch-extension.zip` as a new item without publishing.
3. In the Package tab, copy the Web Store public key. If it differs from
   `manifest.json`'s `key`, update the key and every configured extension ID,
   rebuild, rerun all checks, deploy BuyerWatch, and upload the rebuilt ZIP.
4. Add at least a 1280x800 or 640x400 screenshot showing explicit capture and
   review-before-submit behavior. Do not use fabricated testimonials.
5. Complete the privacy fields with the exact disclosures above and submit for
   review.
6. After approval, set `NEXT_PUBLIC_CHROME_EXTENSION_URL` to the listing URL and
   verify install, session sync, capture, prefill, manual submit, and confirmed
   reply status using the store-installed build.
