// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import * as list from "../commands/list";
import * as show from "../commands/show";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "../webview/LeetCodeWebview";
import { IProblem } from "../shared";
import { isConfidenceRating } from "./scheduler";
import { getReviewDailyGoal, getTodayCompletedReviewCount, sortReviewRecords } from "./settings";
import { reviewStorage } from "./storage";
import { ReviewProblemMetadata, ReviewRecord } from "./types";
import { getNonce } from "./webviewUtils";

class ReviewListProvider extends LeetCodeWebview {
    protected readonly viewType: string = "leetcodeMaster.reviewList";
    private context: vscode.ExtensionContext | undefined;

    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    public show(): void {
        this.showWebviewInternal();
        this.postRecords();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        return {
            title: "LeetCode Review List",
            viewColumn: vscode.ViewColumn.Two,
        };
    }

    protected getLocalResourceRoots(): vscode.Uri[] {
        return [vscode.Uri.file(this.getReviewResourceRoot())];
    }

    protected shouldShowMarkdownConfigHint(): boolean {
        return false;
    }

    protected getWebviewContent(): string {
        const webview: vscode.Webview = this.getWebview();
        const nonce: string = getNonce();
        const styleUri: vscode.Uri = webview.asWebviewUri(vscode.Uri.file(path.join(this.getReviewResourceRoot(), "reviewList.css")));
        const scriptUri: vscode.Uri = webview.asWebviewUri(vscode.Uri.file(path.join(this.getReviewResourceRoot(), "reviewList.js")));

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <link rel="stylesheet" type="text/css" href="${styleUri}">
                <title>LeetCode Review List</title>
            </head>
            <body>
                <main class="review-shell">
                    <header class="hero">
                        <div>
                            <p class="eyebrow">FRSR Review Queue</p>
                            <h1>LeetCode Review List</h1>
                            <p class="subtitle">Problems are sorted by their next scheduled review date.</p>
                        </div>
                        <button id="refreshButton" class="secondary-button" type="button">Refresh</button>
                    </header>
                    <section id="summary" class="summary"></section>
                    <section class="table-card">
                        <div id="emptyState" class="empty-state hidden">
                            <h2>No review records yet</h2>
                            <p>Submit an accepted solution and choose a confidence rating to start tracking reviews.</p>
                        </div>
                        <table id="reviewTable" class="review-table">
                            <thead>
                                <tr>
                                    <th>Problem</th>
                                    <th>Tags</th>
                                    <th>Rating</th>
                                    <th>Next Review</th>
                                    <th>Mark Reviewed</th>
                                </tr>
                            </thead>
                            <tbody id="reviewTableBody"></tbody>
                        </table>
                    </section>
                    <div id="message" class="message" role="status"></div>
                </main>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }

    protected async onDidReceiveMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case "ready":
                case "refresh":
                    await this.postRecords();
                    return;
                case "review":
                    await this.updateReviewRecordFromMessage(message);
                    return;
                case "openProblem":
                    await this.openProblemFromMessage(message);
                    return;
                default:
                    return;
            }
        } catch (error) {
            const messageText: string = error && error.message ? error.message : error.toString();
            vscode.window.showErrorMessage(`Failed to handle review list action: ${messageText}`);
            await this.postError(messageText);
        }
    }

    protected async onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent): Promise<void> {
        await super.onDidChangeConfiguration(event);
        if (this.panel && event.affectsConfiguration("leetcodeMaster.review")) {
            await this.postRecords();
        }
    }

    private async updateReviewRecordFromMessage(message: any): Promise<void> {
        const problemId: string = typeof message.problemId === "string" ? message.problemId : "";
        const rating: string = typeof message.rating === "string" ? message.rating : "";
        if (!problemId) {
            throw new Error("Missing problem id.");
        }
        if (!isConfidenceRating(rating)) {
            throw new Error(`Invalid confidence rating: ${rating}`);
        }

        const existing: ReviewRecord | undefined = reviewStorage.getReviewRecord(problemId);
        const metadata: ReviewProblemMetadata = {
            problemTitle: existing ? existing.problemTitle : `Problem ${problemId}`,
            tags: existing ? existing.tags : [],
        };
        await reviewStorage.updateReviewRecord(problemId, rating, metadata);
        await this.postRecords();
    }

    private async openProblemFromMessage(message: any): Promise<void> {
        const problemId: string = typeof message.problemId === "string" ? message.problemId : "";
        if (!problemId) {
            throw new Error("Missing problem id.");
        }

        let problem: IProblem | undefined = explorerNodeManager.getNodeById(problemId);
        if (!problem) {
            await explorerNodeManager.refreshCache();
            problem = explorerNodeManager.getNodeById(problemId);
        }
        if (!problem) {
            const problems: IProblem[] = await list.listProblems();
            problem = problems.find((item: IProblem) => item.id === problemId);
        }
        if (!problem) {
            throw new Error(`Failed to resolve problem with id: ${problemId}.`);
        }

        await show.previewProblem(problem);
    }

    private async postRecords(): Promise<void> {
        if (!this.panel) {
            return;
        }
        const now: Date = new Date();
        const records: ReviewRecord[] = reviewStorage.getAllReviewRecords();
        await this.panel.webview.postMessage({
            command: "records",
            records: sortReviewRecords(records, now),
            now: now.toISOString(),
            dailyGoal: getReviewDailyGoal(),
            todayCompleted: getTodayCompletedReviewCount(records, now),
        });
    }

    private async postError(message: string): Promise<void> {
        if (!this.panel) {
            return;
        }
        await this.panel.webview.postMessage({
            command: "error",
            message,
        });
    }

    private getWebview(): vscode.Webview {
        if (!this.panel) {
            throw new Error("Review list webview is not available.");
        }
        return this.panel.webview;
    }

    private getReviewResourceRoot(): string {
        if (!this.context) {
            throw new Error("Review list provider has not been initialized.");
        }
        return this.context.asAbsolutePath(path.join("resources", "review"));
    }
}

export const reviewListProvider: ReviewListProvider = new ReviewListProvider();
