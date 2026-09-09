# Useful Commands

Add `--context <prod>` to each command when more than one cluster is configured.

```bash
kubectl -n vibecraft get pods                              # the trusted workloads
kubectl -n vibecraft-ai get pods -L status,project-id      # Redis, the proxy, the runner pool and live previews
kubectl top nodes; kubectl top pods -A                     # resource usage (metrics-server ships with k3s)
kubectl -n vibecraft rollout status deploy/<name>          # wait for a rollout
kubectl -n vibecraft rollout undo deploy/<name>            # roll one workload back
kubectl -n vibecraft logs deploy/<name> --tail=100 -f      # follow a service's log
kubectl -n vibecraft get cronjob,jobs                      # the nightly backup and its history
kubectl -n vibecraft exec -it postgres-0 -- psql -U vibecraft -d vibecraft-account-db
```
