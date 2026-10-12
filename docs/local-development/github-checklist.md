# GitHub and Hosting: Setting Up and Checking by Hand

Connecting GitHub needs an app registered on GitHub, and neither it nor a real host can be reached by an automated test. This page is how to switch the feature on, and the cases to go down once it is.

What the suite does prove: the shape of every request to GitHub against a stand-in (`GitHubClientTest`), the whole path from Connect to a second push against a stand-in that behaves like a git host (`GitHubPushFlowTest`), who may push (`GitHubAuthorizationTest`), that the launcher every new project carries serves a built app (`scripts/starter-launcher.test.mjs`), and that model-built projects with a server run through it as one program (`scripts/bench-verify.sh`). What it cannot prove is that the real GitHub and a real host accept the same things.

## Register the app

1. On GitHub: Settings, Developer settings, OAuth Apps, New OAuth App.
2. Homepage URL: the app's address (`http://localhost:5173` locally).
3. Authorization callback URL: that address plus `/github/callback`.
4. Create it, then generate a client secret.

One app has one callback address, so local development and production each need their own.

## Switch it on locally

Add to `.env` at the repository root:

```
GITHUB_ENABLED=true
GITHUB_CLIENT_ID=<the app's client id>
GITHUB_CLIENT_SECRET=<the secret just generated>
GITHUB_TOKEN_KEY=<32 random bytes in base64>
```

Make the key with `openssl rand -base64 32`. It encrypts every stored token; changing it later disconnects everyone. Restart workspace-service. With `GITHUB_ENABLED=true` and one of the three missing it refuses to start, and says which.

## Switch it on in production

Add three secrets to the GitHub `production` environment - `GH_OAUTH_CLIENT_ID`, `GH_OAUTH_CLIENT_SECRET`, `GH_OAUTH_TOKEN_KEY` (GitHub does not allow a secret name that starts with `GITHUB_`) - and deploy. All three or none: some but not all stops the deploy. See [configuration](../deployment/configuration.md).

## Cases

| # | Case | How to provoke it | What should happen | Verified |
|---|---|---|---|---|
| 1 | The feature is off | Run without `GITHUB_ENABLED` | No GitHub button in a project's header | Server: booted both ways, 2026-10-10. In the tab: |
| 2 | Connect | As a project's owner, press GitHub, then Connect GitHub; agree on GitHub | The browser comes back to the same project; the panel says "Not on GitHub yet" and "Connected as" your GitHub name | By hand: |
| 3 | Turn it down | Press Connect GitHub, then Cancel on GitHub | A page says GitHub is not connected, with a link back to the project | By hand: |
| 4 | First push | Leave the name empty, keep Private ticked, press Create and push | A private repository named after the project appears on GitHub with one commit after the first, holding the project's files, a README and a `.gitignore`; the panel shows its link and "On GitHub" | Against a stand-in: automated. Against GitHub: |
| 5 | A name that is taken | Forget the repository, then push with the same name | "GitHub would not make a repository named ..." and nothing else changes | By hand: |
| 6 | Push changes | Ask the chat for a change, open the panel | "Changes not pushed" and a Push changes button; pressing it adds one commit whose message is the request that asked for the newest change, in one line ("Update from Singularity" only when there is nothing to name it by) | Against a stand-in: automated. Against GitHub: |
| 7 | A deleted file | Have the chat delete a file, push | The file is gone from the repository in the new commit | Against a stand-in: automated. Against GitHub: |
| 8 | An environment file | Ask the chat to add a `.env` holding a made-up value (there is no way to add a file by hand), push | The panel says it was left out on purpose; it is not in the repository | Against a stand-in: automated. Against GitHub: |
| 9 | The repository is deleted on GitHub | Delete it there, then press Push changes | "The repository ... is no longer on GitHub"; the panel goes back to offering a first push | By hand: |
| 10 | Access is revoked on GitHub | On GitHub: Settings, Applications, Authorized OAuth Apps, revoke; then push | "GitHub no longer accepts this connection"; the panel offers Connect GitHub again | By hand: |
| 11 | Disconnect | Press Disconnect | The panel offers Connect GitHub; the app is gone from GitHub's Authorized OAuth Apps | By hand: |
| 12 | Someone who is not the owner | Open the panel as an editor and as a viewer | The repository's link if there is one, and no button | Server: automated. In the tab: |
| 13 | Two tabs, one sign-in | Start Connect in one account's tab, finish it signed in as another | "That GitHub sign-in has run out or was not started from this account" | Server: automated. By hand: |
| 14 | A downloaded project runs | Download a project that has a server, unzip, follow its README's "Run it on your computer" | The app opens at the address printed and its data loads | In a container, 2026-10-10. On a computer: |
| 15 | A pushed project is hosted | Follow the README's "Put it online" on the host it names | The host builds it and gives a link; the app works there, and its data is empty again after the host restarts it, as the README says | By hand: |
| 16 | A change redeploys | Push changes from the panel | The host builds the new commit by itself | By hand: |
