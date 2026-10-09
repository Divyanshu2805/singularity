# The publishing checklist

What the automated tests cannot see, and how to check it by hand. The server side - the build in a real pod, the storage, the proxy's headers and routing, the take-down - is proven by `PublishPipelineIT` on a real cluster (and its numbers are in [capacity](../deployment/capacity.md#publishing)); this is the browser and the production environment. Go down it once locally after any change to `PublishMenu.tsx`, `SharedApp.tsx`, `proxy/published*.js` or the publishing classes, and once on production after the first deploy that carries it.

Set up as in [publishing locally](publishing.md). Use two browsers (or one signed in, one in a private window) for the cases that need a second person.

## In the app

| # | Do | Expect |
|---|---|---|
| 1 | Open a project you own. Look at the header. | A **Publish** chip beside Share. A viewer or editor sees the chip too (as "Publish", or "Published" when it is) but no controls inside. |
| 2 | Press it on a project never published. | The panel opens folded to a short explanation, an optional **Link name** field showing the suggested name as its placeholder, and **Publish**. Nothing was requested or started by opening it. |
| 3 | Type `www`, then `ab`, then `my--app`. | Each says why under the field and **Publish** is disabled. |
| 4 | Clear the field and press **Publish**. | The steps list appears and advances: Collecting, Starting a build machine, Copying, Installing packages, Building, Checking, Collecting the build, Putting it online. The chip shows the spinner. |
| 5 | When it finishes. | "Published", the link with **Copy** (the icon ticks) and **Open** (a new tab). The chip reads "Published" with a green dot. |
| 6 | Open the link in a private window. | The app, with a small "Built with Singularity" mark at the bottom right. No sign-in asked. Refresh on a route of the app (change the path): the app, not an error. A path that does not exist with a file extension: a plain "Page not found". |
| 7 | Dashboard and sidebar. | The project's card carries a **Published** mark that opens the app; it shows for an editor and a viewer too. |
| 8 | Ask the chat for a visible change, then open Publish. | "You have changes that are not published" and **Update**. |
| 9 | Press **Update**. | The same steps ("Updating"); the old version stays online until the new one is. Refresh the link: the change is there. |
| 10 | Ask the chat to break the app (an import of a file that does not exist), then **Update**. | The build fails with one plain sentence naming the file, "The update failed ... the app that is online is unchanged", and **Show output** (nothing is fetched until pressed). The link still serves the last good version. |
| 11 | Tick **Share the code**. Open the code page's link (**Copy the code page's link**) in a private window. | `/p/<name>`: the app's name, **Open the app**, the file tree and a read-only viewer. No `.env` file in the tree. A binary file says so. |
| 12 | Press **Sign in to fork** there, sign in. | You come straight back to the page, and **Fork** now makes a project you own, with the same files, and opens it. |
| 13 | Untick **Share the code**. Reload the code page. | "This app isn't shared." |
| 14 | Press **Unpublish**, confirm. | The link stops working (within a few seconds); the panel says "Not published ... your link is kept". Publish again: the same link comes back. |
| 15 | On a plan that allows one app, publish a second project. | The upgrade dialog ("The Free plan includes 1 published app"), not a red error. |
| 16 | Press Publish twice quickly. | One build; the second press shows the build already running. Press again within 30 seconds of the last start: a short wait message, not a second build. |
| 17 | Delete the project while published. | The link stops working. |

## On production

After the first deploy that carries publishing:

1. The `MINIO_PUBLISHED_SECRET` GitHub secret exists (the deploy refuses to run without it), and `kubectl -n singularity get job minio-bootstrap-published-reader` shows it complete.
2. `kubectl -n singularity-ai logs deploy/singularity-proxy` does **not** say "Published apps are off".
3. Publish an app from the production site. Its link is `https://<name>.divyanshuagrahari.dev/` - single level, so the existing wildcard certificate covers it. Open it from a phone on mobile data.
4. `curl -sI https://<name>.divyanshuagrahari.dev/` shows `content-security-policy`, `x-content-type-options: nosniff`, `x-robots-tag: noindex` and no `set-cookie`.
5. Unpublish; the link answers 404 "isn't published" within about ten seconds.
6. Record the build time you saw in [capacity](../deployment/capacity.md#publishing).

## Not verified here

How a published app behaves under load, and from a browser that blocks third-party cookies or storage, have not been measured.
