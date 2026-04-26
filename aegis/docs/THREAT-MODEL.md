<!-- docs/THREAT-MODEL.md — keep the hostile assumptions visible so module work does not quietly relax them later. -->
# Threat model

## Assumptions

- The panel is exposed to the public internet.
- Attackers can read the repository contents.
- Attackers may possess a single stolen factor or a stolen session cookie.
- Uploaded files and third-party dependencies must be treated as hostile.
- Operators will make mistakes, especially on firewall, file, and restore surfaces.

## Current defensive posture

- Public exposure is terminated at Caddy rather than the agent.
- Operator and session state lives server-side in SQLite.
- Every privileged mutation can be recorded in the audit chain.
- The installer locks the default firewall posture to SSH plus HTTP and HTTPS only.

## High-risk areas not finished yet

- Browser auth ceremony and session cookie issuance.
- Live terminal brokerage, recording encryption, and sharing controls.
- File-manager write guardrails and malware hooks.
- Database consoles and backup restore safety checks.
- Firewall rollback snapshots and two-person rule enforcement.

These gaps are exactly where future work should concentrate first, because they sit on the boundary between operator convenience and host compromise.