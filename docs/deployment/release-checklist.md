# Release Checklist

Verify these on a new environment — or after a change to the platform itself — before calling it live. The first deploy to a real HTTPS origin tends to surface problems local testing can't: cookies and CSRF behind the real origin, WebSocket live reload through the tunnel, and sign-in on a new domain.

## External configuration

- [ ] Firebase → Authorized domains lists the app's hostname. A stale domain blocks Google sign-in.
- [ ] The Stripe webhook endpoint is `https://<app domain>/webhooks/payment`. A stale webhook fails silently: plan upgrades never arrive.

## The app

- [ ] The app loads with a valid certificate, and refreshing a deep link such as `/projects` still works.
- [ ] `/api/plans` returns JSON.
- [ ] Sign in with Google and with email; sign out; a second account sees none of the first account's projects.
- [ ] A new project starts from the starter template.
- [ ] An AI build streams as it's generated and commits files.
- [ ] Code insight answers a question about the project.
- [ ] A preview loads in the preview panel, and an AI edit shows up in it live.
- [ ] Invite a collaborator: a viewer can't edit, and a non-member is denied.
- [ ] Stripe test checkout with card `4242 4242 4242 4242` upgrades the plan through the webhook.
- [ ] Hitting a quota shows the friendly limit message, not an error.
- [ ] Works in Chrome, Safari and Firefox, and on a phone.

## The platform

- [ ] `/internal/...` never reaches a backend from the internet. (Through the tunnel, `/api/internal/...` is a Gateway `404`, and a bare `/internal/...` is served the SPA's `index.html` by nginx.)
- [ ] Reboot the VM: everything comes back on its own within about five minutes.
- [ ] Start several previews in a row and record memory and CPU with `kubectl top`; adjust limits from the measurements (see [capacity](capacity.md)).
- [ ] Run one backup by hand and confirm it lands in R2; run the uptime workflow once.
