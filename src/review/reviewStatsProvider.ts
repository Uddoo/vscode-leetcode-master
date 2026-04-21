import * as path from "path";
import { Uri, ViewColumn } from "vscode";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "../webview/LeetCodeWebview";
import { reviewContext } from "./reviewContext";
import { reviewService } from "./reviewService";

class ReviewStatsProvider extends LeetCodeWebview {
    protected readonly viewType: string = "leetcode.review.stats";

    public show(): void {
        this.showWebviewInternal();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        return {
            title: "LeetCode Review Stats",
            viewColumn: ViewColumn.Two,
            preserveFocus: true,
        };
    }

    protected getWebviewContent(): string {
        if (!this.panel) {
            return "";
        }

        const context = reviewContext.getContext();
        const stylesUri = this.panel.webview.asWebviewUri(Uri.file(path.join(context.extensionPath, "resources", "review", "reviewStats.css")));
        const scriptUri = this.panel.webview.asWebviewUri(Uri.file(path.join(context.extensionPath, "resources", "review", "reviewStats.js")));
        const stats = JSON.stringify(reviewService.getStats());

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src ${this.panel.webview.cspSource};" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="stylesheet" href="${stylesUri}" />
</head>
<body>
<div class="container">
  <h2>Review Stats</h2>
  <div id="summary"></div>
  <div id="rating-distribution"></div>
  <svg id="trend-chart" width="720" height="220"></svg>
  <div id="heatmap"></div>
</div>
<script>window.__REVIEW_STATS__ = ${stats};</script>
<script src="${scriptUri}"></script>
</body>
</html>`;
    }
}

export const reviewStatsProvider: ReviewStatsProvider = new ReviewStatsProvider();
