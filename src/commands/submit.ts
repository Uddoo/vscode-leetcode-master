// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { leetCodeExecutor } from "../leetCodeExecutor";
import { leetCodeManager } from "../leetCodeManager";
import { DialogType, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { getActiveFilePath } from "../utils/workspaceUtils";
import { getNodeIdFromFile } from "../utils/problemUtils";
import { reviewService } from "../review/reviewService";
import { leetCodeSubmissionProvider } from "../webview/leetCodeSubmissionProvider";

export async function submitSolution(uri?: vscode.Uri): Promise<void> {
    if (!leetCodeManager.getUser()) {
        promptForSignIn();
        return;
    }

    const filePath: string | undefined = await getActiveFilePath(uri);
    if (!filePath) {
        return;
    }

    try {
        const result: string = await leetCodeExecutor.submitSolution(filePath);
        leetCodeSubmissionProvider.show(result);

        if (result.includes("Accepted")) {
            const problemId: string = await getNodeIdFromFile(filePath);
            if (problemId) {
                const node = explorerNodeManager.getNodeById(problemId);
                await reviewService.promptAndUpdate(problemId, {
                    title: node?.name || problemId,
                    tags: node?.tags.filter((tag: string) => tag !== "Unknown") || [],
                });
            }
        }
    } catch (error) {
        await promptForOpenOutputChannel("Failed to submit the solution. Please open the output channel for details.", DialogType.error);
        return;
    }

    leetCodeTreeDataProvider.refresh();
}
