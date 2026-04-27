// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "../webview/LeetCodeWebview";
import { buildReviewStats } from "./stats";
import { reviewStorage } from "./storage";
import { getNonce } from "./webviewUtils";

class ReviewStatsProvider extends LeetCodeWebview {
    protected readonly viewType: string = "leetcodeMaster.reviewStats";
    private context: vscode.ExtensionContext | undefined;

    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
    }

    public show(): void {
        this.showWebviewInternal();
        this.postStats();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        return {
            title: "LeetCode Review Stats",
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
        const styleUri: vscode.Uri = webview.asWebviewUri(vscode.Uri.file(path.join(this.getReviewResourceRoot(), "reviewStats.css")));
        const scriptUri: vscode.Uri = webview.asWebviewUri(vscode.Uri.file(path.join(this.getReviewResourceRoot(), "reviewStats.js")));

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <link rel="stylesheet" type="text/css" href="${styleUri}">
                <title>LeetCode Review Stats</title>
            </head>
            <body>
                <main class="stats-shell">
                    <header class="hero">
                        <div>
                            <p class="eyebrow">Review Analytics</p>
                            <h1>LeetCode Review Stats</h1>
                            <p class="subtitle">A 30-day view of review activity, confidence distribution, and completion trend.</p>
                        </div>
                        <button id="refreshButton" class="secondary-button" type="button">Refresh</button>
                    </header>
                    <section id="summary" class="summary-grid"></section>
                    <section class="chart-grid">
                        <article class="chart-card">
                            <div class="chart-heading">
                                <h2>Calendar Heatmap</h2>
                                <span>Recent 30 days</span>
                            </div>
                            <div id="heatmap" class="heatmap"></div>
                        </article>
                        <article class="chart-card">
                            <div class="chart-heading">
                                <h2>Confidence Distribution</h2>
                                <span>Again / Hard / Good / Easy</span>
                            </div>
                            <div id="ratingBars" class="rating-bars"></div>
                        </article>
                        <article class="chart-card chart-wide">
                            <div class="chart-heading">
                                <h2>Daily Review Trend</h2>
                                <span>Completed reviews per day</span>
                            </div>
                            <svg id="trendLine" class="trend-line" role="img" aria-label="Daily review trend"></svg>
                        </article>
                    </section>
                    <div id="message" class="message" role="status"></div>
                </main>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }

    protected async onDidReceiveMessage(message: any): Promise<void> {
        switch (message.command) {
            case "ready":
            case "refresh":
                await this.postStats();
                return;
            default:
                return;
        }
    }

    private async postStats(): Promise<void> {
        if (!this.panel) {
            return;
        }
        await this.panel.webview.postMessage({
            command: "stats",
            stats: buildReviewStats(reviewStorage.getAllReviewRecords()),
        });
    }

    private getWebview(): vscode.Webview {
        if (!this.panel) {
            throw new Error("Review stats webview is not available.");
        }
        return this.panel.webview;
    }

    private getReviewResourceRoot(): string {
        if (!this.context) {
            throw new Error("Review stats provider has not been initialized.");
        }
        return this.context.asAbsolutePath(path.join("resources", "review"));
    }
}

export const reviewStatsProvider: ReviewStatsProvider = new ReviewStatsProvider();
