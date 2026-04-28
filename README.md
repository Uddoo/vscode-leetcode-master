# LeetCode Master

LeetCode Master is a VS Code extension for solving LeetCode problems and keeping a structured review plan inside the editor.

It keeps the core LeetCode workflow from the original open-source extension and adds a review assistant: accepted submissions can be added to a spaced-repetition review queue, rated with confidence, scheduled for future review, and visualized with activity statistics.

## Features

- Browse, preview, solve, test, and submit LeetCode problems from VS Code.
- Switch between `leetcode.com` and `leetcode.cn` endpoints.
- Prompt after an accepted submission to add the problem to your review list.
- Rate review confidence as `Again`, `Hard`, `Good`, or `Easy`.
- Schedule the next review with FRSR-style intervals:
  - `Again`: tomorrow
  - `Hard`: 3 days later
  - `Good`: 7 days later
  - `Easy`: 14 days later
- Open `LeetCode Master: Show Review List` to review scheduled problems, jump to the problem preview, and update the rating.
- Open `LeetCode Master: Show Review Stats` to inspect a 30-day heatmap, confidence distribution, and daily completion trend.
- Configure Review List sorting and daily review target from VS Code Settings.

## Requirements

- VS Code `1.57.0` or newer.
- Node.js available on `PATH`, or configured with `leetcodeMaster.nodePath`.
- A LeetCode account for the selected endpoint.

## Usage

1. Open the LeetCode Master activity bar view.
2. Run `LeetCode Master: Sign In` and choose the endpoint you use.
3. Open or create a solution with `Show Problem` or the `Code Now` button in a problem preview.
4. Submit the solution with `Submit`.
5. When the result is accepted, choose whether to add it to the review list and select a confidence rating.
6. Use `Show Review List` for scheduled review sessions.
7. Use `Show Review Stats` to check review activity and confidence distribution.

## Review Settings

Search for `leetcodeMaster review` in VS Code Settings.
LeetCode Master uses the `leetcodeMaster.*` settings namespace so it can coexist with the original LeetCode extension.

| Setting | Description | Default |
| --- | --- | --- |
| `leetcodeMaster.review.sortStrategy` | Controls the order of Review List records. Options: `Sort By Next Scheduled Review (ASC)`, `Sort By Next Scheduled Review (DESC)`, `Sort By Review Delayed Hours (ASC)`, `Sort By Review Delayed Hours (DESC)`. | `Sort By Next Scheduled Review (ASC)` |
| `leetcodeMaster.review.dailyGoal` | Daily target number shown in the Review List progress summary. It does not block extra reviews. | `5` |

## Core Settings

| Setting | Description | Default |
| --- | --- | --- |
| `leetcodeMaster.endpoint` | Active endpoint: `leetcode` or `leetcode-cn`. | `leetcode` |
| `leetcodeMaster.defaultLanguage` | Default language used when creating problem files. | Not set |
| `leetcodeMaster.workspaceFolder` | Workspace folder used for generated solution files. | `""` |
| `leetcodeMaster.filePath` | Folder and filename template for generated problem files. | `${id}.${kebab-case-name}.${ext}` |
| `leetcodeMaster.editor.shortcuts` | CodeLens shortcuts shown in solution files. | `["submit", "test"]` |
| `leetcodeMaster.enableSideMode` | Group preview/result/solution webviews into the second editor column. | `true` |
| `leetcodeMaster.allowReportData` | Allow anonymous usage data reporting inherited from the underlying LeetCode workflow. | `true` |

## Privacy And Network Access

LeetCode Master communicates with the configured LeetCode endpoint to sign in, list problems, preview descriptions, run tests, and submit solutions.

Review records are stored in VS Code `globalState`. The review data includes problem ID, title, tags, latest confidence rating, next review date, and review history. LeetCode Master marks only the review records key for VS Code Settings Sync, so your review progress can follow your VS Code account across devices when Settings Sync is enabled. The review assistant does not upload this review data to a custom backend.

LeetCode sign-in cookies and user status are not marked for Settings Sync. Sign in separately on each device.

If you do not want anonymous product telemetry from the inherited LeetCode workflow, set `leetcodeMaster.allowReportData` to `false`.

See `PRIVACY.md` for the full privacy notes.

## Publishing And Local Build

```bash
npm ci
npm run compile
npm run lint
npm run build
```

`npm run build` packages a `.vsix` with `@vscode/vsce`. To publish to the Marketplace, create a publisher, set `publisher` in `package.json` to that publisher ID, then run:

```bash
npx @vscode/vsce login <publisher-id>
npx @vscode/vsce publish
```

Do not commit Personal Access Tokens.

## Support

Use the repository issue tracker configured in `package.json` for bugs and feature requests. Include VS Code version, extension version, operating system, endpoint, and relevant output logs.

## Acknowledgements

LeetCode Master is based on the MIT-licensed `vscode-leetcode` project and the `leetcode-cli` ecosystem. The original copyright notices are preserved in `LICENSE`.
