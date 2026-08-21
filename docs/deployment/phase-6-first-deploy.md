# Phase 6: First deploy and verification

The first real deploy always surfaces a few issues that local testing can't. Common ones are cookies and CSRF behind the real HTTPS origin, WebSocket live reload through the tunnel, and Firebase sign-in on a new domain. Budget 6–10 hours. The site counts as live only when every box below is ticked.

- [ ] `https://app.<domain>` loads with a valid certificate, and refreshing a deep link like `/projects` still works
- [ ] Sign in with Google and with email; sign out; a second account sees none of the first account's projects
- [ ] Create a project, and it starts from the seeded starter template
- [ ] An AI build streams text as it's generated and commits files
- [ ] Code insight answers a question about the project
- [ ] Start a preview: it loads in the app's preview panel, and an AI edit shows up live
- [ ] Invite a collaborator; a viewer can't edit, and a non-member is denied
- [ ] Stripe test checkout with card `4242 4242 4242 4242` upgrades the plan through the webhook
- [ ] Hitting a quota shows the friendly limit message, not an error
- [ ] `/internal/...` paths return 404 from the internet
- [ ] Reboot the VM: everything comes back on its own within about 5 minutes
- [ ] Start 5 previews in a row, record memory and CPU, and set the final limits from the measured numbers
- [ ] Works in Chrome, Safari, Firefox and on one phone
