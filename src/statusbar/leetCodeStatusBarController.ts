// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { ConfigurationChangeEvent, Disposable, workspace, WorkspaceConfiguration } from "vscode";
import { getDueReviewRecordCount } from "../review/due";
import { reviewStorage } from "../review/storage";
import { ReviewRecord } from "../review/types";
import { extensionSettingsSection, UserStatus } from "../shared";
import { LeetCodeReviewDueStatusBarItem } from "./LeetCodeReviewDueStatusBarItem";
import { LeetCodeStatusBarItem } from "./LeetCodeStatusBarItem";

const ReviewDueRefreshIntervalMilliseconds: number = 60 * 1000;

class LeetCodeStatusBarController implements Disposable {
    private statusBar: LeetCodeStatusBarItem;
    private reviewDueStatusBar: LeetCodeReviewDueStatusBarItem;
    private configurationChangeListener: Disposable;
    private reviewRecordChangeListener: Disposable | undefined;
    private reviewDueRefreshTimer: NodeJS.Timeout | undefined;

    constructor() {
        this.statusBar = new LeetCodeStatusBarItem();
        this.reviewDueStatusBar = new LeetCodeReviewDueStatusBarItem();
        this.setStatusBarVisibility();

        this.configurationChangeListener = workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
            if (event.affectsConfiguration(`${extensionSettingsSection}.enableStatusBar`)) {
                this.setStatusBarVisibility();
            }
        }, this);
    }

    public updateStatusBar(status: UserStatus, user?: string): void {
        this.statusBar.updateStatusBar(status, user);
    }

    public initializeReviewDueStatusBar(): void {
        if (!this.reviewRecordChangeListener) {
            this.reviewRecordChangeListener = reviewStorage.onDidChangeReviewRecords(() => this.updateReviewDueStatusBar(), this);
        }
        if (!this.reviewDueRefreshTimer) {
            this.reviewDueRefreshTimer = setInterval(() => this.updateReviewDueStatusBar(), ReviewDueRefreshIntervalMilliseconds);
        }
        this.updateReviewDueStatusBar();
    }

    public updateReviewDueStatusBar(): void {
        const records: ReviewRecord[] = reviewStorage.getAllReviewRecords();
        this.reviewDueStatusBar.updateDueCount(getDueReviewRecordCount(records));
    }

    public dispose(): void {
        this.statusBar.dispose();
        this.reviewDueStatusBar.dispose();
        this.configurationChangeListener.dispose();
        if (this.reviewRecordChangeListener) {
            this.reviewRecordChangeListener.dispose();
            this.reviewRecordChangeListener = undefined;
        }
        if (this.reviewDueRefreshTimer) {
            clearInterval(this.reviewDueRefreshTimer);
            this.reviewDueRefreshTimer = undefined;
        }
    }

    private setStatusBarVisibility(): void {
        if (this.isStatusBarEnabled()) {
            this.statusBar.show();
            this.reviewDueStatusBar.show();
        } else {
            this.statusBar.hide();
            this.reviewDueStatusBar.hide();
        }
    }

    private isStatusBarEnabled(): boolean {
        const configuration: WorkspaceConfiguration = workspace.getConfiguration();
        return configuration.get<boolean>(`${extensionSettingsSection}.enableStatusBar`, true);
    }
}

export const leetCodeStatusBarController: LeetCodeStatusBarController = new LeetCodeStatusBarController();
