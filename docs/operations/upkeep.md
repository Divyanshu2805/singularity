# Routine Upkeep

## OS security updates

Automatic, through `unattended-upgrades`. After a kernel update the VM may want a reboot; the whole stack comes back on its own within about five minutes.

## k3s patch upgrades (monthly)

Do this in a quiet window — expect a few minutes of downtime while pods restart.

1. Take a manual backup and confirm it landed ([backups](backups.md#taking-a-backup-now)).
2. Read the k3s release notes for the target version.
3. On the VM, run the installer with the version pinned:

   ```bash
   curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=<version> sh -
   ```

   The flags live in `/etc/rancher/k3s/config.yaml`, which the installer leaves alone, so nothing needs to be passed again.
4. Check `kubectl get nodes`, then run the uptime workflow by hand.

A k3s upgrade doesn't touch data, so rolling back means reinstalling the previous version.

## The domain

Renews yearly at the registrar. The tunnel and certificates need no upkeep.
