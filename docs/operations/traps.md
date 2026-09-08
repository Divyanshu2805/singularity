# Traps that have cost time here

- **`apply-secrets.sh` acts on whatever cluster `kubectl` currently points at**, and rewrites every secret. Never run it, or a test of it, without the `KUBECONFIG` you mean; test it with a stand-in `kubectl` on the `PATH` and `KUBECONFIG` set to a nonexistent file.
- **Git Bash on Windows rewrites `/bin/sh` into `C:/Program Files/Git/usr/bin/sh`** when it appears as a `kubectl run --command` or `kubectl exec` argument, and the container then fails with "no such file". Set `MSYS_NO_PATHCONV=1` for that command.
- **`mc alias set` rejects a secret key shorter than 8 characters** before it contacts the server, and the `mc` image has no `awk` or `sed` (only shell built-ins and `cut`, `tr`, `wc`, `date`). The backup and restore scripts are written to that.
