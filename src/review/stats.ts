// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { formatLocalDateKey, getRecentLocalDateKeys } from "./dateUtils";
import { getDueReviewRecordCount } from "./due";
import { ConfidenceRating, confidenceRatings, ReviewDailyCount, ReviewRatingCount, ReviewRecord, ReviewStats } from "./types";

const RecentStatsDays: number = 30;

export function buildReviewStats(records: ReviewRecord[], now: Date = new Date()): ReviewStats {
    const dateKeys: string[] = getRecentLocalDateKeys(RecentStatsDays, now);
    const dailyCounts: { [date: string]: number } = {};
    const ratingCounts: { [rating: string]: number } = {};
    for (const dateKey of dateKeys) {
        dailyCounts[dateKey] = 0;
    }
    for (const rating of confidenceRatings) {
        ratingCounts[rating] = 0;
    }

    for (const record of records) {
        for (const history of record.reviewHistory) {
            const reviewedAt: Date = new Date(history.reviewedAt);
            if (isNaN(reviewedAt.getTime())) {
                continue;
            }
            if (ratingCounts[history.rating] !== undefined) {
                ratingCounts[history.rating]++;
            }
            const dateKey: string = formatLocalDateKey(reviewedAt);
            if (dailyCounts[dateKey] !== undefined) {
                dailyCounts[dateKey]++;
            }
        }
    }

    const dailyTrend: ReviewDailyCount[] = dateKeys.map((date: string) => ({ date, count: dailyCounts[date] || 0 }));
    const ratingDistribution: ReviewRatingCount[] = confidenceRatings.map((rating: ConfidenceRating) => ({
        rating,
        count: ratingCounts[rating] || 0,
    }));

    return {
        generatedAt: now.toISOString(),
        totalRecords: records.length,
        dueCount: getDueReviewRecordCount(records, now),
        heatmap: dailyTrend,
        ratingDistribution,
        dailyTrend,
    };
}
