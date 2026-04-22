// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { ConfidenceRating, confidenceRatings } from "./types";

const reviewIntervalsInDays: { [key in ConfidenceRating]: number } = {
    Again: 1,
    Hard: 3,
    Good: 7,
    Easy: 14,
};

export function isConfidenceRating(value: string): value is ConfidenceRating {
    return confidenceRatings.indexOf(value as ConfidenceRating) >= 0;
}

/**
 * Calculates the next review time using the FRSR confidence interval rules.
 *
 * @example
 * calculateNextReviewDate("Good", new Date("2026-04-22T10:00:00"));
 * // Returns a Date around 2026-04-29T10:00:00 in the user's local timezone.
 */
export function calculateNextReviewDate(rating: string, lastReviewTime: Date): Date {
    if (!isConfidenceRating(rating)) {
        throw new Error(`Unsupported confidence rating: ${rating}`);
    }
    if (isNaN(lastReviewTime.getTime())) {
        throw new Error("Invalid last review time.");
    }

    const nextReviewDate: Date = new Date(lastReviewTime.getTime());
    nextReviewDate.setDate(nextReviewDate.getDate() + reviewIntervalsInDays[rating]);
    return nextReviewDate;
}
