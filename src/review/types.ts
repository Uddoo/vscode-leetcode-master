export const confidenceRatings = ["Again", "Hard", "Good", "Easy"] as const;

export type ConfidenceRating = typeof confidenceRatings[number];

export interface ReviewHistoryItem {
    rating: ConfidenceRating;
    reviewedAt: string;
}

export interface ReviewRecord {
    problemId: string;
    title: string;
    tags: string[];
    lastRating: ConfidenceRating;
    lastReviewedAt: string;
    nextReviewDate: string;
    history: ReviewHistoryItem[];
}

export interface ReviewRecordInput {
    title?: string;
    tags?: string[];
}

export interface ReviewHeatmapCell {
    date: string;
    count: number;
}

export interface ReviewStats {
    totalRecords: number;
    dueToday: number;
    overdue: number;
    ratingDistribution: Record<ConfidenceRating, number>;
    dailyTrend: Array<{ date: string; count: number }>;
    heatmap: ReviewHeatmapCell[];
}
