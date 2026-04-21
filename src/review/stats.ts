import { ConfidenceRating, ReviewRecord, ReviewStats } from "./types";

function getLocalDateISO(input: Date): string {
    const year: number = input.getFullYear();
    const monthValue: number = input.getMonth() + 1;
    const dateValue: number = input.getDate();
    const month: string = monthValue < 10 ? `0${monthValue}` : `${monthValue}`;
    const date: string = dateValue < 10 ? `0${dateValue}` : `${dateValue}`;
    return `${year}-${month}-${date}`;
}

function parseISODate(dateText: string): Date {
    const parsed: Date = new Date(dateText);
    if (Number.isNaN(parsed.getTime())) {
        return new Date(0);
    }
    return parsed;
}

function createRatingDistribution(): Record<ConfidenceRating, number> {
    return {
        Again: 0,
        Hard: 0,
        Good: 0,
        Easy: 0,
    };
}

export function buildReviewStats(records: ReviewRecord[]): ReviewStats {
    const now: Date = new Date();
    const today: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayIso: string = getLocalDateISO(today);
    const ratingDistribution: Record<ConfidenceRating, number> = createRatingDistribution();

    let dueToday: number = 0;
    let overdue: number = 0;

    for (const record of records) {
        ratingDistribution[record.lastRating] += 1;
        const nextDate: Date = parseISODate(record.nextReviewDate);
        const nextDayIso: string = getLocalDateISO(new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()));
        if (nextDayIso === todayIso) {
            dueToday += 1;
        } else if (nextDayIso < todayIso) {
            overdue += 1;
        }
    }

    const trendMap: Map<string, number> = new Map<string, number>();
    const heatMap: Map<string, number> = new Map<string, number>();

    for (let i: number = 29; i >= 0; i -= 1) {
        const day: Date = new Date(today);
        day.setDate(day.getDate() - i);
        const key: string = getLocalDateISO(day);
        trendMap.set(key, 0);
        heatMap.set(key, 0);
    }

    for (const record of records) {
        for (const history of record.history) {
            const day: Date = parseISODate(history.reviewedAt);
            const key: string = getLocalDateISO(day);
            if (trendMap.has(key)) {
                trendMap.set(key, (trendMap.get(key) || 0) + 1);
                heatMap.set(key, (heatMap.get(key) || 0) + 1);
            }
        }
    }

    const dailyTrend: Array<{ date: string; count: number }> = Array.from(trendMap.entries()).map(([date, count]) => ({ date, count }));
    const heatmap: Array<{ date: string; count: number }> = Array.from(heatMap.entries()).map(([date, count]) => ({ date, count }));

    return {
        totalRecords: records.length,
        dueToday,
        overdue,
        ratingDistribution,
        dailyTrend,
        heatmap,
    };
}
