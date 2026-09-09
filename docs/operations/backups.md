# Backups and Restore

## What is backed up

`deploy/k8s/base/backup.yaml` defines the `nightly-backup` CronJob, which runs at 02:30 IST. Each run:

1. dumps all three databases with `pg_dump -F c`, back to back in one container so the snapshots are seconds apart, and verifies each archive reads back;
2. uploads the dumps to R2 under `postgres/<UTC date>/`;
3. mirrors every MinIO bucket to `minio/<UTC date>/<bucket>/`;
4. deletes backups older than 7 days;
5. writes `LATEST` — only after everything else succeeded.

Each backup is a dated full copy, not an incremental mirror, so an accidental delete is never propagated into older backups. Redis isn't backed up: it holds only preview routes, which rebuild themselves.

## Taking a backup now

```bash
kubectl -n vibecraft create job --from=cronjob/nightly-backup backup-manual-1
```

Then run the uptime workflow by hand to confirm the freshness check sees it. Do this right after the first deploy of a new environment, to prove the R2 path end to end the same day.

## Restoring

```bash
deploy/scripts/restore-backup.sh --context <kube-context> [--date YYYY-MM-DD|latest] --yes
```

The restore replaces every database and every bucket with the chosen backup. It is destructive by design, and guarded:

- the context must be named explicitly — it never uses the current one — and the API server it will act on is printed first;
- it refuses to run without `--yes`;
- it scales account, workspace and intelligence to zero before restoring;
- if the restore fails, it leaves them at zero and prints exactly how to bring them back, rather than starting services over a half-restored database.

## Verifying the restore path

There is no automated test for backup and restore. The procedure was drilled on a kind cluster: seed data, fingerprint it, back up, damage the cluster, restore, and compare the fingerprints — MinIO and all three databases came back exactly. If you change the backup job or the restore scripts, repeat that drill on a dedicated kind cluster, naming its `--context` explicitly.

## Cross-database consistency

The three databases have no cross-database transactions. Dumping them back to back keeps the window small, but a restore can still include, for example, a chat about a project created seconds after the workspace dump. The services tolerate such dangling references by design (see [cross-service references](../schema/cross-service-references.md)).
