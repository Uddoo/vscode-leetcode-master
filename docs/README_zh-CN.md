# LeetCode Master

LeetCode Master 是一个 VS Code 插件，用于在编辑器内刷 LeetCode，并为已通过题目提供复习计划、复习列表和统计分析。

插件保留原开源 LeetCode 插件的基础能力：登录、切换中英文站点、浏览题目、预览题面、创建代码文件、测试和提交。同时新增基于评分的间隔复习能力，帮助用户把 AC 题目沉淀为可持续复习队列。

## 功能

- 在 VS Code 中浏览、预览、创建、测试和提交 LeetCode 题目。
- 支持 `leetcode.com` 和 `leetcode.cn` 两个端点。
- 提交通过后弹出提示，可将题目加入复习列表。
- 使用 `Again`、`Hard`、`Good`、`Easy` 四档自信评分。
- 使用 FRSR 风格的固定间隔规则安排下次复习：
  - `Again`：明天
  - `Hard`：3 天后
  - `Good`：7 天后
  - `Easy`：14 天后
- 通过 `LeetCode Master: Show Review List` 打开复习列表，查看待复习题目、跳转题面并更新评分。
- 通过 `LeetCode Master: Show Review Stats` 查看最近 30 天热力图、评分分布和每日完成趋势。
- 在 VS Code Settings 中配置复习列表排序方式和每日复习目标。

## 运行要求

- VS Code `1.57.0` 或更高版本。
- `PATH` 中可访问 Node.js，或通过 `leetcodeMaster.nodePath` 指定 Node.js 路径。
- 已拥有当前端点对应的 LeetCode 账号。

## 使用方式

1. 打开 LeetCode Master 活动栏视图。
2. 执行 `LeetCode Master: Sign In`，选择要使用的站点。
3. 通过题目列表的 `Show Problem` 或题面页右下角的 `Code Now` 创建解题文件。
4. 编写代码后执行 `Submit`。
5. 提交结果为 Accepted 后，选择是否加入复习列表，并选择自信评分。
6. 使用 `Show Review List` 进行每日复习。
7. 使用 `Show Review Stats` 查看复习数据。

## 复习设置

在 VS Code Settings 中搜索 `leetcodeMaster review`。
LeetCode Master 使用独立的 `leetcodeMaster.*` 设置命名空间，因此可以与原 LeetCode 插件共存。

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `leetcodeMaster.review.sortStrategy` | 控制 Review List 排序。可选：`Sort By Next Scheduled Review (ASC)`、`Sort By Next Scheduled Review (DESC)`、`Sort By Review Delayed Hours (ASC)`、`Sort By Review Delayed Hours (DESC)`。 | `Sort By Next Scheduled Review (ASC)` |
| `leetcodeMaster.review.dailyGoal` | 每日复习目标，只用于 Review List 顶部进度展示，不会限制继续复习。 | `5` |
| `leetcodeMaster.review.desiredRetention` | FSRS 调度使用的目标记忆保持率。值越高，间隔越短，复习越频繁。 | `0.9` |
| `leetcodeMaster.review.maximumIntervalDays` | FSRS 最大复习间隔天数。 | `36500` |
| `leetcodeMaster.review.sync.backend` | 复习数据同步后端。可选 `off`、`localFolder`、`webdav`。 | `off` |
| `leetcodeMaster.review.sync.folder` | 使用 `localFolder` 后端时的本地同步目录。 | `""` |
| `leetcodeMaster.review.sync.webdav.url` | 使用 `webdav` 后端时的 WebDAV 服务器地址，默认指向坚果云。 | `https://dav.jianguoyun.com/dav/` |
| `leetcodeMaster.review.sync.webdav.username` | WebDAV 账号。 | `""` |
| `leetcodeMaster.review.sync.webdav.rootPath` | WebDAV 远端同步目录。 | `LeetCodeMaster` |

## 复习数据同步

LeetCode Master 支持通过 VS Code Settings Sync、本地同步目录或 WebDAV 同步复习数据。未完整配置外部同步后端时，插件会继续使用 VS Code Settings Sync 同步复习记录。

如果使用 `localFolder`，请将 `leetcodeMaster.review.sync.folder` 指向坚果云、OneDrive、Dropbox、iCloud 等第三方同步工具管理的本地目录，并将 `leetcodeMaster.review.sync.backend` 设置为 `localFolder`。

如果使用 `webdav`，请将 `leetcodeMaster.review.sync.backend` 设置为 `webdav`，配置 WebDAV 地址、账号和远端目录，然后执行 `LeetCode Master: Set WebDAV Password` 命令，把第三方应用密码保存到 VS Code SecretStorage。坚果云可使用 `https://dav.jianguoyun.com/dav/`、坚果云账号和第三方应用密码。如果坚果云在创建远端目录时报服务端错误，请先在坚果云中手动创建 `leetcodeMaster.review.sync.webdav.rootPath` 对应的文件夹，以及其中的 `cards`、`logs` 子文件夹，再重新同步。

外部同步后端会使用相同的数据布局：当前 FSRS 卡片状态保存在 `cards/` 分片 JSON 文件中，复习事件追加到 `logs/` 目录下的 JSONL 文件中，并维护 `manifest.json`。

## 常用设置

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `leetcodeMaster.endpoint` | 当前使用的站点：`leetcode` 或 `leetcode-cn`。 | `leetcode` |
| `leetcodeMaster.defaultLanguage` | 创建题目文件时使用的默认语言。 | 未设置 |
| `leetcodeMaster.workspaceFolder` | 生成解题文件的工作区目录。 | `""` |
| `leetcodeMaster.filePath` | 生成题目文件的目录与文件名模板。 | `${id}.${kebab-case-name}.${ext}` |
| `leetcodeMaster.editor.shortcuts` | 解题文件中的 CodeLens 快捷操作。 | `["submit", "test"]` |
| `leetcodeMaster.enableSideMode` | 是否将题面、提交结果、题解等 Webview 放到第二编辑器列。 | `true` |
| `leetcodeMaster.allowReportData` | 是否允许继承自原 LeetCode 流程的匿名使用数据上报。 | `true` |

## 隐私与网络访问

LeetCode Master 会访问当前配置的 LeetCode 端点，用于登录、拉取题目列表、预览题面、运行测试和提交答案。

复习记录保存在 VS Code 的 `globalState` 中，包含题目 ID、标题、标签、最新评分、下次复习日期和复习历史。未完整配置外部同步后端时，插件会把复习记录交给 VS Code Settings Sync；完整配置 `localFolder` 或 `webdav` 后，则改用对应外部后端。

WebDAV 密码保存在每台设备本地的 VS Code SecretStorage 中，不会写入 `settings.json`。

如果不希望启用继承自原 LeetCode 流程的匿名产品数据上报，请将 `leetcodeMaster.allowReportData` 设置为 `false`。

完整说明见仓库中的 `PRIVACY.md`。

## 本地构建

```bash
npm ci
npm run compile
npm run lint
npm run build
```

`npm run build` 会通过 `@vscode/vsce` 生成 `.vsix` 安装包。发布到 VS Code Marketplace 前，需要创建自己的 Publisher，并将 `package.json` 中的 `publisher` 改成真实 Publisher ID。

## 支持

提交问题时请提供 VS Code 版本、插件版本、操作系统、使用的 LeetCode 端点以及相关输出日志。

## 致谢

LeetCode Master 基于 MIT 许可的 `vscode-leetcode` 项目和 `leetcode-cli` 生态构建。原版权声明已保留在 `LICENSE` 中。
