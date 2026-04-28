// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeChannel } from "../leetCodeChannel";
import { calculateNextReviewDate, isConfidenceRating } from "./scheduler";
import { ReviewProblemMetadata, ReviewRecord } from "./types";

export const ReviewRecordsKey: string = "leetcodeMaster.reviewRecords.v1";
const LegacyReviewRecordsKey: string = "leetcode-review-records-v1";
const ReviewRecordsMigrationKey: string = "leetcodeMaster.reviewRecordsMigrated.v1";
export const ReviewRecordSyncKeys: string[] = [ReviewRecordsKey];

type ReviewRecordMap = { [problemId: string]: ReviewRecord };

class ReviewStorage {
    private readonly reviewRecordChangedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    private state: vscode.Memento | undefined;
    public readonly onDidChangeReviewRecords: vscode.Event<void> = this.reviewRecordChangedEmitter.event;

    public async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.state = context.globalState;
        await this.migrateLegacyReviewRecords();
    }

    public getAllReviewRecords(): ReviewRecord[] {
        const records: ReviewRecordMap = this.getRecordMap();
        return Object.keys(records)
            .map((problemId: string) => records[problemId])
            .filter((record: ReviewRecord | undefined): record is ReviewRecord => !!record);
    }

    public getReviewRecord(problemId: string): ReviewRecord | undefined {
        return this.getRecordMap()[problemId];
    }

    /**
     * Updates an existing record or creates one if the problem was not tracked yet.
     *
     * @example
     * await reviewStorage.updateReviewRecord("1", "Good", { problemTitle: "Two Sum", tags: ["Array"] });
     */
    public async updateReviewRecord(problemId: string, rating: string, metadata?: ReviewProblemMetadata): Promise<ReviewRecord> {
        if (!problemId) {
            throw new Error("Cannot update a review record without a problem id.");
        }
        if (!isConfidenceRating(rating)) {
            throw new Error(`Invalid confidence rating: ${rating}`);
        }

        const records: ReviewRecordMap = this.getRecordMap();
        const now: Date = new Date();
        const nowIso: string = now.toISOString();
        const existing: ReviewRecord | undefined = records[problemId];
        const resolvedMetadata: ReviewProblemMetadata = this.resolveMetadata(problemId, existing, metadata);
        const record: ReviewRecord = {
            problemId,
            problemTitle: resolvedMetadata.problemTitle,
            tags: resolvedMetadata.tags,
            lastRating: rating,
            nextReviewDate: calculateNextReviewDate(rating, now).toISOString(),
            reviewHistory: existing ? existing.reviewHistory.slice() : [],
            createdAt: existing ? existing.createdAt : nowIso,
            updatedAt: nowIso,
        };
        record.reviewHistory.push({
            reviewedAt: nowIso,
            rating,
        });

        records[problemId] = record;
        await this.getState().update(ReviewRecordsKey, records);
        this.reviewRecordChangedEmitter.fire();
        return record;
    }

    public async replaceAll(records: ReviewRecord[]): Promise<void> {
        const next: ReviewRecordMap = {};
        for (const record of records) {
            next[record.problemId] = record;
        }
        await this.getState().update(ReviewRecordsKey, next);
        this.reviewRecordChangedEmitter.fire();
    }

    private resolveMetadata(problemId: string, existing?: ReviewRecord, metadata?: ReviewProblemMetadata): ReviewProblemMetadata {
        return {
            problemTitle: metadata && metadata.problemTitle ? metadata.problemTitle : existing ? existing.problemTitle : `Problem ${problemId}`,
            tags: metadata && metadata.tags ? metadata.tags : existing ? existing.tags : [],
        };
    }

    private getRecordMap(): ReviewRecordMap {
        const raw: ReviewRecordMap | undefined = this.getState().get<ReviewRecordMap>(ReviewRecordsKey);
        if (!raw || typeof raw !== "object") {
            return {};
        }

        const sanitized: ReviewRecordMap = {};
        for (const problemId of Object.keys(raw)) {
            const record: ReviewRecord | undefined = this.sanitizeRecord(raw[problemId]);
            if (record) {
                sanitized[problemId] = record;
            }
        }
        return sanitized;
    }

    private sanitizeRecord(record: ReviewRecord | undefined): ReviewRecord | undefined {
        if (!record || !record.problemId || !isConfidenceRating(record.lastRating)) {
            leetCodeChannel.appendLine("[Review] Ignored invalid review record in globalState.");
            return undefined;
        }
        return {
            problemId: record.problemId,
            problemTitle: record.problemTitle || `Problem ${record.problemId}`,
            tags: Array.isArray(record.tags) ? record.tags : [],
            lastRating: record.lastRating,
            nextReviewDate: record.nextReviewDate || new Date().toISOString(),
            reviewHistory: Array.isArray(record.reviewHistory)
                ? record.reviewHistory.filter((entry) => entry && isConfidenceRating(entry.rating) && !!entry.reviewedAt)
                : [],
            createdAt: record.createdAt || new Date().toISOString(),
            updatedAt: record.updatedAt || new Date().toISOString(),
        };
    }

    private getState(): vscode.Memento {
        if (!this.state) {
            throw new Error("Review storage has not been initialized.");
        }
        return this.state;
    }

    private async migrateLegacyReviewRecords(): Promise<void> {
        const state: vscode.Memento = this.getState();
        if (state.get<boolean>(ReviewRecordsMigrationKey)) {
            return;
        }

        const legacyRecords: ReviewRecordMap | undefined = state.get<ReviewRecordMap>(LegacyReviewRecordsKey);
        const currentRecords: ReviewRecordMap | undefined = state.get<ReviewRecordMap>(ReviewRecordsKey);
        if (currentRecords === undefined && legacyRecords !== undefined) {
            await state.update(ReviewRecordsKey, legacyRecords);
        }

        await state.update(ReviewRecordsMigrationKey, true);
    }
}

export const reviewStorage: ReviewStorage = new ReviewStorage();

export function configureReviewRecordSync(context: vscode.ExtensionContext): void {
    context.globalState.setKeysForSync(ReviewRecordSyncKeys);
}

/**
 * Compatibility helper for callers that want the requested `void` API shape.
 * Prefer `reviewStorage.updateReviewRecord` when the caller needs the updated record.
 */
export function updateReviewRecord(problemId: string, rating: string): void {
    reviewStorage.updateReviewRecord(problemId, rating).then(undefined, (error: Error) => {
        leetCodeChannel.appendLine(`[Review] Failed to update review record: ${error.message}`);
    });
}
