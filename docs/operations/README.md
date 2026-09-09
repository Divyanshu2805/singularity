# Operations

The runbook for the live deployment: how changes reach it, how it's watched, backed up and restored, and the routine upkeep. For how the deployment is designed and built, see [Deployment](../deployment/README.md).

| Page | Open it when you need to… |
|---|---|
| [What runs where](what-runs-where.md) | Find a component, a hostname, or the admin access path |
| [Deploys and rollback](deploys.md) | Ship, redeploy or roll back a version; add or rotate a secret |
| [Monitoring](monitoring.md) | Understand an alert and respond to it |
| [Backups and restore](backups.md) | Take a backup or restore from one |
| [Routine upkeep](upkeep.md) | Upgrade k3s, handle OS updates, renew the domain |
| [Logs](logs.md) | Read logs, and know what is and isn't logged |
| [Going live with Stripe](stripe-live-mode.md) | Move payments out of test mode |
| [Useful commands](commands.md) | Look up a `kubectl` command |

Operational pitfalls — scripts that act on the current `kubectl` context, Secrets that don't change an initialized database, Windows shell quirks — are collected in [known pitfalls](../practices/gotchas/README.md).
