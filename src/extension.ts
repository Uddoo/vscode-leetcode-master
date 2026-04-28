// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { codeLensController } from "./codelens/CodeLensController";
import * as cache from "./commands/cache";
import { switchDefaultLanguage } from "./commands/language";
import * as plugin from "./commands/plugin";
import * as session from "./commands/session";
import * as show from "./commands/show";
import * as star from "./commands/star";
import * as submit from "./commands/submit";
import * as test from "./commands/test";
import { explorerNodeManager } from "./explorer/explorerNodeManager";
import { LeetCodeNode } from "./explorer/LeetCodeNode";
import { leetCodeTreeDataProvider } from "./explorer/LeetCodeTreeDataProvider";
import { leetCodeTreeItemDecorationProvider } from "./explorer/LeetCodeTreeItemDecorationProvider";
import { leetCodeChannel } from "./leetCodeChannel";
import { leetCodeExecutor } from "./leetCodeExecutor";
import { leetCodeManager } from "./leetCodeManager";
import { reviewListProvider } from "./review/reviewListProvider";
import { reviewStatsProvider } from "./review/reviewStatsProvider";
import { configureReviewRecordSync, reviewStorage } from "./review/storage";
import { ITodayReviewTreeNode, todayReviewTreeDataProvider } from "./review/todayReviewTreeDataProvider";
import { leetCodeStatusBarController } from "./statusbar/leetCodeStatusBarController";
import { migrateLegacySettings } from "./utils/configurationMigration";
import { DialogType, promptForOpenOutputChannel } from "./utils/uiUtils";
import { leetCodePreviewProvider } from "./webview/leetCodePreviewProvider";
import { leetCodeSolutionProvider } from "./webview/leetCodeSolutionProvider";
import { leetCodeSubmissionProvider } from "./webview/leetCodeSubmissionProvider";
import { markdownEngine } from "./webview/markdownEngine";
import TrackData from "./utils/trackingUtils";
import { globalState } from "./globalState";
import { extensionTodayReviewTreeViewId, extensionTreeViewId, initializeExtensionIdentity } from "./shared";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        initializeExtensionIdentity(context);
        await migrateLegacySettings(context);

        if (!(await leetCodeExecutor.meetRequirements(context))) {
            throw new Error("The environment doesn't meet requirements.");
        }

        leetCodeManager.on("statusChanged", () => {
            leetCodeStatusBarController.updateStatusBar(leetCodeManager.getStatus(), leetCodeManager.getUser());
            leetCodeTreeDataProvider.refresh();
        });

        leetCodeTreeDataProvider.initialize(context);
        await globalState.initialize(context);
        await reviewStorage.initialize(context);
        configureReviewRecordSync(context);
        reviewListProvider.initialize(context);
        reviewStatsProvider.initialize(context);
        todayReviewTreeDataProvider.initialize();

        context.subscriptions.push(
            leetCodeStatusBarController,
            leetCodeChannel,
            leetCodePreviewProvider,
            leetCodeSubmissionProvider,
            leetCodeSolutionProvider,
            reviewListProvider,
            reviewStatsProvider,
            todayReviewTreeDataProvider,
            leetCodeExecutor,
            markdownEngine,
            codeLensController,
            explorerNodeManager,
            vscode.window.registerFileDecorationProvider(leetCodeTreeItemDecorationProvider),
            vscode.window.createTreeView(extensionTreeViewId, { treeDataProvider: leetCodeTreeDataProvider, showCollapseAll: true }),
            vscode.window.createTreeView(extensionTodayReviewTreeViewId, { treeDataProvider: todayReviewTreeDataProvider }),
            vscode.commands.registerCommand("leetcodeMaster.deleteCache", () => cache.deleteCache()),
            vscode.commands.registerCommand("leetcodeMaster.toggleLeetCodeCn", () => plugin.switchEndpoint()),
            vscode.commands.registerCommand("leetcodeMaster.signin", () => leetCodeManager.signIn()),
            vscode.commands.registerCommand("leetcodeMaster.signout", () => leetCodeManager.signOut()),
            vscode.commands.registerCommand("leetcodeMaster.manageSessions", () => session.manageSessions()),
            vscode.commands.registerCommand("leetcodeMaster.previewProblem", (node: LeetCodeNode) => {
                TrackData.report({
                    event_key: `vscode_open_problem`,
                    type: "click",
                    extra: JSON.stringify({
                        problem_id: node.id,
                        problem_name: node.name,
                    }),
                });
                show.previewProblem(node);
            }),
            vscode.commands.registerCommand("leetcodeMaster.showProblem", (node: LeetCodeNode) => show.showProblem(node)),
            vscode.commands.registerCommand("leetcodeMaster.pickOne", () => show.pickOne()),
            vscode.commands.registerCommand("leetcodeMaster.searchProblem", () => show.searchProblem()),
            vscode.commands.registerCommand("leetcodeMaster.showSolution", (input: LeetCodeNode | vscode.Uri) => show.showSolution(input)),
            vscode.commands.registerCommand("leetcodeMaster.refreshExplorer", () => leetCodeTreeDataProvider.refresh()),
            vscode.commands.registerCommand("leetcodeMaster.testSolution", (uri?: vscode.Uri) => {
                TrackData.report({
                    event_key: `vscode_runCode`,
                    type: "click",
                    extra: JSON.stringify({
                        path: uri?.path,
                    }),
                });
                return test.testSolution(uri);
            }),
            vscode.commands.registerCommand("leetcodeMaster.submitSolution", (uri?: vscode.Uri) => {
                TrackData.report({
                    event_key: `vscode_submit`,
                    type: "click",
                    extra: JSON.stringify({
                        path: uri?.path,
                    }),
                });
                return submit.submitSolution(uri);
            }),
            vscode.commands.registerCommand("leetcodeMaster.switchDefaultLanguage", () => switchDefaultLanguage()),
            vscode.commands.registerCommand("leetcodeMaster.addFavorite", (node: LeetCodeNode) => star.addFavorite(node)),
            vscode.commands.registerCommand("leetcodeMaster.removeFavorite", (node: LeetCodeNode) => star.removeFavorite(node)),
            vscode.commands.registerCommand("leetcodeMaster.problems.sort", () => plugin.switchSortingStrategy()),
            vscode.commands.registerCommand("leetcodeMaster.review.showList", () => reviewListProvider.show()),
            vscode.commands.registerCommand("leetcodeMaster.review.showTodayDue", () => reviewListProvider.show("due")),
            vscode.commands.registerCommand("leetcodeMaster.review.syncNow", async () => {
                await reviewStorage.syncNow();
                todayReviewTreeDataProvider.refresh();
                vscode.window.showInformationMessage("LeetCode Master review data synchronized.");
            }),
            vscode.commands.registerCommand("leetcodeMaster.review.refreshToday", () => todayReviewTreeDataProvider.refresh()),
            vscode.commands.registerCommand("leetcodeMaster.review.openTodayProblem", (node: ITodayReviewTreeNode) => todayReviewTreeDataProvider.openProblem(node)),
            vscode.commands.registerCommand("leetcodeMaster.review.showStats", () => reviewStatsProvider.show())
        );

        leetCodeStatusBarController.initializeReviewDueStatusBar();

        await leetCodeExecutor.switchEndpoint(plugin.getLeetCodeEndpoint());
        await leetCodeManager.getLoginStatus();
        vscode.window.registerUriHandler({ handleUri: leetCodeManager.handleUriSignIn });
    } catch (error) {
        leetCodeChannel.appendLine(error.toString());
        promptForOpenOutputChannel("Extension initialization failed. Please open output channel for details.", DialogType.error);
    }
}

export function deactivate(): void {
    // Do nothing.
}
