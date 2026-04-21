import * as path from "path";
import { Uri, ViewColumn, window } from "vscode";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "../webview/LeetCodeWebview";
import { reviewContext } from "./reviewContext";
import { reviewService } from "./reviewService";

interface IWebviewMessage {
    command: string;
    problemId?: string;
    rating?: string;
}

class ReviewListProvider extends LeetCodeWebview {
    protected readonly viewType: string = "leetcode.review.list";

    public show(): void {
        this.showWebviewInternal();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        return {
            title: "LeetCode Review List",
            viewColumn: ViewColumn.Two,
            preserveFocus: true,
        };
    }

    protected getWebviewContent(): string {
        if (!this.panel) {
            return "";
        }

        const context = reviewContext.getContext();
        const stylesUri = this.panel.webview.asWebviewUri(Uri.file(path.join(context.extensionPath, "resources", "review", "reviewList.css")));
        const scriptUri = this.panel.webview.asWebviewUri(Uri.file(path.join(context.extensionPath, "resources", "review", "reviewList.js")));
        const records = JSON.stringify(reviewService.getAllRecords());

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
  <h2>Review List</h2>
  <div id="review-list"></div>
</div>
<script>window.__REVIEW_RECORDS__ = ${records};</script>
<script src="${scriptUri}"></script>
</body>
</html>`;
    }

    protected async onDidReceiveMessage(message: IWebviewMessage): Promise<void> {
        if (message.command !== "updateRating" || !message.problemId || !message.rating) {
            return;
        }

        try {
            await reviewService.updateReviewRecord(message.problemId, message.rating);
            if (this.panel) {
                this.panel.webview.html = this.getWebviewContent();
            }
        } catch (error) {
            window.showErrorMessage(`Failed to update review record: ${error}`);
        }
    }
}

export const reviewListProvider: ReviewListProvider = new ReviewListProvider();
