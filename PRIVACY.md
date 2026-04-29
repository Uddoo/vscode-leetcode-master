# Privacy

LeetCode Master is designed to keep review-planning data local to VS Code.

## Data Stored Locally

The review assistant stores records in VS Code `globalState`, including:

- Problem ID.
- Problem title.
- Problem tags.
- Latest confidence rating.
- Next review date.
- Review history entries with review time and rating.

This review data is not sent to a LeetCode Master backend. If you configure an external review-sync backend, the same review data is written to the local sync folder or WebDAV server you choose.

## Network Access

The extension connects to the selected LeetCode endpoint for the inherited coding workflow:

- Sign in and manage sessions.
- Fetch problem lists and metadata.
- Preview problem descriptions.
- Run tests.
- Submit solutions.
- Fetch submissions and solutions when requested.

Network behavior depends on whether `leetcodeMaster.endpoint` is set to `leetcode` or `leetcode-cn`. LeetCode Master uses `leetcodeMaster.*` settings and state keys so it can coexist with the original LeetCode extension.

If `leetcodeMaster.review.sync.backend` is set to `webdav`, the extension also connects to your configured WebDAV server to read and write review sync files.

## Telemetry

The underlying LeetCode workflow includes an anonymous usage reporting setting. You can disable it with:

```json
{
  "leetcodeMaster.allowReportData": false
}
```

The review assistant does not add a separate telemetry pipeline.

## Credentials

The extension relies on the existing LeetCode session flow. Do not share output logs that include cookies, tokens, or other credentials.

WebDAV application passwords are stored in VS Code SecretStorage on each device. They are not stored in `settings.json` and are not marked for VS Code Settings Sync.
