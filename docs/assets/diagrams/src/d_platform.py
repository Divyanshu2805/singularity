"""
Platform diagrams: service-to-service communication, the production deployment topology, and the CI/CD pipeline.

Handles: the real Feign clients and their endpoints, the eviction push through Eureka, the k3s namespaces and
workloads, the tunnel and Tailscale paths, and ci.yml's actual job graph.
"""
from kit import Scene, C, LINE, MUTED


def service_communication():
    s = Scene(1560, 960, "Service-to-service communication",
              "The internal API (/internal/v1) — Feign clients, the shared secret, and what each call is for")
    p, g, gy = C["purple"], C["green"], LINE
    s.group(40, 110, 1480, 790, "Backend", C["green"], "box", sub="internal API is never routed by the Gateway")

    eur = s.node(90, 150, "discovery-service", "spring", "Eureka · resolves lb:// names", layout="row", w=250, accent=g)
    acc = s.node(640, 200, "account-service", "springboot", "owns users, plans, sessions", w=280, h=92, accent=g)
    ws = s.node(170, 650, "workspace-service", "springboot", "owns projects, files, previews", w=290, h=92, accent=g)
    ai = s.node(1100, 650, "intelligence-service", "springboot", "owns chat, AI, usage", w=290, h=92, accent=g)

    s.edge([acc.l(-30), (400, acc.cy - 30), (400, eur.cy), eur.r()], "getInstances()", gy, dashed=True, at=(520, acc.cy - 30))

    s.edge([ws.t(-70), (ws.cx - 70, acc.cy + 20), (acc.x, acc.cy + 20)], None, p)
    s.edge([ai.t(150), (ai.cx + 150, acc.cy + 30), (acc.x + acc.w, acc.cy + 30)], None, p)
    s.listbox(265, 330, "workspace → account · AccountServiceClient", [
        "GET  /users/{id}",
        "GET  /users/by-username",
        "GET  /users/by-firebase-uid",
        "GET  /users/{id}/plan-limits",
        "GET  /sessions/revoked"], p)
    s.listbox(1080, 330, "intelligence → account · AccountServiceClient", [
        "GET  /users/{id}",
        "GET  /users/by-username",
        "GET  /users/by-firebase-uid",
        "GET  /users/{id}/plan-limits",
        "GET  /sessions/revoked"], p)

    s.edge([acc.b(-40), (acc.cx - 40, 560), (ws.cx + 70, 560), ws.t(70)], None, C["orange"], dashed=True)
    s.edge([acc.b(40), (acc.cx + 40, 560), (ai.cx - 70, 560), ai.t(-70)], None, C["orange"], dashed=True)
    s.pill(acc.cx, 560, "POST /sessions/evict · every instance", C["orange"], mono=True)

    s.edge([ai.l(-18), ws.r(-18)], None, p)
    s.listbox(560, 420, "WorkspaceServiceClient  (intelligence)", [
        "GET   /projects/{id}/members/{userId}",
        "GET   /projects/{id} · /projects?ids=",
        "GET   /projects/{id}/files[/content]",
        "POST  /projects/{id}/revisions",
        "GET   /projects/owned-count",
        "GET   /previews/running-count"], p) if False else None
    s.listbox(585, 590, "intelligence → workspace · WorkspaceServiceClient", [
        "GET   /projects/{id}/members/{userId}",
        "GET   /projects/{id}  ·  /projects?ids=",
        "GET   /projects/{id}/files  [/content]",
        "POST  /projects/{id}/revisions",
        "GET   /projects/owned-count",
        "GET   /previews/running-count"], p)
    s.edge([ws.b(), (ws.cx, 820), (ai.cx, 820), ai.b()], None, C["pink"])
    s.pill(780, 820, "IntelligenceServiceClient → POST /projects/{id}/generation/stop", C["pink"], mono=True)

    s.listbox(1010, 125, "How a call is authenticated", [
        "Header  X-Internal-Service-Token",
        "Added by FeignClientInterceptor",
        "Grants ROLE_INTERNAL_SERVICE",
        "No @FeignClient(path) prefix",
        "2 s connect · 5 s read · 3 tries"], C["yellow"], mono=False)
    s.legend(60, 925, [("solid", p, "user & project lookups, file reads, revision publish"),
                       ("dashed", C["orange"], "sign-out eviction push"), ("solid", C["pink"], "stop generation"),
                       ("dashed", gy, "discovery")])
    return s


def deployment_topology():
    s = Scene(1640, 1000, "Production deployment topology",
              "One Oracle Cloud Arm VM running single-node k3s · no open inbound ports")
    o, g, p, r, y, b = C["orange"], C["green"], C["purple"], C["red"], C["yellow"], C["blue"]

    s.group(40, 120, 230, 820, "Outside", C["gray"], "user")
    s.group(310, 120, 1060, 820, "Oracle VM · k3s", C["teal"], "k3s" if False else "layers",
            sub="VM.Standard.A1.Flex · 2 OCPU · 12 GB · Ubuntu 24.04 arm64")
    s.group(340, 180, 640, 560, "namespace vibecraft", C["green"], "box", sub="trusted")
    s.group(1010, 180, 330, 560, "namespace vibecraft-ai", C["purple"], "pod", sub="untrusted code")
    s.group(1410, 120, 200, 820, "External", C["yellow"], "sparkle")

    vis = s.node(62, 170, "Visitors", "browser", "HTTPS", w=186, accent=C["gray"])
    cf = s.node(62, 320, "Cloudflare", "cloudflare", "DNS · TLS · wildcard cert", w=186, accent=o)
    gh = s.node(62, 520, "GitHub Actions", "githubactions", "CI/CD", w=186, accent=C["gray"])
    ghcr = s.node(62, 690, "GHCR", "github", "8 arm64 images · :sha", w=186, accent=C["gray"])
    tsn = s.node(62, 850, "Tailscale", "tailscale", "tailnet", layout="row", w=186, accent=C["gray"])

    cfd = s.node(370, 220, "cloudflared", "cloudflare", "Deployment", layout="row", w=190, accent=o)
    fe = s.node(370, 310, "frontend", "nginx", "nginx · SPA", layout="row", w=190, accent=b)
    gw = s.node(370, 400, "gateway-service", "spring", ":8000", layout="row", w=190, accent=g)
    eu = s.node(370, 490, "discovery-service", "spring", "Eureka :8761", layout="row", w=190, accent=g)
    sv = s.node(600, 220, "account · workspace · intelligence", "springboot", "3 Deployments · 512–640 Mi", layout="row",
                w=350, accent=g)
    pg = s.node(600, 330, "postgres", "postgresql", "StatefulSet · 10 GB local-path", layout="row", w=350, accent=r)
    mi = s.node(600, 420, "minio", "minio", "StatefulSet · 20 GB local-path", layout="row", w=350, accent=r)
    bk = s.node(600, 510, "nightly-backup", "clock", "CronJob · 02:30 IST", layout="row", w=350, accent=r, icolor=r)
    s.listbox(370, 600, "Secrets (rebuilt every deploy by apply-secrets.sh)", [
        "db · minio · internal-service · preview-token · firebase",
        "openrouter · stripe · tunnel · r2"], C["yellow"], w=580)

    px = s.node(1035, 220, "preview-proxy", "nodedotjs", "Node · :80", layout="row", w=280, accent=p)
    rd = s.node(1035, 310, "redis", "redis", "routes only · no volume", layout="row", w=280, accent=p)
    rp = s.node(1035, 400, "runner-pool", "kubernetes", "warm pool · 1 idle pod", layout="row", w=280, accent=p)
    pv = s.node(1035, 490, "preview pods", "kubernetes", "claimed · max 6 active", layout="row", w=280, accent=p)
    s.listbox(1035, 600, "Guardrails", ["non-root · caps dropped", "NetworkPolicy · PID limit", "ResourceQuota"], p,
              w=280, mono=False)

    kapi = s.node(340, 790, "k3s API", "k3s", "Tailscale-only · :6443", layout="row", w=260, accent=C["teal"])
    s.node(640, 790, "local-path volumes", "db", "100 GB boot disk", layout="row", w=260, accent=C["teal"],
           icolor=C["teal"])
    s.node(980, 790, "secrets encryption", "lock", "--secrets-encryption", layout="row", w=260, accent=C["teal"],
           icolor=C["teal"])

    r2 = s.node(1428, 170, "Cloudflare R2", "cloudflare", "backups", w=164, accent=y)
    fb = s.node(1428, 330, "Firebase", "firebase", "auth", w=164, accent=y)
    st = s.node(1428, 490, "Stripe", "stripe", "billing", w=164, accent=y)
    orr = s.node(1428, 650, "OpenRouter", "sparkle", "AI", w=164, accent=y, icolor="#c4b5fd")

    s.edge([vis.b(), cf.t()], "HTTPS", o)
    s.edge([cfd.l(), (290, cfd.cy), (290, cf.cy), cf.r()], "outbound tunnel", o, at=(290, 290), both=True)
    s.edge([gh.b(), ghcr.t()], "push images", C["gray"])
    s.edge([gh.l(), (52, gh.cy), (52, tsn.cy), tsn.l()], None, LINE, dashed=True)
    s.edge([tsn.r(), (322, tsn.cy), (322, kapi.cy), kapi.l()], "kubectl apply -k", LINE, dashed=True, at=(300, tsn.cy + 30))
    s.edge([ghcr.r(), (330, ghcr.cy)], "pull :sha", C["gray"], dashed=True, at=(300, ghcr.cy - 20))
    s.edge([bk.r(), (990, bk.cy), (990, 150), (r2.cx, 150), r2.t()], "pg_dump + mc mirror", r, dashed=True,
           at=(1200, 150))
    s.edge([(1370, 560), (1395, 560), (1395, fb.cy), fb.l()], None, y, dashed=True)
    s.edge([(1395, st.cy), st.l()], None, y, dashed=True)
    s.edge([(1395, 560), (1395, orr.cy), orr.l()], None, y, dashed=True)
    s.pill(1395, 790, "service API calls", y)
    s.legend(360, 972, [("solid", o, "public traffic"), ("dashed", LINE, "admin / deploy over Tailscale"),
                        ("dashed", r, "backup"), ("dashed", y, "external APIs")])
    return s


def cicd():
    s = Scene(1640, 820, "CI/CD pipeline — .github/workflows/ci.yml",
              "Each test job gates only its own image; all four image jobs gate the deploy")
    b, g, p, o, r, gr = C["blue"], C["green"], C["purple"], C["orange"], C["red"], C["gray"]

    s.group(40, 120, 220, 620, "Trigger", gr, "flag")
    s.group(300, 120, 280, 620, "Test", b, "check")
    s.group(620, 120, 340, 620, "Build images · arm64", p, "docker" if False else "box")
    s.group(1000, 120, 380, 620, "Deploy · production", g, "layers", sub="one at a time")
    s.group(1420, 120, 180, 620, "Outcome", o, "flag")

    t1 = s.node(60, 200, "push to main", "github", "tests → images → deploy", w=180, accent=gr)
    t2 = s.node(60, 360, "pull request", "github", "tests only · no secrets", w=180, accent=gr)
    t3 = s.node(60, 520, "workflow_dispatch", "githubactions", "redeploy a SHA", w=180, accent=gr)
    s.pill(150, 700, "push / PR triggers currently off", C["yellow"])

    be = s.node(320, 190, "backend", "apachemaven", "./mvnw clean package · 452 tests", layout="row", w=240, accent=b)
    fe = s.node(320, 330, "frontend", "vite", "tsc · lint · vitest · build", layout="row", w=240, accent=b)
    pr = s.node(320, 470, "proxy", "nodedotjs", "npm ci · npm test", layout="row", w=240, accent=b)

    ji = s.node(640, 190, "build-java-images", "docker", "matrix × 5 services", layout="row", w=300, accent=p)
    fi = s.node(640, 330, "build-frontend-image", "docker", "VITE_* build args", layout="row", w=300, accent=p)
    pi = s.node(640, 470, "build-proxy-image", "docker", "npm ci --omit=dev", layout="row", w=300, accent=p)
    ri = s.node(640, 610, "build-preview-runner-image", "docker", "no test gate", layout="row", w=300, accent=p)

    steps = [("join tailnet", "tailscale", "ephemeral node · tag:ci"),
             ("kubeconfig", "key", "deployer token · wait for /livez"),
             ("apply-secrets.sh", "lock", "GitHub env → k8s Secrets"),
             ("kubectl apply -k", "k3s", "oracle overlay · image tag = SHA"),
             ("rollout status", "kubernetes", "dependency order · 5 min each"),
             ("smoke-test.sh", "check", "/ · /api/plans · preview host")]
    nodes = []
    for i, (lab, ic, sub) in enumerate(steps):
        nodes.append(s.node(1020, 160 + i * 92, lab, ic, sub, layout="row", w=340, accent=g,
                            icolor=None if ic in ("tailscale", "k3s", "kubernetes") else g))
    for a, c in zip(nodes, nodes[1:]):
        s.edge([a.b(), c.t()], None, g)

    live = s.node(1440, 330, "Live", "check", "new SHA serving", w=140, accent=g, icolor=g)
    rb = s.node(1440, 520, "Rollback", "undo", "rollout undo", w=140, accent=r, icolor=r)

    for t in (t1, t2, t3):
        pass
    s.edge([(282, be.cy), (282, pr.cy)], None, b, arrow=False)
    s.edge([t1.r(), (282, t1.cy)], None, b, arrow=False)
    s.edge([t2.r(), (282, t2.cy)], None, b, arrow=False)
    for n in (be, fe, pr):
        s.edge([(282, n.cy), n.l()], None, b)
    s.edge([t3.r(), (270, t3.cy), (270, 740), (990, 740), (990, nodes[0].cy), nodes[0].l()], "manual: skip tests & builds",
           C["yellow"], dashed=True, at=(620, 740))
    s.edge([be.r(), ji.l()], None, p)
    s.edge([fe.r(), fi.l()], None, p)
    s.edge([pr.r(), pi.l()], None, p)
    for n in (ji, fi, pi, ri):
        s.edge([n.r(), (975, n.cy), (975, nodes[0].cy), nodes[0].l()], None, g)
    s.pill(975, 430, "needs all 4", g)
    s.edge([nodes[-1].r(), (1400, nodes[-1].cy), (1400, live.cy), live.l()], "pass", g, at=(1400, 450))
    s.edge([nodes[-1].r(12), (1410, nodes[-1].cy + 12), (1410, rb.cy), rb.l()], "fail", r, at=(1410, 600))
    s.legend(60, 790, [("solid", b, "test"), ("solid", p, "image build"), ("solid", g, "deploy"),
                       ("dashed", C["yellow"], "manual redeploy")])
    return s
