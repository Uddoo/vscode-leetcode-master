// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { isDue } from "./dateUtils";
import { ReviewRecord } from "./types";

export function isReviewRecordDue(record: ReviewRecord, now: Date = new Date()): boolean {
    return isDue(record.nextReviewDate, now);
}

export function getDueReviewRecords(records: ReviewRecord[], now: Date = new Date()): ReviewRecord[] {
    return records.filter((record: ReviewRecord) => isReviewRecordDue(record, now));
}

export function getDueReviewRecordCount(records: ReviewRecord[], now: Date = new Date()): number {
    return records.reduce((count: number, record: ReviewRecord) => count + (isReviewRecordDue(record, now) ? 1 : 0), 0);
}
