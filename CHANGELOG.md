# Changelog

All notable changes to LeetCode Master are documented in this file.

## [0.1.5] - 2026-04-29

### Added

- Added `webdav` as a review data sync backend alongside `off` and `localFolder`.
- Added WebDAV settings for server URL, username, and remote root path.
- Added the `LeetCode Master: Set WebDAV Password` command, storing the WebDAV password in VS Code `SecretStorage`.
- Added review-sync smoke tests covering backend selection, WebDAV path encoding, merge behavior, and Jianguoyun-compatible request flows.
- Documented Jianguoyun WebDAV setup with `https://dav.jianguoyun.com/dav/` and third-party application passwords.

### Changed

- Refactored review sync into backend-style implementations for local-folder and WebDAV storage.
- Kept the existing `cards/`, `logs/`, and `manifest.json` remote layout compatible between `localFolder` and `webdav`.
- Marked review-sync backend, local folder, and WebDAV settings as machine-scoped so VS Code Settings Sync does not copy machine-specific paths or credentials.
- Changed VS Code globalState sync fallback behavior so review records remain Settings-Sync eligible until a complete external backend is configured.
- WebDAV sync now reads card shards from `manifest.json` instead of probing all shard files.

### Fixed

- Trimmed WebDAV URL, username, root path, and stored password values to avoid accidental whitespace breaking authentication.
- Improved WebDAV error messages with HTTP status, method, and request URL.
- Treated Jianguoyun `MKCOL` responses for existing folders as non-fatal, while still reporting real write failures.
- Avoided clearing or overwriting local review records when WebDAV verification or sync fails.

## [0.1.4] - 2026-04-28

### Added

- Added Daily Challenge support in the problem explorer.
- Added retrieval and display support for the daily challenge problem.

### Fixed

- Updated package version metadata to `0.1.4`.

## [0.1.3] - 2026-04-28

### Added

- Added FSRS-style review scheduling with stability, difficulty, retrievability, reps, lapses, desired retention, and maximum interval settings.
- Added local-folder review sync for cross-device workflows using a user-managed synced directory.
- Added append-only monthly review logs under `logs/YYYY-MM.jsonl`.
- Added sharded review card storage under `cards/` plus `manifest.json`.
- Added migration support for legacy review records into the enhanced review model.

### Changed

- Enhanced review list scheduling so records are ordered by the next scheduled review date.
- Updated review settings and documentation for the new scheduler and sync model.

## [0.1.2] - 2026-04-28

### Fixed

- Corrected package version and publisher metadata.
- Updated package dependencies after the LeetCode Master fork metadata changes.

## [0.1.1] - 2026-04-27

### Added

- Published as the independent `LeetCode Master` extension identity.
- Added accepted-submission review prompts with `Again`, `Hard`, `Good`, and `Easy` confidence ratings.
- Added local review persistence using VS Code `globalState`.
- Added Review List webview with scheduled reviews, daily goal progress, problem preview links, and rating updates.
- Added Review Stats webview with a 30-day activity heatmap, confidence distribution, completion trend, and actionable review insights.
- Added a Today Review tree in the LeetCode Master side bar with refresh and problem-preview actions.
- Added a review-due status bar item for due review counts.
- Added settings for review list sorting, daily review target, desired retention, and maximum review interval.
- Added publishing support files: `SUPPORT.md`, `SECURITY.md`, `PRIVACY.md`, and `NOTICE`.

### Changed

- Rebranded Marketplace metadata, command categories, icon assets, README, and Chinese documentation for LeetCode Master.
- Migrated commands, settings, views, webviews, URI scheme, and global state keys to the `leetcodeMaster` namespace.
- Native-styled review webviews to better match VS Code.
- Reused the existing problem preview flow from review list and Today Review entries.

### Fixed

- Fixed review heatmap layout crowding.
- Fixed VS Code task configuration for lint/build workflows.

### Attribution

- LeetCode Master is based on the MIT-licensed `vscode-leetcode` project. Original copyright notices are retained in `LICENSE`.
