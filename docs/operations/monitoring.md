# Watching it

`.github/workflows/uptime.yml` is the monitor, built from what the repo already runs on rather than a separate account:

- **Every 15 minutes** it runs the smoke test against the live domain, retrying three times 30 seconds apart so one blip does not raise an alarm.
- **Every morning (10:00 India time)** it runs `deploy/scripts/check-backup-freshness.sh`: the newest complete backup in R2 must be under 30 hours old.

A failed scheduled run emails the person who last edited the workflow's schedule (that is how GitHub picks the recipient). Limits: GitHub may delay a scheduled run by many minutes and can drop one, so this is "roughly every 15 minutes", not a guarantee; and it disables scheduled workflows in a repository with 60 days of inactivity (a push, or re-enabling under the Actions tab, restores them). If minute-level alerting ever matters, point a dedicated monitor at the same two URLs and leave this in place.

**When the site alert fires:** `kubectl -n vibecraft get pods` and `kubectl -n vibecraft-ai get pods`, then `kubectl -n vibecraft logs deploy/<the failing one> --tail=100`. A `CrashLoopBackOff` on the first pod after a Secret change is almost always the trap above.

**When the backup alert fires:** `kubectl -n vibecraft get jobs -l app=nightly-backup`, then `kubectl -n vibecraft logs job/<newest failed one> -c pg-dump` and `-c upload`. A failing CronJob emails nobody by itself, which is the only reason this check exists - do not remove the `LATEST` marker the job writes as its last step, the check depends on it.
