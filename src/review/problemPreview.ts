// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as list from "../commands/list";
import * as show from "../commands/show";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { IProblem } from "../shared";

export async function previewReviewProblem(problemId: string): Promise<void> {
    const problem: IProblem | undefined = await resolveReviewProblem(problemId);
    if (!problem) {
        throw new Error(`Failed to resolve problem with id: ${problemId}.`);
    }
    await show.previewProblem(problem);
}

async function resolveReviewProblem(problemId: string): Promise<IProblem | undefined> {
    let problem: IProblem | undefined = explorerNodeManager.getNodeById(problemId);
    if (problem) {
        return problem;
    }

    await explorerNodeManager.refreshCache();
    problem = explorerNodeManager.getNodeById(problemId);
    if (problem) {
        return problem;
    }

    const problems: IProblem[] = await list.listProblems();
    return problems.find((item: IProblem) => item.id === problemId);
}

export async function showPreviewError(error: Error): Promise<void> {
    vscode.window.showErrorMessage(`Failed to open review problem: ${error.message}`);
}
