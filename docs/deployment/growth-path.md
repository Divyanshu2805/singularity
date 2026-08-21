# Growth path

Each stage reuses the same images, Kubernetes files and pipeline. Only the overlay, the target cluster and a few connection settings change.

| Stage | Audience | What changes |
| --- | --- | --- |
| 1: now | The author, friends, up to ~50 people, recruiters | This plan: one free Oracle VM, everything in-cluster |
| 2: small public beta | Hundreds of users | A second machine just for previews (capacity and isolation), a managed Postgres via `SPRING_DATASOURCE_URL`, a bigger main VM |
| 3: public launch | Open sign-up | Managed Kubernetes such as GKE, a sandboxed preview node pool, autoscaling, managed Postgres and Redis, real Stripe mode |

Moving from one stage to the next follows the same steps: bring up the new cluster, point the pipeline at it, restore the latest backup, and start the tunnel there. DNS never changes.
