// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

// tslint:disable:interface-name

export type ConfidenceRating = "Again" | "Hard" | "Good" | "Easy";

export const confidenceRatings: ConfidenceRating[] = ["Again", "Hard", "Good", "Easy"];

export interface ReviewHistoryEntry {
    reviewedAt: string;
    rating: ConfidenceRating;
}

export interface ReviewRecord {
    problemId: string;
    problemTitle: string;
    tags: string[];
    lastRating: ConfidenceRating;
    nextReviewDate: string;
    reviewHistory: ReviewHistoryEntry[];
    createdAt: string;
    updatedAt: string;
}

export interface ReviewProblemMetadata {
    problemTitle: string;
    tags: string[];
}

export interface ReviewDailyCount {
    date: string;
    count: number;
}

export interface ReviewRatingCount {
    rating: ConfidenceRating;
    count: number;
}

export type ReviewInsightSeverity = "info" | "warning" | "success";

export interface ReviewInsight {
    title: string;
    value: string;
    description: string;
    severity: ReviewInsightSeverity;
}

export interface ReviewStats {
    generatedAt: string;
    totalRecords: number;
    dueCount: number;
    heatmap: ReviewDailyCount[];
    insights: ReviewInsight[];
    ratingDistribution: ReviewRatingCount[];
    dailyTrend: ReviewDailyCount[];
}
