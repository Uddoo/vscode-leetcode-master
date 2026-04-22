// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { leetCodeExecutor } from "../leetCodeExecutor";
import { leetCodeManager } from "../leetCodeManager";
import { leetCodeChannel } from "../leetCodeChannel";
import { promptForAcceptedSubmission } from "../review/acceptedSubmission";
import { DialogType, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { getActiveFilePath } from "../utils/workspaceUtils";
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

    let result: string;
    try {
        result = await leetCodeExecutor.submitSolution(filePath);
        leetCodeSubmissionProvider.show(result);
    } catch (error) {
        await promptForOpenOutputChannel("Failed to submit the solution. Please open the output channel for details.", DialogType.error);
        return;
    }

    try {
        await promptForAcceptedSubmission(filePath, result);
    } catch (error) {
        leetCodeChannel.appendLine(`[Review] Failed to handle accepted submission: ${error.toString()}`);
    }

    leetCodeTreeDataProvider.refresh();
}
