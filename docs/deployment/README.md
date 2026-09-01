# VibeCraft Deployment Plan: Oracle Cloud Free Tier

Prepared 2026-08-24. Status: Phases 0, 1, 2 and 3 complete; Phase 4 6/7 (only the `KUBE_DEPLOYER_TOKEN` GitHub secret paste remains, an owner action). Updated 2026-09-04 as steps land — see the checkboxes and the Timeline table's Status column for the current state. Server-specific identifiers (IPs, tunnel/account IDs, private hostnames) are deliberately kept out of this public file; the domain and architecture below are real.

## Contents

- [Summary](summary.md)
- [Architecture](architecture.md)
- [Costs](costs.md)
- [Phase 0: Accounts and one-time setup (owner)](phase-0-accounts-setup.md)
- [Phase 1: Repo readiness](phase-1-repo-readiness.md)
- [Phase 2: Container images](phase-2-container-images.md)
- [Phase 3: Kubernetes files and local rehearsal](phase-3-kubernetes.md)
- [Phase 4: Provision the Oracle machine](phase-4-oracle-machine.md)
- [Phase 5: CI/CD pipeline](phase-5-ci-cd.md)
- [Phase 6: First deploy and verification](phase-6-first-deploy.md)
- [Phase 7: Hardening, backups, monitoring, polish](phase-7-hardening.md)
- [Preview capacity](preview-capacity.md)
- [Risks and fallback](risks.md)
- [Growth path](growth-path.md)
- [Timeline](timeline.md)
- [Sources](sources.md)
