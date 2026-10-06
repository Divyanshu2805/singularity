# Useful Commands

Add `--context <prod>` to each command when more than one cluster is configured.

```bash
kubectl -n singularity get pods                              # the trusted workloads
kubectl -n singularity-ai get pods -L status,project-id      # Redis, the proxy, the runner pool and live previews
kubectl top nodes; kubectl top pods -A                     # resource usage (metrics-server ships with k3s)
kubectl -n singularity rollout status deploy/<name>          # wait for a rollout
kubectl -n singularity rollout undo deploy/<name>            # roll one workload back
kubectl -n singularity logs deploy/<name> --tail=100 -f      # follow a service's log
kubectl -n singularity get cronjob,jobs                      # the nightly backup and its history
kubectl -n singularity exec -it postgres-0 -- psql -U singularity -d singularity-account-db
```
