# The demo account

A shared, public sign-in the README gives out, so anyone can look around without making an account:

| | |
|---|---|
| Address | `demo@divyanshuagrahari.dev` |
| Password | `demo1234` |
| Name | Journey Tester |
| Firebase uid | `singularity-demo` (`demo.firebase-uid`, the same in every service) |

It opens on one project, **Quick notes you can jot and clear**: the notes app from the README's screenshots, already built, with its chat, its four files and a preview that starts when it is opened. The build is the scripted model's (`StubReplies`), recorded as a real turn, so no model is called to make it.

## What it can and cannot do

It is an ordinary account on the free plan. A visitor can start new projects, ask for changes (which spend the account's daily allowance like anyone's), open previews, take lessons and delete projects.

Its controllers refuse it, with a `403` that says why (`DemoAccount`):

- deleting itself and signing every device out (account-service);
- starting, changing or confirming a payment, and opening the billing portal (account-service);
- connecting GitHub and pushing to it (workspace-service);
- publishing an app and sharing its code (workspace-service);
- inviting anyone to a project (workspace-service).

Settings shows it one box saying so in place of sign-in security and Delete account, and the welcome after signing in does not suggest two-step verification.

What the browser changes with Firebase itself - the password, the address, the name, a second factor - no server can refuse. The daily reset undoes all of them.

## The reset

account-service's `DemoAccountReset`, when `DEMO_ENABLED` is true (production only):

| When | What |
|---|---|
| Every day at 22:00 UTC (03:30 in India) | Puts the account back (`demo.reset-cron`) |
| A few minutes after a start, if the account does not exist | Makes it. A start never resets an account that exists, so a deploy does not wipe a visitor's work |
| Every ten minutes after a run that failed | Tries again - usually another service was not up yet |

Putting it back (`DemoAccountServiceImpl`) deletes the Firebase user and makes it again from nothing (so every session of the account ends), finds or makes its row and sets its name, has workspace-service and intelligence-service delete everything it holds exactly as deleting an account does, makes the sample project and records its first build, and deletes its security trail. Each step can be repeated, so a run that failed part way is finished by the next.

The log says `Put the demo account (user N) back, with its sample project M` on success, and `Couldn't put the demo account back; trying again shortly` with the cause on failure:

```bash
kubectl -n singularity logs deploy/account-service --tail=500 | grep -i "demo account"
```

## Resetting it now, or turning it off

There is no button for a reset now: the account is put back at 03:30, and restarting account-service does not reset an account that exists. If one cannot wait, set `DEMO_RESET_CRON` on account-service to a time a few minutes ahead (Spring's six-field cron, in UTC), let it run, and take the variable away again.

To turn it off, set `demo-enabled: "false"` in `deploy/k8s/overlays/oracle/app-config.yaml` and deploy, then delete the Firebase user `singularity-demo` so nobody can sign in to it, and take the README's demo row out.

The address and password are plain values in account-service's `application.yaml` (`demo.email`, `demo.password`). Changing either takes effect at the next reset.
