# Monitoring

`.github/workflows/uptime.yml` is the monitor, built on GitHub Actions rather than a separate service:

| Check | Schedule | What it does |
|---|---|---|
| Site | Every 15 minutes | Runs the deploy smoke test against the live domain, retrying three times 30 seconds apart so a single blip doesn't alert |
| Backup freshness | Daily, 10:00 IST (04:30 UTC) | Runs `deploy/scripts/check-backup-freshness.sh`: the newest complete backup in R2 must be under 30 hours old |

Both checks can also be run by hand from the Actions tab.

A failed scheduled run emails the person who last edited the workflow's schedule — that is how GitHub chooses the recipient.

**Limits.** GitHub may delay a scheduled run by many minutes, or occasionally drop one, so this is "roughly every 15 minutes", not a guarantee. GitHub also disables scheduled workflows after 60 days without repository activity; a push, or re-enabling the workflow in the Actions tab, restores them. If minute-level alerting matters, add a dedicated uptime monitor on the same two URLs alongside this one.

## Responding to alerts

**The site check failed:**

```bash
kubectl -n vibecraft get pods
kubectl -n vibecraft-ai get pods
kubectl -n vibecraft logs deploy/<failing workload> --tail=100
```

A `CrashLoopBackOff` on the first pod to restart after a password change is almost always the [stateful secret trap](deploys.md#rotating-the-postgres-or-minio-password).

**The backup check failed:**

```bash
kubectl -n vibecraft get jobs -l app=nightly-backup
kubectl -n vibecraft logs job/<newest failed job> -c pg-dump
kubectl -n vibecraft logs job/<newest failed job> -c upload
```

A failing CronJob alerts no one on its own — this check is the only alarm. It depends on the `LATEST` marker the backup job writes as its very last step, only on full success; never move or remove that write.
