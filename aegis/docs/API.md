<!-- docs/API.md — list the actual agent endpoints that exist today so the UI and future clients have one reference. -->
# API

## Transport

- Production transport: Unix domain socket at `/run/aegis/aegis.sock`
- Local browser transport: Next.js BFF route at `/api/agent/[...path]`
- Payloads: JSON request and response bodies

## Implemented endpoints

### Health and status

- `GET /healthz`
- `GET /rpc/v1/status`
- `GET /rpc/v1/system/overview`
- `GET /rpc/v1/services`
- `GET /rpc/v1/modules`

### Setup and operators

- `GET /rpc/v1/setup/status`
- `POST /rpc/v1/setup/bootstrap`
- `GET /rpc/v1/operators`
- `GET /rpc/v1/settings`
- `POST /rpc/v1/settings`

### Authentication and sessions

- `POST /rpc/v1/auth/passkeys/lookup`
- `POST /rpc/v1/auth/passkeys/complete`
- `POST /rpc/v1/auth/totp`
- `POST /rpc/v1/auth/recovery`

- `POST /rpc/v1/sessions`
- `POST /rpc/v1/sessions/validate`
- `POST /rpc/v1/sessions/revoke`

### Logs

- `GET /rpc/v1/logs?limit=N`

### Jobs

- `GET /rpc/v1/jobs?limit=N`
- `GET /rpc/v1/jobs/{id}`

### Audit

- `GET /rpc/v1/audit?limit=N&actor=name&action=name`

## Example bootstrap payload

```json
{
  "username": "owner",
  "display_name": "Owner",
  "totp_secret": "BASE32SECRET",
  "recovery_codes": ["CODE-1", "CODE-2", "CODE-3"],
  "passkey": {
    "id": "credential-id",
    "public_key": "base64-encoded-public-key",
    "nickname": "Primary passkey"
  },
  "issue_session": true
}
```