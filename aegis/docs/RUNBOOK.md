<!-- docs/RUNBOOK.md — the runbook gives operators a concrete install and recovery path for the current repo state. -->
# Runbook

## Fresh install

1. Copy the repository to the target Ubuntu 24.04 host.
2. Run `sudo bash deploy/install.sh`.
3. Provide the panel hostname and SSH port when prompted.
4. Point DNS at the VPS.
5. Open the printed setup URL.

### Non-interactive install

Use environment variables or flags when you already know the public hostname.

```bash
sudo AEGIS_HOSTNAME=cp.devarajan.in AEGIS_SSH_PORT=22 bash deploy/install.sh
```

or

```bash
sudo bash deploy/install.sh --hostname cp.devarajan.in --ssh-port 22
```

## Services

- `systemctl status aegis-agent`
- `systemctl status aegis-ui`
- `systemctl status caddy`
- `journalctl -u aegis-agent -f`
- `journalctl -u aegis-ui -f`

## State locations

- Agent database: `/var/lib/aegis/aegis.db`
- Master key: `/etc/aegis/master.key`
- UI session config: `/etc/aegis/ui.env`
- Installer log: `/var/log/aegis/install.log`
- Caddy access log: `/var/log/aegis/caddy-access.log`
- Enrolment token copy: `/var/lib/aegis/enrolment.token`

## Recovery notes

- Re-run `deploy/install.sh` after source changes to rebuild the agent and UI.
- If Caddy fails to start, validate `/etc/caddy/Caddyfile` with `caddy validate --config /etc/caddy/Caddyfile`.
- If the UI cannot reach the agent, confirm `/run/aegis/aegis.sock` exists and that `aegis-ui` is in the `aegis` group.