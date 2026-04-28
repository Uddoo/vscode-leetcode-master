// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { formatLocalDateKey } from "./dateUtils";
import { ReviewRecord } from "./types";

export namespace ReviewSortStrategy {
    export const NextScheduledReviewAsc: string = "Sort By Next Scheduled Review (ASC)";
    export const NextScheduledReviewDesc: string = "Sort By Next Scheduled Review (DESC)";
    export const ReviewDelayedHoursAsc: string = "Sort By Review Delayed Hours (ASC)";
    export const ReviewDelayedHoursDesc: string = "Sort By Review Delayed Hours (DESC)";
}

const DefaultDailyGoal: number = 5;
const DefaultDesiredRetention: number = 0.9;
const DefaultMaximumIntervalDays: number = 36500;
const MillisecondsPerHour: number = 60 * 60 * 1000;
const SupportedSortStrategies: string[] = [
    ReviewSortStrategy.NextScheduledReviewAsc,
    ReviewSortStrategy.NextScheduledReviewDesc,
    ReviewSortStrategy.ReviewDelayedHoursAsc,
    ReviewSortStrategy.ReviewDelayedHoursDesc,
];

export function getReviewSortStrategy(): string {
    const configured: string | undefined = getReviewConfiguration().get<string>("sortStrategy");
    if (configured && SupportedSortStrategies.indexOf(configured) >= 0) {
        return configured;
    }
    return ReviewSortStrategy.NextScheduledReviewAsc;
}

export function getReviewDailyGoal(): number {
    const configured: number | undefined = getReviewConfiguration().get<number>("dailyGoal");
    if (typeof configured === "number" && isFinite(configured) && configured >= 1) {
        return Math.floor(configured);
    }
    return DefaultDailyGoal;
}

export function getReviewDesiredRetention(): number {
    const configured: number | undefined = getReviewConfiguration().get<number>("desiredRetention");
    if (typeof configured === "number" && isFinite(configured) && configured >= 0.7 && configured <= 0.97) {
        return configured;
    }
    return DefaultDesiredRetention;
}

export function getReviewMaximumIntervalDays(): number {
    const configured: number | undefined = getReviewConfiguration().get<number>("maximumIntervalDays");
    if (typeof configured === "number" && isFinite(configured) && configured >= 1) {
        return Math.floor(configured);
    }
    return DefaultMaximumIntervalDays;
}

export function sortReviewRecords(records: ReviewRecord[], now: Date = new Date(), strategy: string = getReviewSortStrategy()): ReviewRecord[] {
    return records.slice().sort((left: ReviewRecord, right: ReviewRecord): number => {
        let result: number;
        switch (strategy) {
            case ReviewSortStrategy.NextScheduledReviewDesc:
                result = compareNumbers(getReviewTime(right), getReviewTime(left));
                break;
            case ReviewSortStrategy.ReviewDelayedHoursAsc:
                result = compareNumbers(getReviewDelayedHours(left, now), getReviewDelayedHours(right, now));
                break;
            case ReviewSortStrategy.ReviewDelayedHoursDesc:
                result = compareNumbers(getReviewDelayedHours(right, now), getReviewDelayedHours(left, now));
                break;
            case ReviewSortStrategy.NextScheduledReviewAsc:
            default:
                result = compareNumbers(getReviewTime(left), getReviewTime(right));
                break;
        }
        return result || compareProblemIds(left.problemId, right.problemId);
    });
}

export function getTodayCompletedReviewCount(records: ReviewRecord[], now: Date = new Date()): number {
    const todayKey: string = formatLocalDateKey(now);
    let completed: number = 0;
    for (const record of records) {
        for (const history of record.reviewHistory) {
            const reviewedAt: Date = new Date(history.reviewedAt);
            if (!isNaN(reviewedAt.getTime()) && formatLocalDateKey(reviewedAt) === todayKey) {
                completed++;
            }
        }
    }
    return completed;
}

function getReviewConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("leetcodeMaster.review");
}

function getReviewDelayedHours(record: ReviewRecord, now: Date): number {
    const scheduledTime: number = getReviewTime(record);
    if (scheduledTime === Number.MAX_SAFE_INTEGER) {
        return 0;
    }
    return Math.max(0, (now.getTime() - scheduledTime) / MillisecondsPerHour);
}

function getReviewTime(record: ReviewRecord): number {
    const scheduledDate: Date = new Date(record.nextReviewDate);
    return isNaN(scheduledDate.getTime()) ? Number.MAX_SAFE_INTEGER : scheduledDate.getTime();
}

function compareNumbers(left: number, right: number): number {
    return left - right;
}

function compareProblemIds(left: string, right: string): number {
    const leftNumber: number = Number(left);
    const rightNumber: number = Number(right);
    if (!isNaN(leftNumber) && !isNaN(rightNumber) && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
}
