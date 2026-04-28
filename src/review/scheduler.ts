// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { ConfidenceRating, confidenceRatings, ReviewHistoryEntry, ReviewRecord } from "./types";

export interface IReviewSchedulerOptions {
    desiredRetention: number;
    maximumIntervalDays: number;
}

export interface IReviewScheduleResult {
    nextReviewDate: Date;
    stability: number;
    difficulty: number;
    retrievability: number;
    scheduledDays: number;
    elapsedDays: number;
    reps: number;
    lapses: number;
    lastReviewDate: string;
}

const FSRSParameters: number[] = [
    0.4072,
    1.1829,
    3.1262,
    15.4722,
    7.2102,
    0.5316,
    1.0651,
    0.0234,
    1.616,
    0.1544,
    1.0824,
    1.9813,
    0.0953,
    0.2975,
    2.2042,
    0.2407,
    2.9466,
    0.5034,
    0.6567,
];
const Decay: number = -0.5;
const Factor: number = Math.pow(0.9, 1 / Decay) - 1;
const MinimumIntervalDays: number = 1;
const MillisecondsPerDay: number = 24 * 60 * 60 * 1000;

export function isConfidenceRating(value: string): value is ConfidenceRating {
    return confidenceRatings.indexOf(value as ConfidenceRating) >= 0;
}

export function scheduleReviewRecord(
    rating: ConfidenceRating,
    existing: ReviewRecord | undefined,
    now: Date,
    options: IReviewSchedulerOptions
): IReviewScheduleResult {
    if (isNaN(now.getTime())) {
        throw new Error("Invalid review time.");
    }
    const previous: IReviewScheduleResult | undefined = resolvePreviousState(existing, options);
    const elapsedDays: number = getElapsedDays(previous, existing, now);
    const retrievability: number = previous ? calculateRetrievability(elapsedDays, previous.stability) : 0;
    const nextMemoryState: { stability: number; difficulty: number } = previous
        ? nextMemoryStateAfterReview(rating, previous.stability, previous.difficulty, retrievability)
        : initialMemoryState(rating);
    const scheduledDays: number = calculateInterval(nextMemoryState.stability, options);
    const nextReviewDate: Date = new Date(now.getTime());
    nextReviewDate.setDate(nextReviewDate.getDate() + scheduledDays);
    return {
        nextReviewDate,
        stability: nextMemoryState.stability,
        difficulty: nextMemoryState.difficulty,
        retrievability,
        scheduledDays,
        elapsedDays,
        reps: (previous ? previous.reps : existing ? existing.reviewHistory.length : 0) + 1,
        lapses: (previous ? previous.lapses : getLegacyLapseCount(existing)) + (rating === "Again" ? 1 : 0),
        lastReviewDate: now.toISOString(),
    };
}

export function rebuildReviewScheduleFromHistory(
    history: ReviewHistoryEntry[],
    options: IReviewSchedulerOptions,
    createdAt?: string
): IReviewScheduleResult | undefined {
    const sortedHistory: ReviewHistoryEntry[] = history
        .filter((entry: ReviewHistoryEntry) => entry && isConfidenceRating(entry.rating) && !!entry.reviewedAt)
        .slice()
        .sort((left: ReviewHistoryEntry, right: ReviewHistoryEntry) => {
            return new Date(left.reviewedAt).getTime() - new Date(right.reviewedAt).getTime();
        });
    let state: IReviewScheduleResult | undefined;
    let seedRecord: ReviewRecord | undefined;
    for (const entry of sortedHistory) {
        const reviewedAt: Date = new Date(entry.reviewedAt);
        if (isNaN(reviewedAt.getTime())) {
            continue;
        }
        state = scheduleReviewRecord(entry.rating, seedRecord, reviewedAt, options);
        seedRecord = buildSeedRecord(entry, state, createdAt);
    }
    return state;
}

function resolvePreviousState(existing: ReviewRecord | undefined, options: IReviewSchedulerOptions): IReviewScheduleResult | undefined {
    if (!existing) {
        return undefined;
    }
    if (hasFsrsState(existing)) {
        return {
            nextReviewDate: new Date(existing.nextReviewDate),
            stability: existing.stability,
            difficulty: existing.difficulty,
            retrievability: existing.retrievability,
            scheduledDays: existing.scheduledDays,
            elapsedDays: existing.elapsedDays,
            reps: existing.reps,
            lapses: existing.lapses,
            lastReviewDate: existing.lastReviewDate,
        };
    }
    return rebuildReviewScheduleFromHistory(existing.reviewHistory || [], options, existing.createdAt);
}

function hasFsrsState(record: ReviewRecord): boolean {
    return isPositiveFiniteNumber(record.stability)
        && isFiniteNumber(record.difficulty)
        && isFiniteNumber(record.scheduledDays)
        && isFiniteNumber(record.reps)
        && !!record.lastReviewDate;
}

function initialMemoryState(rating: ConfidenceRating): { stability: number; difficulty: number } {
    const grade: number = getGrade(rating);
    return {
        stability: clamp(FSRSParameters[grade - 1], 0.1, Number.MAX_SAFE_INTEGER),
        difficulty: clamp(FSRSParameters[4] - Math.exp(FSRSParameters[5] * (grade - 1)) + 1, 1, 10),
    };
}

function nextMemoryStateAfterReview(
    rating: ConfidenceRating,
    stability: number,
    difficulty: number,
    retrievability: number
): { stability: number; difficulty: number } {
    const nextDifficulty: number = calculateNextDifficulty(difficulty, rating);
    if (rating === "Again") {
        return {
            stability: calculateForgetStability(difficulty, stability, retrievability),
            difficulty: nextDifficulty,
        };
    }
    return {
        stability: calculateRecallStability(difficulty, stability, retrievability, rating),
        difficulty: nextDifficulty,
    };
}

function calculateNextDifficulty(difficulty: number, rating: ConfidenceRating): number {
    const grade: number = getGrade(rating);
    const nextDifficulty: number = clamp(difficulty - FSRSParameters[6] * (grade - 3), 1, 10);
    return clamp(FSRSParameters[7] * initialMemoryState("Easy").difficulty + (1 - FSRSParameters[7]) * nextDifficulty, 1, 10);
}

function calculateRecallStability(
    difficulty: number,
    stability: number,
    retrievability: number,
    rating: ConfidenceRating
): number {
    const hardPenalty: number = rating === "Hard" ? FSRSParameters[15] : 1;
    const easyBonus: number = rating === "Easy" ? FSRSParameters[16] : 1;
    const growth: number = 1
        + Math.exp(FSRSParameters[8])
        * (11 - difficulty)
        * Math.pow(stability, -FSRSParameters[9])
        * (Math.exp((1 - retrievability) * FSRSParameters[10]) - 1)
        * hardPenalty
        * easyBonus;
    return Math.max(stability + 0.1, stability * growth);
}

function calculateForgetStability(difficulty: number, stability: number, retrievability: number): number {
    const nextStability: number = FSRSParameters[11]
        * Math.pow(difficulty, -FSRSParameters[12])
        * (Math.pow(stability + 1, FSRSParameters[13]) - 1)
        * Math.exp((1 - retrievability) * FSRSParameters[14]);
    return clamp(nextStability, 0.1, stability);
}

function calculateInterval(stability: number, options: IReviewSchedulerOptions): number {
    const desiredRetention: number = clamp(options.desiredRetention, 0.7, 0.97);
    const rawInterval: number = stability / Factor * (Math.pow(desiredRetention, 1 / Decay) - 1);
    return Math.min(options.maximumIntervalDays, Math.max(MinimumIntervalDays, Math.round(rawInterval)));
}

function calculateRetrievability(elapsedDays: number, stability: number): number {
    if (!isPositiveFiniteNumber(stability)) {
        return 0;
    }
    return clamp(Math.pow(1 + Factor * elapsedDays / stability, Decay), 0, 1);
}

function getElapsedDays(previous: IReviewScheduleResult | undefined, existing: ReviewRecord | undefined, now: Date): number {
    const lastReviewDate: string | undefined = previous ? previous.lastReviewDate : existing ? existing.lastReviewDate : undefined;
    if (!lastReviewDate) {
        return 0;
    }
    const previousDate: Date = new Date(lastReviewDate);
    if (isNaN(previousDate.getTime())) {
        return 0;
    }
    return Math.max(0, Math.floor((now.getTime() - previousDate.getTime()) / MillisecondsPerDay));
}

function getLegacyLapseCount(existing: ReviewRecord | undefined): number {
    if (!existing || !Array.isArray(existing.reviewHistory)) {
        return 0;
    }
    return existing.reviewHistory.reduce((count: number, entry: ReviewHistoryEntry) => count + (entry.rating === "Again" ? 1 : 0), 0);
}

function buildSeedRecord(entry: ReviewHistoryEntry, state: IReviewScheduleResult, createdAt?: string): ReviewRecord {
    return {
        problemId: "",
        problemTitle: "",
        tags: [],
        lastRating: entry.rating,
        nextReviewDate: state.nextReviewDate.toISOString(),
        reviewHistory: [entry],
        stability: state.stability,
        difficulty: state.difficulty,
        retrievability: state.retrievability,
        scheduledDays: state.scheduledDays,
        elapsedDays: state.elapsedDays,
        reps: state.reps,
        lapses: state.lapses,
        lastReviewDate: state.lastReviewDate,
        createdAt: createdAt || entry.reviewedAt,
        updatedAt: entry.reviewedAt,
    };
}

function getGrade(rating: ConfidenceRating): number {
    return confidenceRatings.indexOf(rating) + 1;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: number): boolean {
    return typeof value === "number" && isFinite(value);
}

function isPositiveFiniteNumber(value: number): boolean {
    return isFiniteNumber(value) && value > 0;
}
