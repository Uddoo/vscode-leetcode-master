// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { extensionCommandPrefix } from "../shared";

export class LeetCodeReviewDueStatusBarItem implements vscode.Disposable {
    private readonly statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        this.statusBarItem.command = `${extensionCommandPrefix}.review.showTodayDue`;
        this.statusBarItem.tooltip = "Open LeetCode Master today review";
        this.updateDueCount(0);
    }

    public updateDueCount(dueCount: number): void {
        this.statusBarItem.text = `LeetCode Master: ${Math.max(0, dueCount)} due`;
    }

    public show(): void {
        this.statusBarItem.show();
    }

    public hide(): void {
        this.statusBarItem.hide();
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
