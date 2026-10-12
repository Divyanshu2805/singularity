package com.singularity.workspace.util;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The two files a project is given when it leaves the workspace - in a ZIP download or a push to GitHub - if it does
 * not already hold them: a README that says how to run it and how to put it online, and a .gitignore.
 *
 * <p>Handles: deciding which of the two a project lacks, and writing a README for the project in front of it - whether
 * it has a server of its own, and which of the run commands its package.json really has - in words for someone who has
 * never run a project outside the workspace.
 *
 * <p>They are written as the project leaves and are never stored in it. A stored README would be one more file for a
 * build turn to keep true, and it would describe the project as it was on the day it was written; this one is made
 * from the files being handed over. A project that has a README of its own keeps it, and so with .gitignore: neither
 * is ever replaced.
 *
 * <p>The README names only commands that exist. A project made before the starter template carried the server's
 * scripts has no {@code dev:all}, and telling its owner to run it would be the first thing that failed; such a
 * project is given the longer way that works. A project with a server but without the launcher ({@code start.mjs})
 * and its {@code start} script cannot be hosted as one program, and its README says that plainly rather than give
 * steps that end in a page with nothing behind it. The same goes for the server itself: it is there when
 * {@code server/index.ts} is, which is the one thing the preview goes by too.
 *
 * <p>A project with a server needs a host that runs a program, and its data is a file beside it. The README says
 * plainly what a free plan does to that file, because a game that loses its scores overnight with no explanation
 * looks broken, and it is the host's doing, not the app's.
 */
public final class ProjectHandout {

    public static final String README = "README.md";
    public static final String GITIGNORE = ".gitignore";
    public static final String SERVER_ENTRY = "server/index.ts";
    public static final String PACKAGE_JSON = "package.json";
    static final String LAUNCHER = "start.mjs";

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String IGNORED = """
            node_modules
            dist
            .data
            .env
            .env.*
            *.local
            """;

    public record Extra(String path, String content) {
    }

    private ProjectHandout() {
    }

    public static List<Extra> extrasFor(String projectName, Collection<String> paths, String packageJson) {
        Set<String> rootNames = new HashSet<>();
        for (String path : paths) {
            if (path != null && !path.contains("/")) {
                rootNames.add(path.toLowerCase(Locale.ROOT));
            }
        }
        List<Extra> extras = new ArrayList<>();
        boolean hasReadme = rootNames.stream().anyMatch(name -> name.equals("readme") || name.startsWith("readme."));
        if (!hasReadme) {
            extras.add(new Extra(README, readme(projectName, paths.contains(SERVER_ENTRY), paths.contains(LAUNCHER),
                    scriptsOf(packageJson))));
        }
        if (!rootNames.contains(GITIGNORE)) {
            extras.add(new Extra(GITIGNORE, IGNORED));
        }
        return extras;
    }

    static Set<String> scriptsOf(String packageJson) {
        Set<String> names = new HashSet<>();
        if (packageJson == null || packageJson.isBlank()) {
            return names;
        }
        try {
            JsonNode scripts = JSON.readTree(packageJson).path("scripts");
            if (scripts.isObject()) {
                names.addAll(scripts.propertyNames());
            }
        } catch (RuntimeException e) {
            return names;
        }
        return names;
    }

    static String readme(String projectName, boolean hasServer, boolean hasLauncher, Set<String> scripts) {
        String title = projectName == null || projectName.isBlank() ? "This app" : projectName.strip().replaceAll("[\\r\\n]+", " ");
        StringBuilder text = new StringBuilder();
        text.append("# ").append(title).append("\n\n")
                .append("Built with Singularity. This folder is the whole app: you can run it on your own computer and put it ")
                .append("online yourself.\n\n")
                .append("## What is in here\n\n")
                .append("- `src/` - the pages people see, written in React and TypeScript.\n");
        if (hasServer) {
            text.append("- `server/` - the app's own server. Its routes are in `server/index.ts` and its database tables in ")
                    .append("`server/db.ts`.\n");
        }
        if (hasLauncher) {
            text.append("- `start.mjs` - runs the finished app as one program on a hosting site. Leave it as it is.\n");
        }
        text.append("- `package.json` - the packages the app uses, and the commands below.\n\n")
                .append("## Run it on your computer\n\n")
                .append("1. Install Node.js, version 22 or newer, from https://nodejs.org.\n")
                .append("2. Open a terminal in this folder.\n")
                .append("3. Install the packages. You do this once:\n\n")
                .append("   ```\n   npm install\n   ```\n\n");
        if (!hasServer) {
            text.append("4. Start it:\n\n   ```\n   npm run dev\n   ```\n\n");
        } else if (scripts.contains("dev:all")) {
            text.append("4. Start the pages and the server together:\n\n   ```\n   npm run dev:all\n   ```\n\n");
        } else {
            text.append("4. Start the pages in this terminal:\n\n   ```\n   npm run dev\n   ```\n\n")
                    .append("   and the server in a second terminal, in the same folder:\n\n   ```\n   ")
                    .append(scripts.contains("server") ? "npm run server" : "npx tsx watch server/index.ts").append("\n   ```\n\n");
        }
        text.append("5. Open the address it prints, usually http://localhost:5173.\n\n");
        if (hasServer) {
            text.append("The server keeps its data in a folder named `.data`, which it makes by itself. Delete that folder to ")
                    .append("start again with no data.\n\n");
        }
        text.append("## Put it online\n\n");
        if (!hasServer) {
            text.append("This app has no server, so it is a set of files that any static host can serve.\n\n")
                    .append("- The short way: press Publish in Singularity.\n")
                    .append("- On a host of your own: run `npm run build`, then upload the `dist` folder it makes to a static ")
                    .append("host such as GitHub Pages, Netlify or Cloudflare Pages.\n");
            return text.toString();
        }
        boolean oneProgram = hasLauncher && scripts.contains("start");
        if (!oneProgram) {
            text.append("This app has a server, and it was made before projects here could run as one program on a host. ")
                    .append("Hosting it needs two things a host can start separately - the built pages (`npm run build`, ")
                    .append("then the `dist` folder on any static host) and the server (`npx tsx server/index.ts`) - with ")
                    .append("the pages' requests to `/api` sent to the server. The simpler way: start a new project in ")
                    .append("Singularity and ask for the same app; new projects carry a `start.mjs` that does this for you.\n");
            return text.toString();
        }
        String start = "npm start";
        text.append("This app has a server, so it needs a host that runs Node.js programs. The steps below use Render ")
                .append("(https://render.com), which has a free plan. Any host that runs a Node.js app from a GitHub repository ")
                .append("is set up the same way.\n\n")
                .append("1. Put this folder on GitHub. In Singularity, open the project, press GitHub and push it. Or make a ")
                .append("repository on https://github.com yourself and upload the folder.\n")
                .append("2. On Render, sign in with GitHub, choose New, then Web Service, and pick the repository.\n")
                .append("3. Give it these two commands:\n")
                .append("   - Build command: `npm install --include=dev && npm run build`\n")
                .append("   - Start command: `").append(start).append("`\n")
                .append("4. If it asks for a Node.js version, choose 22.\n")
                .append("5. Create the service. When it has finished, the host shows the app's link. Anyone can open it.\n\n")
                .append("What to know before you share the link:\n\n")
                .append("- **A free plan sleeps.** When nobody has used the app for a while the host stops it, and the next ")
                .append("visit waits while it starts again.\n")
                .append("- **A free plan does not keep files.** The app's data is the `.data` folder, and on a free plan it is ")
                .append("empty again after every restart. For data that lasts, the host has to give the app a disk that it ")
                .append("keeps, placed where the `.data` folder is; on Render that is a paid extra.\n")
                .append("- **The host picks the port** and tells the app through `PORT`. `start.mjs` reads it, so there is ")
                .append("nothing to set.\n")
                .append("- **To change the app later**, push again. A host connected to the repository builds the new version ")
                .append("by itself.\n");
        return text.toString();
    }
}
