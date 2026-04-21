import { ConfidenceRating } from "./types";

function startOfLocalDay(input: Date): Date {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

export function calculateNextReviewDate(rating: ConfidenceRating, lastReviewTime: Date): Date {
    const baseDate: Date = startOfLocalDay(lastReviewTime);
    const dayOffset: Record<ConfidenceRating, number> = {
        Again: 1,
        Hard: 3,
        Good: 7,
        Easy: 14,
    };

    const nextDate: Date = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + dayOffset[rating]);
    return nextDate;
}
