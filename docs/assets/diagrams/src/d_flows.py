"""
Request-flow diagrams: sign-in and session trust, AI generation, live-preview start, and the revision pipeline.

Handles: sequence diagrams traced from the controllers, services and proxy code, and the stage → manifest →
apply → publish flow in RevisionPublisherImpl.
"""
from kit import Sequence, Scene, C, LINE, MUTED

G, B, P, O, Y, R, T, GR = C["green"], C["blue"], C["purple"], C["orange"], C["yellow"], C["red"], C["teal"], C["gray"]


def auth():
    q = Sequence("Flow — sign-in and session trust",
                 "Firebase signs the user in; account-service mints the session; every service verifies it itself",
                 [dict(id="br", label="Browser", sub="React SPA", icon="react", color=B),
                  dict(id="fb", label="Firebase Auth", sub="identity provider", icon="firebase", color=Y),
                  dict(id="gw", label="gateway-service", sub="routes by path", icon="spring", color=G),
                  dict(id="ac", label="account-service", sub="AuthController", icon="springboot", color=G),
                  dict(id="ot", label="workspace / intelligence", sub="SessionAuthFilter", icon="springboot", color=G)],
                 col=250)
    q.msg("br", "fb", "sign in · password, Google or second factor")
    q.msg("fb", "br", "Firebase ID token", ret=True)
    q.msg("br", "gw", "POST /api/auth/session { idToken } + X-XSRF-TOKEN")
    q.msg("gw", "ac", "route /api/auth/**")
    q.msg("ac", "fb", "verify ID token (Firebase Admin SDK)", color=Y)
    q.msg("ac", "ac", "find or create User · audit SIGN_IN")
    q.msg("ac", "br", "Set-Cookie: vc_session (httpOnly, 5 days)", ret=True)
    q.note(["br", "ot"], "every later request carries the cookie to the service that owns its path")
    q.msg("br", "gw", "GET /api/projects  (cookie)")
    q.msg("gw", "ot", "route /api/projects/**")
    q.msg("ot", "ot", "SessionCache hit? (entries live ≤ 60 s)")
    q.frame_start("alt", "cache miss")
    q.msg("ot", "ac", "GET /internal/v1/sessions/revoked?cookieHash=", color=P)
    q.msg("ot", "fb", "verify session cookie", color=Y)
    q.msg("ot", "ac", "GET /internal/v1/users/by-firebase-uid", color=P)
    q.frame_end()
    q.msg("ot", "br", "200 · request runs as UserPrincipal", ret=True)
    q.frame_start("sign-out", "POST /api/auth/logout", O)
    q.msg("br", "ac", "POST /api/auth/logout  (through the Gateway)")
    q.msg("ac", "ac", "store RevokedSession (cookie SHA-256)")
    q.msg("ac", "ot", "POST /internal/v1/sessions/evict · every instance via Eureka", color=O)
    q.frame_end()
    return q.render()


def ai_generation():
    q = Sequence("Flow — AI generation",
                 "A chat prompt becomes committed project files, published as one atomic revision",
                 [dict(id="fe", label="Frontend", sub="ChatPanel · use-stream-parser", icon="react", color=B),
                  dict(id="cc", label="ChatController", sub="SSE endpoint", icon="springboot", color=G),
                  dict(id="ag", label="AiGenerationService", sub="the pipeline", icon="springboot", color=G),
                  dict(id="ai", label="OpenRouter", sub="Spring AI ChatClient", icon="sparkle", color=Y, icolor="#c4b5fd"),
                  dict(id="ws", label="workspace-service", sub="internal API", icon="springboot", color=P),
                  dict(id="db", label="intelligence DB", sub="PostgreSQL", icon="postgresql", color=R)],
                 col=220)
    q.msg("fe", "cc", "POST /api/chat/stream { message, projectId }")
    q.msg("cc", "ag", "streamResponse()")
    q.msg("ag", "ws", "canEditProject → GET members/{userId}", color=P)
    q.msg("ag", "ag", "assertWithinDailyTokenBudget · 402 if spent")
    q.msg("ag", "ws", "GET files → tree for FileTreeContextAdvisor", color=P)
    q.msg("ag", "ai", "Flux.defer(chatClient.prompt()…stream())", color=Y)
    q.frame_start("loop", "while the model streams")
    q.msg("ai", "ag", "tool call: read_files", ret=True)
    q.msg("ag", "ws", "GET files/content", color=P)
    q.msg("ai", "ag", "raw chunks · <message> <todo> <file> tags", ret=True)
    q.msg("ag", "fe", "SSE { text }  (checklist ticks off live)", ret=True)
    q.frame_end()
    q.msg("ag", "ag", "LlmResponseParser → ChatEvent rows")
    q.msg("ag", "ws", "recheck access, then POST /revisions (whole turn)", color=P)
    q.msg("ws", "ag", "APPLIED | FAILED | CONFLICT + previousContent", ret=True)
    q.msg("ag", "db", "save ChatMessage + ChatEvents", color=R)
    q.msg("ag", "db", "record usage · UsageLog + UsageEvent", color=R)
    q.note(["cc", "ag"], "closing the browser only stops watching · a stopped generation is discarded, not billed")
    return q.render()


def live_preview():
    q = Sequence("Flow — starting a live preview",
                 "workspace-service claims a warm pod, boots the dev server, and routes a signed hostname to it",
                 [dict(id="fe", label="Frontend", sub="PreviewPanel", icon="react", color=B),
                  dict(id="px", label="preview-proxy", sub="proxy/index.js", icon="nodedotjs", color=P),
                  dict(id="ws", label="workspace-service", sub="PreviewDeploymentService", icon="springboot", color=G),
                  dict(id="rd", label="Redis", sub="routes", icon="redis", color=P),
                  dict(id="k8", label="Kubernetes API", sub="fabric8 client", icon="kubernetes", color=B),
                  dict(id="pod", label="Preview pod", sub="runner + syncer", icon="kubernetes", color=P)],
                 col=220)
    q.msg("fe", "ws", "POST /api/projects/{id}/preview")
    q.msg("ws", "ws", "per-project lock · plan check (402 PREVIEW_LIMIT)")
    q.msg("ws", "k8", "list status=idle · merge patch idle→busy + resourceVersion", color=B)
    q.msg("k8", "ws", "claimed  (a 409 means try the next pod)", ret=True)
    q.msg("ws", "fe", "202 PreviewResponse · CREATING", ret=True)
    q.frame_start("async", "PreviewBootstrapper", G)
    q.msg("ws", "pod", "k8s exec · syncer: mc mirror projects/{id} → /app", color=B)
    q.msg("ws", "pod", "k8s exec · runner: npm install && vite dev --port 5173", color=B)
    q.frame_start("loop", "every few seconds until ready")
    q.msg("ws", "pod", "k8s exec · probe: wget /@vite/client", color=B)
    q.frame_end()
    q.msg("ws", "rd", "SET route:<host> → podIp:5173", color=P)
    q.frame_end()
    q.msg("fe", "ws", "GET /preview  (poll)")
    q.msg("ws", "fe", "RUNNING · previewUrl …/?pvt=<HMAC token>", ret=True)
    q.msg("fe", "px", "load https://p<id>-<random>.<domain>/?pvt=…")
    q.msg("px", "px", "verify HMAC-SHA256 token · 401 if bad")
    q.msg("px", "fe", "302 without ?pvt · Set-Cookie pv_auth", ret=True)
    q.msg("px", "rd", "GET route:<host> · SET seen:<host>", color=P)
    q.msg("px", "pod", "proxy HTTP + WebSocket → :5173", color=P)
    q.msg("pod", "fe", "the running app (through the proxy)", ret=True)
    return q.render()


def revisions():
    s = Scene(1700, 820, "File revisions — RevisionPublisherImpl",
              "Every AI turn and every restore publishes one immutable revision: all of it lands, or none of it does")
    s.group(40, 120, 230, 470, "Sources", GR, "flag")
    s.group(310, 120, 1350, 470, "Publish pipeline", G, "layers", sub="workspace-service")
    s.group(310, 630, 1350, 150, "Storage", R, "db")

    ai = s.node(60, 180, "AI turn", "sparkle", "POST /internal/v1/…/revisions", w=190, h=96, accent=Y, icolor="#c4b5fd")
    rs = s.node(60, 330, "Restore", "undo", "POST /revisions/{id}/restore", w=190, h=96, accent=B, icolor=B)
    s.pill(155, 470, "restore = diff to the old", GR)
    s.pill(155, 496, "snapshot, source RESTORE", GR)

    st = s.node(340, 250, "1 · Stage", "bucket", "upload blobs by sha256", w=190, h=96, accent=G, icolor=G)
    mf = s.node(580, 250, "2 · Manifest", "db", "revision STAGING + entries", w=200, h=96, accent=G, icolor=G)
    vd = s.node(830, 250, "Validators", "check", "optional · tsc --noEmit", w=190, h=96, accent=T, icolor=T)
    ap = s.node(1070, 250, "3 · Apply", "layers", "copy blobs onto live keys", w=200, h=96, accent=G, icolor=G)
    pb = s.node(1320, 250, "4 · Publish", "key", "CAS current revision", w=190, h=96, accent=G, icolor=G)

    ok = s.node(1545, 250, "APPLIED", "check", "now current", w=100, h=96, accent=G, icolor=G)
    fl = s.node(870, 440, "FAILED", "undo", "rolled back · nothing changed", w=230, h=90, accent=R, icolor=R)
    cf = s.node(1320, 440, "CONFLICT", "undo", "lost the race · rolled back", w=190, h=90, accent=O, icolor=O)

    blobs = s.node(340, 670, "project-blobs", "minio", "blob/<sha256> · immutable", layout="row", w=270, accent=R)
    tabs = s.node(700, 670, "PostgreSQL", "postgresql", "revisions · entries · projects.current_file_revision_id", layout="row", w=360, accent=R)
    live = s.node(1150, 670, "projects bucket", "minio", "{projectId}/{path} · read by previews", layout="row", w=320,
                  accent=R)

    s.edge([ai.r(), (295, ai.cy), (295, st.cy - 12), st.l(-12)], None, Y)
    s.edge([rs.r(), (295, rs.cy), (295, st.cy + 12), st.l(12)], None, B)
    s.edge([st.r(), mf.l()], None, G)
    s.edge([mf.r(), vd.l()], None, T)
    s.edge([vd.r(), ap.l()], "pass", G)
    s.edge([ap.r(), pb.l()], None, G)
    s.edge([pb.r(), ok.l()], "won", G)
    s.edge([pb.b(), cf.t()], "lost CAS", O)
    s.edge([ap.b(-40), (ap.cx - 40, fl.cy), fl.r()], "any error → undo applied", R, at=(ap.cx - 40, 400))
    s.edge([vd.b(), (vd.cx, fl.y)], "rejected", T, dashed=True)
    s.edge([st.b(), blobs.t(-60)], "write", R, dashed=True)
    s.edge([mf.b(), (mf.cx, 620), (tabs.cx - 60, 620), tabs.t(-60)], "insert", R, dashed=True, at=(mf.cx, 620))
    s.edge([ap.b(60), (ap.cx + 60, 640), (live.x + 80, 640), (live.x + 80, live.y)], "server-side copy", R, dashed=True,
           at=(ap.cx + 60, 560))
    s.edge([pb.r(30), (1525, pb.cy + 30), (1525, 600), (tabs.cx + 80, 600), tabs.t(80)], "advance current revision", G,
           dashed=True, at=(1450, 600))
    s.legend(60, 800, [("solid", G, "happy path"), ("solid", R, "rollback"), ("solid", O, "conflict"),
                       ("dashed", R, "storage write")])
    return s
