// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { formatLocalDateKey, getRecentLocalDateKeys } from "./dateUtils";
import { getDueReviewRecordCount, getDueReviewRecords } from "./due";
import { getReviewDailyGoal } from "./settings";
import { ConfidenceRating, confidenceRatings, ReviewDailyCount, ReviewInsight, ReviewRatingCount, ReviewRecord, ReviewStats } from "./types";

const RecentStatsDays: number = 30;
const RecentPaceDays: number = 7;
const MillisecondsPerHour: number = 60 * 60 * 1000;
const HoursPerDay: number = 24;

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
    const dueCount: number = getDueReviewRecordCount(records, now);

    return {
        generatedAt: now.toISOString(),
        totalRecords: records.length,
        dueCount,
        heatmap: dailyTrend,
        insights: buildReviewInsights(records, dailyTrend, dueCount, now),
        ratingDistribution,
        dailyTrend,
    };
}

function buildReviewInsights(records: ReviewRecord[], dailyTrend: ReviewDailyCount[], dueCount: number, now: Date): ReviewInsight[] {
    if (records.length === 0) {
        return [
            {
                title: "Next action",
                value: "Start tracking",
                description: "Submit an accepted solution and add it to the review list to unlock review insights.",
                severity: "info",
            },
        ];
    }

    const dailyGoal: number = getReviewDailyGoal();
    const insights: ReviewInsight[] = [
        buildTodayLoadInsight(dueCount, dailyGoal),
        buildRecentPaceInsight(dailyTrend, dailyGoal),
    ];
    const overdueInsight: ReviewInsight | undefined = buildMostOverdueInsight(records, now);
    if (overdueInsight) {
        insights.push(overdueInsight);
    }
    const weakTagsInsight: ReviewInsight | undefined = buildWeakTagsInsight(records);
    if (weakTagsInsight) {
        insights.push(weakTagsInsight);
    }
    insights.push(buildNextActionInsight(dueCount, dailyGoal, !!overdueInsight, !!weakTagsInsight));
    return insights;
}

function buildTodayLoadInsight(dueCount: number, dailyGoal: number): ReviewInsight {
    const overGoal: boolean = dueCount > dailyGoal;
    return {
        title: "Today load",
        value: `${dueCount}/${dailyGoal}`,
        description: overGoal
            ? "Due reviews are above your daily goal. Clear the oldest items first."
            : "Due reviews are within your daily goal.",
        severity: overGoal ? "warning" : "success",
    };
}

function buildRecentPaceInsight(dailyTrend: ReviewDailyCount[], dailyGoal: number): ReviewInsight {
    const recentDays: ReviewDailyCount[] = dailyTrend.slice(-RecentPaceDays);
    const completed: number = recentDays.reduce((total: number, day: ReviewDailyCount) => total + day.count, 0);
    const target: number = dailyGoal * RecentPaceDays;
    return {
        title: "Recent pace",
        value: `${completed}/${target}`,
        description: completed >= target
            ? "The last 7 days are on pace with your daily goal."
            : "The last 7 days are behind your daily goal.",
        severity: completed >= target ? "success" : "warning",
    };
}

function buildMostOverdueInsight(records: ReviewRecord[], now: Date): ReviewInsight | undefined {
    const overdueRecords: ReviewRecord[] = getDueReviewRecords(records, now)
        .slice()
        .sort((left: ReviewRecord, right: ReviewRecord) => getReviewTime(left) - getReviewTime(right))
        .slice(0, 3);
    if (overdueRecords.length === 0) {
        return undefined;
    }
    return {
        title: "Most overdue",
        value: overdueRecords.map((record: ReviewRecord) => `[${record.problemId}]`).join(" "),
        description: overdueRecords.map((record: ReviewRecord) => {
            return `${record.problemTitle} (${formatDelayedTime(now.getTime() - getReviewTime(record))})`;
        }).join("; "),
        severity: "warning",
    };
}

function buildWeakTagsInsight(records: ReviewRecord[]): ReviewInsight | undefined {
    const tagCounts: { [tag: string]: number } = {};
    for (const record of records) {
        const weakReviewCount: number = record.reviewHistory.reduce((count: number, history) => {
            return count + (history.rating === "Again" || history.rating === "Hard" ? 1 : 0);
        }, 0);
        if (weakReviewCount === 0) {
            continue;
        }
        for (const tag of record.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + weakReviewCount;
        }
    }

    const weakTags: string[] = Object.keys(tagCounts)
        .sort((left: string, right: string) => tagCounts[right] - tagCounts[left] || left.localeCompare(right))
        .slice(0, 3);
    if (weakTags.length === 0) {
        return undefined;
    }
    return {
        title: "Weak tags",
        value: weakTags.join(", "),
        description: weakTags.map((tag: string) => `${tag}: ${tagCounts[tag]}`).join("; "),
        severity: "info",
    };
}

function buildNextActionInsight(dueCount: number, dailyGoal: number, hasOverdue: boolean, hasWeakTags: boolean): ReviewInsight {
    if (hasOverdue) {
        return {
            title: "Next action",
            value: "Review overdue",
            description: "Start with the most overdue problems before adding new practice.",
            severity: "warning",
        };
    }
    if (dueCount > 0) {
        return {
            title: "Next action",
            value: "Clear due queue",
            description: `Finish up to ${Math.min(dueCount, dailyGoal)} due review(s), then continue regular practice.`,
            severity: "info",
        };
    }
    if (hasWeakTags) {
        return {
            title: "Next action",
            value: "Target weak tags",
            description: "No reviews are due now. Pick one weak tag for focused practice.",
            severity: "info",
        };
    }
    return {
        title: "Next action",
        value: "Keep cadence",
        description: "No reviews are due now. Keep solving and add accepted submissions to the review list.",
        severity: "success",
    };
}

function getReviewTime(record: ReviewRecord): number {
    const scheduledDate: Date = new Date(record.nextReviewDate);
    return isNaN(scheduledDate.getTime()) ? Number.MAX_SAFE_INTEGER : scheduledDate.getTime();
}

function formatDelayedTime(milliseconds: number): string {
    const hours: number = Math.max(0, Math.floor(milliseconds / MillisecondsPerHour));
    if (hours >= HoursPerDay) {
        const days: number = Math.floor(hours / HoursPerDay);
        return `${days} day${days === 1 ? "" : "s"} overdue`;
    }
    return `${hours} hour${hours === 1 ? "" : "s"} overdue`;
}
