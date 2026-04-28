// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as os from "os";
import * as vscode from "vscode";
import { getDueReviewRecords } from "./due";
import { previewReviewProblem, showPreviewError } from "./problemPreview";
import { sortReviewRecords } from "./settings";
import { reviewStorage } from "./storage";
import { ReviewRecord } from "./types";

type TodayReviewTreeNodeKind = "record" | "empty";

export interface ITodayReviewTreeNode {
    kind: TodayReviewTreeNodeKind;
    record?: ReviewRecord;
}

class TodayReviewTreeDataProvider implements vscode.TreeDataProvider<ITodayReviewTreeNode>, vscode.Disposable {
    private readonly onDidChangeTreeDataEvent: vscode.EventEmitter<ITodayReviewTreeNode | undefined | null> = new vscode.EventEmitter<
        ITodayReviewTreeNode | undefined | null
    >();
    private disposables: vscode.Disposable[] = [];
    // tslint:disable-next-line:member-ordering
    public readonly onDidChangeTreeData: vscode.Event<ITodayReviewTreeNode | undefined | null> = this.onDidChangeTreeDataEvent.event;

    public initialize(): void {
        this.disposables.push(reviewStorage.onDidChangeReviewRecords(() => this.refresh()));
        this.disposables.push(vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration("leetcodeMaster.review")) {
                this.refresh();
            }
        }));
    }

    public refresh(): void {
        this.onDidChangeTreeDataEvent.fire(null);
    }

    public async openProblem(node: ITodayReviewTreeNode): Promise<void> {
        if (!node.record) {
            return;
        }
        try {
            await previewReviewProblem(node.record.problemId);
        } catch (error) {
            await showPreviewError(error);
        }
    }

    public getTreeItem(element: ITodayReviewTreeNode): vscode.TreeItem {
        if (element.kind === "empty" || !element.record) {
            return {
                label: "No due reviews",
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                iconPath: new vscode.ThemeIcon("check"),
                contextValue: "today-review-empty",
            };
        }

        const record: ReviewRecord = element.record;
        return {
            label: `[${record.problemId}] ${record.problemTitle}`,
            tooltip: this.getRecordTooltip(record),
            description: record.lastRating,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            iconPath: new vscode.ThemeIcon("calendar"),
            command: {
                command: "leetcodeMaster.review.openTodayProblem",
                title: "Open Review Problem",
                arguments: [element],
            },
            contextValue: "today-review-problem",
        };
    }

    public getChildren(element?: ITodayReviewTreeNode): vscode.ProviderResult<ITodayReviewTreeNode[]> {
        if (element) {
            return [];
        }

        const now: Date = new Date();
        const dueRecords: ReviewRecord[] = sortReviewRecords(getDueReviewRecords(reviewStorage.getAllReviewRecords(), now), now);
        if (dueRecords.length === 0) {
            return [{ kind: "empty" }];
        }
        return dueRecords.map((record: ReviewRecord) => ({ kind: "record", record }));
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.onDidChangeTreeDataEvent.dispose();
    }

    private getRecordTooltip(record: ReviewRecord): string {
        const lines: string[] = [
            `Problem: ${record.problemTitle}`,
            `Last rating: ${record.lastRating}`,
            `Next review: ${new Date(record.nextReviewDate).toLocaleString()}`,
        ];
        if (record.tags.length > 0) {
            lines.push(`Tags: ${record.tags.join(", ")}`);
        }
        return lines.join(os.EOL);
    }
}

export const todayReviewTreeDataProvider: TodayReviewTreeDataProvider = new TodayReviewTreeDataProvider();
