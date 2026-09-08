# Useful commands

```bash
kubectl -n vibecraft get pods                              # the trusted workloads
kubectl -n vibecraft-ai get pods                           # Redis, the proxy, the runner pool and any live previews
kubectl top nodes; kubectl top pods -A                     # what it is using (metrics-server ships with k3s)
kubectl -n vibecraft rollout status deploy/<name>          # wait on one
kubectl -n vibecraft rollout undo deploy/<name>            # roll one back to its previous revision
kubectl -n vibecraft get cronjob,jobs                      # the nightly backup and its history
kubectl -n vibecraft exec -it postgres-0 -- psql -U vibecraft -d vibecraft-account-db
```
