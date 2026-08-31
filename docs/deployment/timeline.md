# Timeline

Total effort is 34–54 hours: a first public URL after about 4–6 working days, everything finished in about 5–7, or roughly 2 calendar weeks at a steady pace. Phase 0 runs in parallel with Phases 1–3, so Oracle and DNS waiting doesn't block the code work.

| Phase | Who | Effort | Status | Notes |
| --- | --- | --- | --- | --- |
| 0: Accounts | Owner | 2–3 h | ✅ Done | Oracle capacity and DNS can add 1–3 days of waiting |
| 1: Repo readiness | Owner + assistant | 4–8 h | ✅ Done | The last item (production-settings env vars) landed as part of Phase 3's manifests |
| 2: Images | Assistant | 3–5 h | ✅ Done | All 8 Dockerfiles written and build-verified locally; registry push is Phase 5's CI job |
| 3: Kubernetes files + kind rehearsal | Assistant | 8–12 h | ✅ Done | Full stack rehearsed on a dedicated kind cluster; a real bug found and fixed live (`enableServiceLinks`) |
| 4: Provision the VM | Owner + assistant | 3–4 h | ⏳ Not started | Needs Phase 0 finished |
| 5: CI/CD pipeline | Assistant | 4–6 h | ⏳ Not started | |
| 6: First deploy + verification | Both | 6–10 h | ⏳ Not started | The public URL goes live here |
| 7: Hardening + polish | Owner + assistant | 4–6 h | ⏳ Not started | Backups, monitoring, demo polish, docs |
| **Total** | | **34–54 h** | | |

Status is updated in this file as each phase's checklist items land — check back here rather than the chat history for current progress.
