// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeChannel } from "../leetCodeChannel";
import { isConfidenceRating, rebuildReviewScheduleFromHistory, scheduleReviewRecord, IReviewScheduleResult } from "./scheduler";
import { getReviewDesiredRetention, getReviewMaximumIntervalDays } from "./settings";
import { reviewSync, ReviewRecordMap } from "./sync";
import { ReviewHistoryEntry, ReviewProblemMetadata, ReviewRecord } from "./types";

export const ReviewRecordsKey: string = "leetcodeMaster.reviewRecords.v1";
const LegacyReviewRecordsKey: string = "leetcode-review-records-v1";
const ReviewRecordsMigrationKey: string = "leetcodeMaster.reviewRecordsMigrated.v1";
export const ReviewRecordSyncKeys: string[] = [ReviewRecordsKey];

class ReviewStorage {
    private readonly reviewRecordChangedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    private state: vscode.Memento | undefined;
    public readonly onDidChangeReviewRecords: vscode.Event<void> = this.reviewRecordChangedEmitter.event;

    public async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.state = context.globalState;
        await this.migrateLegacyReviewRecords();
        await reviewSync.initialize(context);
        await this.syncNow();
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
        const schedule: IReviewScheduleResult = scheduleReviewRecord(rating, existing, now, this.getSchedulerOptions());
        const record: ReviewRecord = {
            problemId,
            problemTitle: resolvedMetadata.problemTitle,
            tags: resolvedMetadata.tags,
            lastRating: rating,
            nextReviewDate: schedule.nextReviewDate.toISOString(),
            reviewHistory: existing ? existing.reviewHistory.slice() : [],
            stability: schedule.stability,
            difficulty: schedule.difficulty,
            retrievability: schedule.retrievability,
            scheduledDays: schedule.scheduledDays,
            elapsedDays: schedule.elapsedDays,
            reps: schedule.reps,
            lapses: schedule.lapses,
            lastReviewDate: schedule.lastReviewDate,
            createdAt: existing ? existing.createdAt : nowIso,
            updatedAt: nowIso,
        };
        const historyEntry: ReviewHistoryEntry = {
            reviewedAt: nowIso,
            rating,
            scheduledDays: schedule.scheduledDays,
            elapsedDays: schedule.elapsedDays,
            stability: schedule.stability,
            difficulty: schedule.difficulty,
        };
        record.reviewHistory.push(historyEntry);

        records[problemId] = record;
        await this.getState().update(ReviewRecordsKey, records);
        await reviewSync.recordReviewEvent(record, historyEntry, existing);
        this.reviewRecordChangedEmitter.fire();
        return record;
    }

    public async syncNow(): Promise<void> {
        const mergedRecords: ReviewRecordMap | undefined = await reviewSync.syncRecords(this.getRecordMap());
        if (!mergedRecords) {
            return;
        }
        await this.getState().update(ReviewRecordsKey, mergedRecords);
        this.reviewRecordChangedEmitter.fire();
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
        const reviewHistory: ReviewHistoryEntry[] = Array.isArray(record.reviewHistory)
            ? record.reviewHistory.filter((entry) => entry && isConfidenceRating(entry.rating) && !!entry.reviewedAt)
            : [];
        const schedule: IReviewScheduleResult | undefined = this.resolveSchedule(record, reviewHistory);
        const nowIso: string = new Date().toISOString();
        return {
            problemId: record.problemId,
            problemTitle: record.problemTitle || `Problem ${record.problemId}`,
            tags: Array.isArray(record.tags) ? record.tags : [],
            lastRating: record.lastRating,
            nextReviewDate: record.nextReviewDate || (schedule ? schedule.nextReviewDate.toISOString() : nowIso),
            reviewHistory,
            stability: this.resolveNumber(record.stability, schedule ? schedule.stability : 0.1),
            difficulty: this.resolveNumber(record.difficulty, schedule ? schedule.difficulty : 5),
            retrievability: this.resolveNumber(record.retrievability, schedule ? schedule.retrievability : 0),
            scheduledDays: this.resolveNumber(record.scheduledDays, schedule ? schedule.scheduledDays : 1),
            elapsedDays: this.resolveNumber(record.elapsedDays, schedule ? schedule.elapsedDays : 0),
            reps: this.resolveNumber(record.reps, schedule ? schedule.reps : reviewHistory.length),
            lapses: this.resolveNumber(record.lapses, schedule ? schedule.lapses : this.getLapseCount(reviewHistory)),
            lastReviewDate: record.lastReviewDate || (schedule ? schedule.lastReviewDate : reviewHistory.length ? reviewHistory[reviewHistory.length - 1].reviewedAt : nowIso),
            createdAt: record.createdAt || nowIso,
            updatedAt: record.updatedAt || nowIso,
        };
    }

    private resolveSchedule(record: ReviewRecord, reviewHistory: ReviewHistoryEntry[]): IReviewScheduleResult | undefined {
        return rebuildReviewScheduleFromHistory(reviewHistory, this.getSchedulerOptions(), record.createdAt);
    }

    private getSchedulerOptions(): { desiredRetention: number; maximumIntervalDays: number } {
        return {
            desiredRetention: getReviewDesiredRetention(),
            maximumIntervalDays: getReviewMaximumIntervalDays(),
        };
    }

    private resolveNumber(value: number, fallback: number): number {
        return typeof value === "number" && isFinite(value) ? value : fallback;
    }

    private getLapseCount(reviewHistory: ReviewHistoryEntry[]): number {
        return reviewHistory.reduce((count: number, entry: ReviewHistoryEntry) => count + (entry.rating === "Again" ? 1 : 0), 0);
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
    const syncBackend: string = vscode.workspace.getConfiguration("leetcodeMaster.review.sync").get<string>("backend", "off");
    context.globalState.setKeysForSync(syncBackend === "localFolder" ? [] : ReviewRecordSyncKeys);
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
