# Routine upkeep

- **OS security updates** are automatic (`unattended-upgrades`). After a kernel update the VM may want a reboot; the stack comes back on its own (verified by a real reboot in Phase 6).
- **k3s patch upgrades, monthly.** Not yet rehearsed on this cluster, so do it in a quiet window. Take a manual backup and confirm it landed; read the k3s release notes for the target version; on the VM run the k3s installer with the version pinned (`curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=<version> sh -`) - the flags live in `/etc/rancher/k3s/config.yaml`, which the installer leaves alone, so nothing needs re-passing. Expect a few minutes when the app is down while pods restart. Afterwards check `kubectl get nodes` and run the Uptime workflow by hand. Data is untouched by a k3s upgrade, so rolling back is reinstalling the previous version.
- **The domain** renews yearly at the registrar; the tunnel and certificates need no upkeep.
