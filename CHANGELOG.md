# Changelog


All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog,
and this project adheres to Semantic Versioning.

## [1.0.0] - 2026-07-28

### Added

- Audit logging for peer creation and deletion.
- Startup reconciliation of the WireGuard interface with its configuration file.
- Startup validation of the `WG_SUBNET_CIDR` configuration against the interface address.

### Changed

- Peer labels are now validated and reject control characters.
- Removed unconditional trust of proxy-forwarded headers.
- WireGuard command failures now return a generic error to API callers; full details are logged server-side only.

### Fixed

- Concurrent peer operations no longer risk configuration corruption.
- Peer creation no longer leaves orphaned peers on partial failure.
- Rollback and cleanup failures no longer mask the original error.
- Fixed IP allocation for peers with multiple `AllowedIPs` entries.

### Security

- Removed a configuration injection vector via peer labels.
- WireGuard command output is no longer exposed to API callers.
- Removed a client IP spoofing vector via forwarded headers.
