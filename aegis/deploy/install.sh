#!/usr/bin/env bash
# deploy/install.sh — idempotent Ubuntu installer that builds from the checked-out repo and wires system services.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="/var/log/aegis/install.log"
LITESTREAM_VERSION="0.3.13"
GO_VERSION="1.26.2"
NODE_MAJOR="22"

log() {
  mkdir -p /var/log/aegis
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" | tee -a "$LOG_FILE"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this installer as root." >&2
    exit 1
  fi
}

prompt() {
  local label="$1"
  local default_value="$2"
  local reply
  read -r -p "${label} [${default_value}]: " reply || true
  if [[ -z "${reply}" ]]; then
    reply="${default_value}"
  fi
  printf '%s' "${reply}"
}

usage() {
  cat <<'EOF'
Usage: deploy/install.sh [--hostname <panel-hostname>] [--ssh-port <port>]

Environment overrides:
  AEGIS_HOSTNAME   Panel hostname to publish through Caddy
  AEGIS_SSH_PORT   SSH port to allow through UFW
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --hostname)
        if [[ $# -lt 2 ]]; then
          echo "--hostname requires a value" >&2
          exit 1
        fi
        export AEGIS_HOSTNAME="$2"
        shift 2
        ;;
      --ssh-port)
        if [[ $# -lt 2 ]]; then
          echo "--ssh-port requires a value" >&2
          exit 1
        fi
        export AEGIS_SSH_PORT="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
}

resolve_setting() {
  local env_name="$1"
  local label="$2"
  local default_value="$3"
  local existing="${!env_name:-}"
  if [[ -n "${existing}" ]]; then
    printf '%s' "${existing}"
    return
  fi
  prompt "${label}" "${default_value}"
}

ensure_packages() {
  ensure_caddy_repo
  ensure_docker_repo
  log "Updating apt metadata"
  apt-get update -y
  log "Installing Ubuntu dependencies"
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    apt-transport-https ca-certificates curl debian-archive-keyring debian-keyring gnupg jq rsync unzip tar zip xz-utils \
    caddy ufw restic fail2ban \
    wireguard smartmontools lm-sensors ripgrep dmidecode \
    build-essential

  ensure_docker_runtime
  ensure_go_toolchain
  ensure_node_runtime
}

ensure_caddy_repo() {
  install -d -m 0755 /usr/share/keyrings

  if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
    log "Installing Caddy apt signing key"
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  fi

  if [[ ! -f /etc/apt/sources.list.d/caddy-stable.list ]]; then
    log "Installing Caddy apt repository"
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
    chmod 0644 /etc/apt/sources.list.d/caddy-stable.list
  fi
}

ensure_docker_repo() {
  install -d -m 0755 /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    log "Installing Docker apt signing key"
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod 0644 /etc/apt/keyrings/docker.asc
  fi

  if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
    log "Installing Docker apt repository"
    . /etc/os-release
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
      "$(dpkg --print-architecture)" "${UBUNTU_CODENAME:-$VERSION_CODENAME}" >/etc/apt/sources.list.d/docker.list
    chmod 0644 /etc/apt/sources.list.d/docker.list
  fi
}

ensure_docker_runtime() {
  log "Removing conflicting distro Docker packages"
  DEBIAN_FRONTEND=noninteractive apt-get remove -y docker.io docker-doc docker-compose podman-docker containerd runc >/dev/null 2>&1 || true

  log "Installing Docker engine packages"
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

ensure_go_toolchain() {
  local current_version=""
  if command -v /usr/local/go/bin/go >/dev/null 2>&1; then
    current_version="$(/usr/local/go/bin/go version | awk '{print $3}')"
  fi

  if [[ "${current_version}" != "go${GO_VERSION}" ]]; then
    local arch go_arch archive url
    arch="$(dpkg --print-architecture)"
    case "${arch}" in
      amd64) go_arch="amd64" ;;
      arm64) go_arch="arm64" ;;
      *)
        log "Unsupported architecture for Go toolchain: ${arch}"
        exit 1
        ;;
    esac

    archive="go${GO_VERSION}.linux-${go_arch}.tar.gz"
    url="https://go.dev/dl/${archive}"
    log "Installing Go ${GO_VERSION} from ${url}"
    curl -fsSL "${url}" -o /tmp/go.tgz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tgz
    rm -f /tmp/go.tgz
  else
    log "Go ${GO_VERSION} already present"
  fi

  ln -sf /usr/local/go/bin/go /usr/local/bin/go
  ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
}

ensure_node_runtime() {
  local node_major=""
  if command -v node >/dev/null 2>&1; then
    node_major="$(node -p 'process.versions.node.split(`.`)[0]' 2>/dev/null || true)"
  fi

  if [[ "${node_major}" == "${NODE_MAJOR}" ]]; then
    log "Node.js ${NODE_MAJOR}.x already present"
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}.x from NodeSource"
  DEBIAN_FRONTEND=noninteractive apt-get remove -y nodejs npm libnode-dev libnode72 nodejs-doc >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive apt-get autoremove -y >/dev/null 2>&1 || true
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
}

ensure_litestream() {
  if command -v litestream >/dev/null 2>&1; then
    log "litestream already present"
    return
  fi

  local arch package
  arch="$(dpkg --print-architecture)"
  case "${arch}" in
    amd64) package="litestream-v${LITESTREAM_VERSION}-linux-amd64.deb" ;;
    arm64) package="litestream-v${LITESTREAM_VERSION}-linux-arm64.deb" ;;
    *)
      log "Unsupported architecture for litestream package: ${arch}"
      return
      ;;
  esac

  local url="https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/${package}"
  log "Installing litestream ${LITESTREAM_VERSION} from ${url}"
  curl -fsSL "${url}" -o /tmp/litestream.deb
  dpkg -i /tmp/litestream.deb || apt-get install -f -y
  rm -f /tmp/litestream.deb
}

ensure_users() {
  if ! id -u aegis >/dev/null 2>&1; then
    log "Creating aegis system user"
    useradd --system --home /var/lib/aegis --shell /usr/sbin/nologin --user-group aegis
  fi
  if ! id -u aegis-ui >/dev/null 2>&1; then
    log "Creating aegis-ui system user"
    useradd --system --home /opt/aegis-ui --shell /usr/sbin/nologin --user-group aegis-ui
  fi
  usermod -a -G aegis aegis-ui

  install -d -m 0750 -o aegis -g aegis /var/lib/aegis
  install -d -m 0750 -o aegis -g aegis /var/lib/aegis/undo
  install -d -m 0755 -o root -g root /var/log/aegis
  install -d -m 0755 -o root -g root /etc/aegis
  install -d -m 0755 -o root -g root /run/aegis
  install -d -m 0755 -o aegis-ui -g aegis-ui /opt/aegis-ui
}

ensure_master_key() {
  if [[ ! -f /etc/aegis/master.key ]]; then
    log "Generating /etc/aegis/master.key"
    python3 - <<'PY'
from pathlib import Path
import secrets
path = Path('/etc/aegis/master.key')
path.write_bytes(secrets.token_bytes(32))
path.chmod(0o400)
PY
  fi
  chown root:aegis /etc/aegis/master.key
  chmod 0440 /etc/aegis/master.key
}

ensure_ui_env() {
  if [[ ! -f /etc/aegis/ui.env ]]; then
    log "Generating /etc/aegis/ui.env"
    python3 - <<'PY'
from pathlib import Path
import secrets

path = Path('/etc/aegis/ui.env')
path.write_text(
    'AEGIS_SESSION_SECRET=' + secrets.token_urlsafe(48) + '\n'
    'AEGIS_PANEL_NAME=Aegis\n',
    encoding='utf-8',
)
path.chmod(0o440)
PY
  fi
  chown root:aegis-ui /etc/aegis/ui.env
  chmod 0440 /etc/aegis/ui.env
}

ensure_ui_runtime() {
  local bind_host="$1"
  cat >/etc/aegis/ui.runtime <<EOF
HOSTNAME=${bind_host}
EOF
  chown root:aegis-ui /etc/aegis/ui.runtime
  chmod 0440 /etc/aegis/ui.runtime
}

build_agent() {
  log "Building aegis-agent"
  (cd "${REPO_ROOT}/aegis-agent" && GOWORK=off /usr/local/go/bin/go build -o /usr/local/bin/aegis-agent ./cmd/aegis-agent)
  chown root:root /usr/local/bin/aegis-agent
  chmod 0755 /usr/local/bin/aegis-agent
}

build_ui() {
  log "Installing UI dependencies"
  (cd "${REPO_ROOT}/aegis-ui" && npm install --no-fund --no-audit)
  log "Building UI bundle"
  (cd "${REPO_ROOT}/aegis-ui" && npm run build)

  rm -rf /opt/aegis-ui/*
  rsync -a --delete "${REPO_ROOT}/aegis-ui/.next/standalone/" /opt/aegis-ui/
  install -d -m 0755 -o aegis-ui -g aegis-ui /opt/aegis-ui/.next
  rsync -a --delete "${REPO_ROOT}/aegis-ui/.next/static/" /opt/aegis-ui/.next/static/
  if [[ -d "${REPO_ROOT}/aegis-ui/public" ]]; then
    rsync -a --delete "${REPO_ROOT}/aegis-ui/public/" /opt/aegis-ui/public/
  fi
  chown -R aegis-ui:aegis-ui /opt/aegis-ui
}

install_systemd_units() {
  log "Installing systemd units"
  install -m 0644 "${SCRIPT_DIR}/aegis-agent.service" /etc/systemd/system/aegis-agent.service
  install -m 0644 "${SCRIPT_DIR}/aegis-ui.service" /etc/systemd/system/aegis-ui.service
}

install_sudoers() {
  log "Installing scoped sudoers file"
  install -d -m 0750 -o root -g root /etc/sudoers.d
  install -m 0440 "${SCRIPT_DIR}/sudoers.d/aegis" /etc/sudoers.d/aegis
}

configure_ufw() {
  local ssh_port="$1"
  local proxy_subnet="${2:-}"
  log "Resetting and configuring UFW"
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "${ssh_port}/tcp"
  ufw allow 80/tcp
  ufw allow 443/tcp
  if [[ -n "${proxy_subnet}" ]]; then
    ufw allow in proto tcp from "${proxy_subnet}" to any port 3000
  fi
  ufw --force enable
}

configure_fail2ban() {
  log "Configuring fail2ban"
  install -d -m 0755 -o root -g root /etc/fail2ban/jail.d
  install -d -m 0755 -o root -g root /etc/fail2ban/filter.d
  cat >/etc/fail2ban/filter.d/aegis-panel-auth.conf <<'EOF'
# fail2ban filter for Aegis auth failures in the UI log stream.
[Definition]
failregex = ^.*"path":"/(login|api/auth).*".*"status":401.*"ip":"<HOST>".*$
ignoreregex =
EOF
  cat >/etc/fail2ban/jail.d/aegis.local <<'EOF'
# fail2ban jail for SSH and panel auth.
[sshd]
enabled = true

[aegis-panel-auth]
enabled = true
filter = aegis-panel-auth
backend = auto
logpath = /var/log/aegis/ui.log
maxretry = 8
findtime = 10m
bantime = 1h
EOF
}

configure_caddy() {
  local hostname="$1"
  log "Rendering Caddyfile for ${hostname}"
  touch /var/log/aegis/caddy-access.log
  chown caddy:caddy /var/log/aegis/caddy-access.log
  chmod 0640 /var/log/aegis/caddy-access.log

  sed \
    -e "s/{{HOSTNAME}}/${hostname}/g" \
    -e "s#{{UPSTREAM}}#127.0.0.1:3000#g" \
    "${SCRIPT_DIR}/Caddyfile.tmpl" >/etc/caddy/Caddyfile
  chown root:root /etc/caddy/Caddyfile
  chmod 0644 /etc/caddy/Caddyfile
}

enable_services() {
  local enable_caddy="$1"
  log "Enabling system services"
  systemctl daemon-reload
  systemctl enable --now docker fail2ban aegis-agent aegis-ui
  if [[ "${enable_caddy}" == "1" ]]; then
    systemctl enable --now caddy
  else
    systemctl disable --now caddy >/dev/null 2>&1 || true
  fi
}

print_setup_url() {
  local hostname="$1"
  local token
  token="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(24))
PY
)"
  printf '%s\n' "${token}" >/var/lib/aegis/enrolment.token
  chown aegis:aegis /var/lib/aegis/enrolment.token
  chmod 0640 /var/lib/aegis/enrolment.token

  log "Aegis installation complete"
  echo
  echo "Open: https://${hostname}/setup?token=${token}"
  echo "Token copy stored at /var/lib/aegis/enrolment.token"
}

main() {
  parse_args "$@"
  require_root
  log "Starting Aegis installer from ${REPO_ROOT}"

  local hostname ssh_port ui_bind_host enable_caddy proxy_subnet
  hostname="$(resolve_setting AEGIS_HOSTNAME 'Panel hostname' 'panel.example.com')"
  ssh_port="$(resolve_setting AEGIS_SSH_PORT 'SSH port to allow through UFW' '22')"
  ui_bind_host="${AEGIS_UI_BIND_HOST:-127.0.0.1}"
  enable_caddy="${AEGIS_ENABLE_CADDY:-1}"
  proxy_subnet="${AEGIS_PROXY_SUBNET:-}"

  ensure_packages
  ensure_litestream
  ensure_users
  ensure_master_key
  ensure_ui_env
  ensure_ui_runtime "${ui_bind_host}"
  install_systemd_units
  install_sudoers
  build_agent
  build_ui
  configure_ufw "${ssh_port}" "${proxy_subnet}"
  configure_fail2ban
  if [[ "${enable_caddy}" == "1" ]]; then
    configure_caddy "${hostname}"
  fi
  enable_services "${enable_caddy}"
  print_setup_url "${hostname}"
}

main "$@"