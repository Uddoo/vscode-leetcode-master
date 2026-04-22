// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import * as list from "../commands/list";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { leetCodeChannel } from "../leetCodeChannel";
import { IProblem } from "../shared";
import { getNodeIdFromFile } from "../utils/problemUtils";
import { reviewStorage } from "./storage";
import { confidenceRatings, ReviewProblemMetadata, ReviewRecord } from "./types";

const SkipReviewChoice: string = "Skip";

export function isAcceptedSubmission(result: string): boolean {
    return /\bAccepted\b/i.test(result);
}

export async function promptForAcceptedSubmission(filePath: string, result: string): Promise<void> {
    if (!isAcceptedSubmission(result)) {
        return;
    }

    const problemId: string = await getNodeIdFromFile(filePath);
    if (!problemId) {
        vscode.window.showWarningMessage("LeetCode accepted the submission, but the problem id could not be resolved for review tracking.");
        return;
    }

    const metadata: ReviewProblemMetadata = await resolveProblemMetadata(problemId);
    const choice: string | undefined = await vscode.window.showInformationMessage(
        `Accepted: ${metadata.problemTitle}. Add or update this problem in your review list?`,
        ...confidenceRatings,
        SkipReviewChoice
    );
    if (!choice || choice === SkipReviewChoice) {
        return;
    }

    const record: ReviewRecord = await reviewStorage.updateReviewRecord(problemId, choice, metadata);
    vscode.window.showInformationMessage(`Review scheduled for ${metadata.problemTitle} on ${new Date(record.nextReviewDate).toLocaleDateString()}.`);
}

async function resolveProblemMetadata(problemId: string): Promise<ReviewProblemMetadata> {
    const cachedNode: LeetCodeNode | undefined = explorerNodeManager.getNodeById(problemId);
    if (cachedNode) {
        return {
            problemTitle: cachedNode.name,
            tags: cachedNode.tags,
        };
    }

    try {
        const problems: IProblem[] = await list.listProblems();
        const problem: IProblem | undefined = problems.find((item: IProblem) => item.id === problemId);
        if (problem) {
            return {
                problemTitle: problem.name,
                tags: problem.tags,
            };
        }
    } catch (error) {
        leetCodeChannel.appendLine(`[Review] Failed to resolve problem metadata for ${problemId}: ${error.toString()}`);
    }

    return {
        problemTitle: `Problem ${problemId}`,
        tags: [],
    };
}
