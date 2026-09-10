"""
Entity-relationship diagrams for the three service databases, taken from each service's Flyway migrations.

Handles: every table and column, primary/foreign/unique keys, real foreign-key relationships (crow's feet), and
plain-id references into another service's database (dashed, marked ID).
"""
from kit import ER, C, MUTED

G, B, P, O, Y, R, T, GR = C["green"], C["blue"], C["purple"], C["orange"], C["yellow"], C["red"], C["teal"], C["gray"]


def account():
    e = ER(1460, 900, "account-service database — vibecraft-account-db",
           "Users, plans and billing, and the sign-in audit trail · V1–V6 migrations")
    u = e.entity("u", 520, 120, "users", [("id", "bigint", "PK"), ("username", "varchar", "UK"), ("name", "varchar"),
                  ("firebase_uid", "varchar", "UK"), ("stripe_customer_id", "varchar", "UK"), ("created_at", "timestamp"),
                  ("updated_at", "timestamp"), ("deleted_at", "timestamp")], B, w=270)
    sub = e.entity("s", 520, 450, "subscriptions", [("id", "bigint", "PK"), ("user_id", "bigint", "FK"),
                   ("plan_id", "bigint", "FK"), ("status", "varchar"), ("stripe_subscription_id", "varchar", "UK"),
                   ("current_period_start", "timestamp"), ("current_period_end", "timestamp"),
                   ("cancel_at_period_end", "boolean"), ("past_due_since", "timestamp"), ("last_event_at", "timestamp"),
                   ("sync_pending", "boolean"), ("created_at", "timestamp"), ("updated_at", "timestamp")], G, w=290)
    pl = e.entity("p", 960, 450, "plans", [("id", "bigint", "PK"), ("name", "varchar"), ("stripe_price_id", "varchar", "UK"),
                  ("max_projects", "int"), ("max_tokens_per_day", "int"), ("max_previews", "int"),
                  ("unlimited_ai", "boolean"), ("active", "boolean"), ("price_amount_minor", "int"),
                  ("currency", "varchar"), ("billing_interval", "varchar"), ("tagline", "varchar"),
                  ("sort_order", "int")], Y, w=270)
    ci = e.entity("c", 960, 120, "checkout_intents", [("user_id", "bigint", "PK FK"), ("plan_id", "bigint", "FK"),
                  ("idempotency_key", "varchar"), ("stripe_session_id", "varchar"), ("updated_at", "timestamp")], O, w=270)
    au = e.entity("a", 60, 120, "auth_audit_events", [("id", "bigint", "PK"), ("user_id", "bigint", "ID"),
                  ("firebase_uid", "varchar"), ("type", "varchar(64)"), ("ip_address", "varchar"), ("user_agent", "varchar"),
                  ("detail", "varchar"), ("created_at", "timestamp")], P, w=270,
                  note="plain user_id: a rejected sign-in has none")
    rv = e.entity("r", 60, 450, "revoked_sessions", [("cookie_hash", "varchar(64)", "PK"), ("expires_at", "timestamp")],
                  R, w=270, note="checked by every service on a cache miss")
    wh = e.entity("w", 60, 640, "webhook_events", [("id", "varchar", "PK"), ("type", "varchar"), ("status", "varchar"),
                  ("created_at", "timestamp"), ("updated_at", "timestamp")], T, w=270,
                  note="keyed by Stripe's event id · idempotent inbox")

    e.rel([(u.cx, u.y + u.h), (u.cx, sub.y)], "one", "zmany", "has")
    e.rel([(pl.x, pl.y + 60), (sub.x + sub.w, pl.y + 60)], "one", "zmany", "follows")
    e.rel([u.r(-40), (ci.x, u.cy - 40)], "one", "zone", "≤ 1 open")
    e.rel([ci.b(), pl.t()], "zmany", "one", "targets")
    e.rel([au.r(-20), u.l(-20)], "zmany", "zone", "plain id", dashed=True)
    e.s.pill(1180, 860, "partial unique index: one non-CANCELED subscription per user", MUTED)
    return e.s


def workspace():
    e = ER(1560, 1000, "workspace-service database — vibecraft-workspace-db",
           "Projects, members, files, revisions and previews · V1–V4 migrations · user ids point into account-service")
    pr = e.entity("p", 560, 120, "projects", [("id", "bigint", "PK"), ("name", "varchar"), ("is_public", "boolean"),
                  ("template_init_issue", "varchar"), ("forked_from_project_id", "bigint", "ID"),
                  ("current_file_revision_id", "bigint", "FK"), ("created_at", "timestamp"), ("updated_at", "timestamp"),
                  ("deleted_at", "timestamp")], B, w=300)
    pm = e.entity("m", 60, 120, "project_members", [("project_id", "bigint", "PK FK"), ("user_id", "bigint", "PK"),
                  ("project_role", "varchar"), ("invited_at", "timestamp"), ("accepted_at", "timestamp"),
                  ("pinned_at", "timestamp"), ("starred_at", "timestamp")], G, w=280,
                  note="user_id → account-service users.id")
    pf = e.entity("f", 60, 480, "project_files", [("id", "bigint", "PK"), ("project_id", "bigint", "FK"),
                  ("path", "varchar", "UK"), ("minio_object_key", "varchar"), ("size", "bigint"), ("type", "varchar"),
                  ("content_hash", "varchar"), ("current_revision_id", "bigint", "FK"), ("created_at", "timestamp"),
                  ("updated_at", "timestamp")], T, w=280, note="unique (project_id, path)")
    rv = e.entity("r", 560, 520, "project_file_revisions", [("id", "bigint", "PK"), ("project_id", "bigint", "FK"),
                  ("parent_revision_id", "bigint", "FK"), ("status", "varchar"), ("source", "varchar"),
                  ("created_by_user_id", "bigint", "ID"), ("failure_detail", "varchar"), ("created_at", "timestamp"),
                  ("applied_at", "timestamp")], O, w=300)
    re_ = e.entity("e", 560, 800, "project_file_revision_entries", [("id", "bigint", "PK"), ("revision_id", "bigint", "FK"),
                   ("path", "varchar(400)"), ("change_type", "varchar")], Y, w=300,
                   note="+ content_hash, previous_content_hash, size, content_type")
    pv = e.entity("v", 1060, 120, "previews", [("id", "bigint", "PK"), ("project_id", "bigint", "FK"),
                  ("started_by_user_id", "bigint", "ID"), ("namespace", "varchar"), ("pod_name", "varchar"),
                  ("hostname", "varchar"), ("preview_url", "varchar"), ("status", "varchar"), ("detail", "varchar"),
                  ("failure_log", "text"), ("started_at", "timestamp"), ("ready_at", "timestamp"),
                  ("last_accessed_at", "timestamp"), ("terminated_at", "timestamp"), ("bootstrap_owner", "varchar"),
                  ("bootstrap_heartbeat_at", "timestamp"), ("created_at", "timestamp")], P, w=300)
    ps = e.entity("s", 1060, 640, "preview_sessions", [("id", "bigint", "PK"), ("preview_id", "bigint", "FK"),
                  ("project_id", "bigint", "ID"), ("user_id", "bigint", "ID"), ("started_at", "timestamp"),
                  ("last_seen_at", "timestamp"), ("ended_at", "timestamp"), ("end_reason", "varchar"),
                  ("failed", "boolean")], R, w=300, note="one per collaborator on a shared runner")

    e.rel([pr.l(-60), (pm.x + pm.w, pr.cy - 60)], "one", "many", "members")
    e.rel([(pr.x, pr.cy + 60), (470, pr.cy + 60), (470, pf.y + 40), (pf.x + pf.w, pf.y + 40)], "one", "zmany", "files")
    e.rel([pr.b(-60), (pr.cx - 60, rv.y)], "one", "zmany", "revisions")
    e.rel([rv.b(), re_.t()], "one", "many", "changed paths")
    e.rel([pr.r(-60), (pv.x, pr.cy - 60)], "one", "zmany", "previews")
    e.rel([pv.b(), ps.t()], "one", "zmany", "watched by")
    e.rel([(rv.x, 720), (pf.x + pf.w, 720)], "zone", "zmany", "current_revision_id", at=(500, 720))
    e.rel([pr.b(60), (pr.cx + 60, rv.y)], "zmany", "zone", None)
    e.s.pill(pr.cx + 60, 470, "current_file_revision_id", MUTED, mono=True)
    e.rel([(rv.x + rv.w, rv.y + 60), (rv.x + rv.w + 40, rv.y + 60), (rv.x + rv.w + 40, rv.y + 110),
           (rv.x + rv.w, rv.y + 110)], "zone", "zmany", "parent")
    return e.s


def intelligence():
    e = ER(1540, 800, "intelligence-service database — vibecraft-intelligence-db",
           "Chat history, code notes and AI usage · project and user ids point into workspace- and account-service")
    cs = e.entity("cs", 60, 120, "chat_sessions", [("project_id", "bigint", "PK"), ("user_id", "bigint", "PK"),
                  ("created_at", "timestamp"), ("updated_at", "timestamp"), ("deleted_at", "timestamp")], B, w=270,
                  note="one build conversation per project × user")
    cm = e.entity("cm", 440, 120, "chat_messages", [("id", "bigint", "PK"), ("project_id", "bigint", "FK"),
                  ("user_id", "bigint", "FK"), ("content", "text"), ("role", "varchar"), ("tokens_used", "int"),
                  ("created_at", "timestamp")], G, w=270, note="assistant content lives in chat_events")
    ce = e.entity("ce", 880, 120, "chat_events", [("id", "bigint", "PK"), ("chat_message_id", "bigint", "FK"),
                  ("type", "varchar"), ("sequence_order", "int"), ("content", "text"), ("file_path", "varchar"),
                  ("metadata", "text"), ("previous_content", "text")], T, w=280)
    cn = e.entity("cn", 60, 460, "code_notes", [("id", "bigint", "PK"), ("project_id", "bigint", "ID"),
                  ("user_id", "bigint", "ID"), ("question", "text"), ("answer", "text"), ("selection_path", "varchar"),
                  ("selection_code", "text"), ("selection_start_line", "int"), ("selection_end_line", "int"),
                  ("created_at", "timestamp")], P, w=280, note="always queried by project AND user")
    ul = e.entity("ul", 440, 460, "usage_logs", [("id", "bigint", "PK"), ("user_id", "bigint", "UK"), ("date", "date", "UK"),
                  ("tokens_used", "int")], Y, w=270, note="daily counter · quota hot path")
    ue = e.entity("ue", 880, 460, "usage_events", [("id", "bigint", "PK"), ("user_id", "bigint", "ID"),
                  ("project_id", "bigint", "ID"), ("feature", "varchar(32)"), ("input_tokens", "int"),
                  ("output_tokens", "int"), ("total_tokens", "int"), ("created_at", "timestamp")], O, w=280,
                  note="ledger · insights cold path")
    e.rel([cs.r(-30), (cm.x, cs.cy - 30)], "one", "zmany", "composite FK")
    e.rel([cm.r(-30), (ce.x, cm.cy - 30)], "one", "many", "made of")
    e.rel([(ul.x + ul.w, ul.cy), (ue.x, ul.cy)], None and "one", "one", "written together", dashed=True) if False else None
    e.s.pill(795, 548, "one transaction", MUTED)
    e.s.edge([(ul.x + ul.w, 560 + 18), (ue.x, 560 + 18)], None, MUTED, dashed=True, both=True)
    e.s.listbox(1210, 120, "Plain ids — no FK", ["project_id → workspace projects.id",
                                                  "user_id → account users.id",
                                                  "usage outlives deleted projects"], GR, mono=False)
    return e.s
