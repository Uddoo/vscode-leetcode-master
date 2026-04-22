// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

export function formatLocalDateKey(date: Date): string {
    const year: number = date.getFullYear();
    const month: string = padTwoDigits(date.getMonth() + 1);
    const day: string = padTwoDigits(date.getDate());
    return `${year}-${month}-${day}`;
}

export function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getRecentLocalDateKeys(days: number, now: Date = new Date()): string[] {
    const result: string[] = [];
    const cursor: Date = startOfLocalDay(now);
    cursor.setDate(cursor.getDate() - Math.max(days - 1, 0));
    for (let index: number = 0; index < days; index++) {
        result.push(formatLocalDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return result;
}

export function isDue(isoDate: string, now: Date = new Date()): boolean {
    const date: Date = new Date(isoDate);
    return !isNaN(date.getTime()) && date.getTime() <= now.getTime();
}

function padTwoDigits(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
}
