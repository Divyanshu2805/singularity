# Operations

How the live deployment is run: how a change reaches it, how it is watched, how it is backed up and restored, and the routine upkeep. `docs/deployment/` is the design and the record of how it was built; this is the page to open when something needs doing or has gone wrong. Server-specific identifiers (IP addresses, the private tailnet hostname, account and tunnel ids) are deliberately not written down here - they live in the GitHub `production` environment and in the owner's own kubeconfig.

## Contents

- [What runs where](what-runs-where.md)
- [How a change reaches production](deploys.md)
- [Watching it](monitoring.md)
- [Backups and restore](backups.md)
- [Routine upkeep](upkeep.md)
- [Logs](logs.md)
- [Leaving Stripe test mode](stripe-live-mode.md)
- [Traps that have cost time here](traps.md)
- [Useful commands](commands.md)
