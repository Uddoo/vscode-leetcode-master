# Changelog

All notable changes to LeetCode Master are documented in this file.

## [1.0.0] - 2026-04-22

### Added

- Published as the independent `LeetCode Master` extension identity with extension ID `leetcode-master`.
- Added accepted-submission review prompts with `Again`, `Hard`, `Good`, and `Easy` confidence ratings.
- Added FRSR-style review scheduling:
  - `Again`: next day
  - `Hard`: 3 days later
  - `Good`: 7 days later
  - `Easy`: 14 days later
- Added local review persistence using VS Code `globalState`.
- Added Review List webview with sortable scheduled reviews, daily goal progress, problem preview links, and rating updates.
- Added Review Stats webview with 30-day activity heatmap, confidence distribution, and daily completion trend.
- Added VS Code settings for Review List sorting and daily review target.
- Added publishing support files: `SUPPORT.md`, `SECURITY.md`, `PRIVACY.md`, and `NOTICE`.

### Changed

- Rebranded Marketplace metadata, command categories, icon assets, README, and Chinese documentation for LeetCode Master.
- Replaced the original preview-package metadata with a stable `1.0.0` release entry.
- Updated CI to install dependencies with `npm ci`, compile, lint, and package with `@vscode/vsce`.

### Attribution

- LeetCode Master is based on the MIT-licensed `vscode-leetcode` project. Original copyright notices are retained in `LICENSE`.
