"""
The system-architecture diagram: every runtime component and every real connection between them.

Handles: the edge (Cloudflare tunnel routing, Tailscale admin path), the Gateway's routes, Eureka discovery, the three
domain services and their internal API, the data layer, the live-preview namespace, external services and backups.
"""
from kit import Scene, C, LINE

def build():
    s = Scene(1720, 1200, "VibeCraft — system architecture",
              "Every runtime component and connection, as wired in the code and the production manifests")

    s.group(500, 110, 1180, 120, "External services", C["yellow"], "sparkle")
    s.group(40, 270, 180, 830, "Clients", C["gray"], "user")
    s.group(260, 270, 200, 560, "Edge", C["orange"], "cloud")
    s.group(500, 270, 700, 500, "Backend", C["green"], "box", sub="namespace vibecraft")
    s.group(1240, 270, 440, 500, "Data layer", C["red"], "db", sub="namespace vibecraft")
    s.group(500, 820, 700, 280, "Frontend", C["blue"], "browser", sub="namespace vibecraft")
    s.group(1240, 820, 440, 280, "Live previews", C["purple"], "pod", sub="namespace vibecraft-ai")

    fb = s.node(530, 145, "Firebase Auth", "firebase", "ID tokens · session cookies", layout="row", w=240, accent=C["yellow"])
    st = s.node(820, 145, "Stripe", "stripe", "checkout · portal · webhooks", layout="row", w=240, accent=C["yellow"])
    orr = s.node(1110, 145, "OpenRouter", "sparkle", "x-ai/grok-4.5 via Spring AI", layout="row", w=240,
                 accent=C["yellow"], icolor="#c4b5fd")
    r2 = s.node(1410, 145, "Cloudflare R2", "cloudflare", "off-site backups · 7 nights", layout="row", w=240,
                accent=C["yellow"])

    br = s.node(55, 470, "User browser", "browser", "runs the React SPA", w=150, accent=C["gray"])
    gh = s.node(55, 920, "GitHub Actions", "githubactions", "test · build · deploy", w=150, accent=C["gray"])

    cf = s.node(278, 320, "Cloudflare", "cloudflare", "DNS · TLS", w=164, accent=C["orange"])
    tun = s.node(278, 520, "cloudflared", "cloudflare", "outbound tunnel", w=164, accent=C["orange"])
    ts = s.node(278, 700, "Tailscale", "tailscale", "k3s API · admin", layout="row", w=164, accent=C["orange"])

    eur = s.node(530, 320, "discovery-service", "spring", "Eureka · :8761", layout="row", w=220, accent=C["green"])
    gw = s.node(530, 530, "gateway-service", "spring", "Spring Cloud Gateway :8000", layout="row", w=220,
                accent=C["green"])
    acc = s.node(870, 320, "account-service", "springboot", ":8081 · users, plans, sessions", layout="row", w=260,
                 accent=C["green"])
    ws = s.node(870, 490, "workspace-service", "springboot", ":8082 · projects, files, previews", layout="row", w=260,
                accent=C["green"])
    ai = s.node(870, 660, "intelligence-service", "springboot", ":8083 · AI generation, usage", layout="row", w=260,
                accent=C["green"])

    pg = s.node(1270, 320, "PostgreSQL", "postgresql", "3 databases · Flyway-owned", layout="row", w=270, accent=C["red"])
    mio = s.node(1270, 470, "MinIO", "minio", "projects · project-blobs · starter", layout="row", w=270, accent=C["red"])
    bk = s.node(1270, 640, "nightly-backup", "clock", "CronJob · pg-dump + mc upload", layout="row", w=270,
                accent=C["red"], icolor=C["red"])

    ng = s.node(530, 915, "frontend", "nginx", "nginx-unprivileged · static files", layout="row", w=280, accent=C["blue"])
    spa = s.node(880, 915, "React SPA bundle", "react", "React 18 · Vite · TypeScript", layout="row", w=280,
                 accent=C["blue"])

    px = s.node(1270, 865, "preview-proxy", "nodedotjs", "verifies the ?pvt token", layout="row", w=200, accent=C["purple"])
    rd = s.node(1270, 1000, "Redis", "redis", "route:<host> · seen:<host>", layout="row", w=200, accent=C["purple"])
    pod = s.node(1500, 850, "Preview pod", "kubernetes", "warm pool", w=160, h=88, accent=C["purple"])
    s.pill(1580, 962, "runner · vite dev", C["purple"])
    s.pill(1580, 990, "syncer · mc mirror", C["purple"])
    s.pill(1580, 1018, "init · seed node_modules", C["purple"])

    o, g, p, r, y = C["orange"], C["green"], C["purple"], C["red"], C["yellow"]

    s.edge([br.r(), (240, br.cy), (240, cf.cy), cf.l()], "HTTPS", o, at=(240, 430))
    s.edge([cf.b(), tun.t()], "tunnel", o)
    s.edge([tun.r(-22), (484, tun.cy - 22), (484, gw.cy), gw.l()], "/api · /webhooks", o, at=(484, 585))
    s.edge([tun.r(10), (476, tun.cy + 10), (476, ng.cy), ng.l()], "app host", o, at=(476, 880))
    s.edge([tun.r(30), (468, tun.cy + 30), (468, 1130), (1224, 1130), (1224, px.cy), px.l()], "*.domain · preview hosts",
           o, at=(850, 1130))
    s.edge([gh.r(), (240, gh.cy), (240, ts.cy), ts.l()], "deploy", LINE, dashed=True, at=(240, 840))
    s.edge([br.t(), (br.cx, fb.cy), fb.l()], "sign in · Firebase JS SDK", y, dashed=True, at=(300, fb.cy))

    s.edge([gw.r(-14), (815, gw.cy - 14), (815, acc.cy), acc.l()], "/api/auth · plans · me · payments", g,
           at=(815, 430), mono=True)
    s.edge([gw.r(), (815, gw.cy), (815, ws.cy), ws.l()], None, g)
    s.pill(815, 520, "/api/projects/**", g, mono=True)
    s.edge([gw.r(14), (815, gw.cy + 14), (815, ai.cy), ai.l()], "/api/chat · ideas · usage · */code", g,
           at=(815, 628), mono=True)
    s.edge([gw.t(), eur.b()], "lb:// lookup", LINE, dashed=True)
    s.edge([acc.l(), eur.r()], "register", LINE, dashed=True)

    s.edge([(acc.x + 215, acc.y + acc.h), (acc.x + 215, ws.y)], None, p, dashed=True, both=True)
    s.edge([(ws.x + 215, ws.y + ws.h), (ws.x + 215, ai.y)], None, p, dashed=True, both=True)
    s.pill(1085, 432, "/internal/v1 · Feign", p, mono=True)
    s.pill(1085, 602, "/internal/v1 · Feign", p, mono=True)

    s.edge([acc.t(-80), (acc.cx - 80, 250), (fb.cx, 250), fb.b()], "verify tokens", y, at=(760, 250))
    s.edge([(st.cx + 10, acc.y), (st.cx + 10, st.y + st.h)], None, y)
    s.pill(st.cx + 10, 280, "subscriptions", y)
    s.edge([ai.r(12), (1170, ai.cy + 12), (1170, orr.y + orr.h)], "stream", y, at=(1170, 280))

    s.edge([acc.r(-8), (1215, acc.cy - 8), (1215, pg.cy - 10), pg.l(-10)], None, r)
    s.edge([ws.r(-10), (1215, ws.cy - 10), (1215, pg.cy + 2)], None, r, width=1.6) if False else None
    s.edge([ws.r(-10), (1222, ws.cy - 10), (1222, pg.cy + 4), pg.l(4)], None, r)
    s.edge([ai.r(-10), (1229, ai.cy - 10), (1229, pg.cy + 18), pg.l(18)], "JDBC", r, at=(1229, 600))
    s.edge([ws.r(6), (1250, ws.cy + 6), (1250, mio.cy), mio.l()], None, r)
    s.edge([bk.t(), mio.b()], "reads", r, dashed=True)
    s.edge([bk.r(), (1662, bk.cy), (1662, 250), (r2.cx, 250), r2.b()], "upload", r, dashed=True, at=(1662, 430))

    s.edge([ws.r(16), (1186, ws.cy + 16), (1186, 795), (pod.cx, 795), pod.t()], "claim pod · exec (fabric8)", p,
           at=(1400, 795))
    s.edge([ws.r(26), (1196, ws.cy + 26), (1196, rd.cy), rd.l()], "write route", p, dashed=True, at=(1196, 960))
    s.edge([px.b(), rd.t()], "lookup", p)
    s.edge([px.r(), (pod.x, px.cy)], ":5173", p)
    s.edge([mio.r(), (1652, mio.cy), (1652, pod.cy), pod.r()], "sync files", p, dashed=True, at=(1652, 700))
    s.edge([ng.r(), spa.l()], "serves", C["blue"])
    s.edge([ts.r(), (500, ts.cy)], "kubectl apply -k", LINE, dashed=True, at=(470, ts.cy - 22))

    s.legend(520, 1172, [("solid", o, "public traffic"), ("solid", g, "Gateway route"),
                         ("dashed", p, "internal API (shared secret)"), ("solid", r, "data"),
                         ("solid", p, "preview pipeline"), ("solid", y, "external API"),
                         ("dashed", LINE, "discovery / control")])
    return s
