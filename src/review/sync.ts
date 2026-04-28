// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as crypto from "crypto";
import * as path from "path";
import * as fse from "fs-extra";
import * as vscode from "vscode";
import { leetCodeChannel } from "../leetCodeChannel";
import { ConfidenceRating, ReviewHistoryEntry, ReviewRecord } from "./types";

export type ReviewRecordMap = { [problemId: string]: ReviewRecord };

interface ICardShard {
    version: number;
    updatedAt: string;
    records: ReviewRecordMap;
}

interface IReviewSyncEvent {
    eventId: string;
    deviceId: string;
    problemId: string;
    rating: ConfidenceRating;
    reviewedAt: string;
    beforeFsrs?: Partial<ReviewRecord>;
    afterFsrs: Partial<ReviewRecord>;
}

const SyncManifestVersion: number = 1;
const SyncDeviceIdKey: string = "leetcodeMaster.review.sync.deviceId";
const CardShardCount: number = 256;
const CardsDirectoryName: string = "cards";
const LogsDirectoryName: string = "logs";
const ManifestFileName: string = "manifest.json";

class ReviewSync {
    private context: vscode.ExtensionContext | undefined;

    public async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
        if (!this.isLocalFolderEnabled()) {
            return;
        }
        await fse.ensureDir(this.getCardsRoot());
        await fse.ensureDir(this.getLogsRoot());
        await this.writeManifest();
    }

    public async syncRecords(records: ReviewRecordMap): Promise<ReviewRecordMap | undefined> {
        if (!this.isLocalFolderEnabled()) {
            return undefined;
        }
        try {
            const remoteRecords: ReviewRecordMap = await this.readAllCardRecords();
            const mergedRecords: ReviewRecordMap = mergeRecordMaps(records, remoteRecords);
            await this.writeAllCardRecords(mergedRecords);
            await this.writeManifest();
            return mergedRecords;
        } catch (error) {
            leetCodeChannel.appendLine(`[Review Sync] Failed to synchronize review records: ${toErrorMessage(error)}`);
            return undefined;
        }
    }

    public async recordReviewEvent(record: ReviewRecord, historyEntry: ReviewHistoryEntry, previousRecord?: ReviewRecord): Promise<void> {
        if (!this.isLocalFolderEnabled()) {
            return;
        }
        try {
            await this.writeCardRecord(record);
            await this.appendLogEvent({
                eventId: this.createEventId(record.problemId, historyEntry.reviewedAt),
                deviceId: await this.getDeviceId(),
                problemId: record.problemId,
                rating: historyEntry.rating,
                reviewedAt: historyEntry.reviewedAt,
                beforeFsrs: previousRecord ? toFsrsSnapshot(previousRecord) : undefined,
                afterFsrs: toFsrsSnapshot(record),
            });
            await this.writeManifest();
        } catch (error) {
            leetCodeChannel.appendLine(`[Review Sync] Failed to write review sync event: ${toErrorMessage(error)}`);
        }
    }

    private isLocalFolderEnabled(): boolean {
        return this.getBackend() === "localFolder" && !!this.getFolder();
    }

    private getBackend(): string {
        return vscode.workspace.getConfiguration("leetcodeMaster.review.sync").get<string>("backend", "off");
    }

    private getFolder(): string {
        return vscode.workspace.getConfiguration("leetcodeMaster.review.sync").get<string>("folder", "");
    }

    private getSyncRoot(): string {
        const folder: string = this.getFolder();
        if (!folder) {
            throw new Error("Review sync folder is not configured.");
        }
        return folder;
    }

    private getCardsRoot(): string {
        return path.join(this.getSyncRoot(), CardsDirectoryName);
    }

    private getLogsRoot(): string {
        return path.join(this.getSyncRoot(), LogsDirectoryName);
    }

    private async readAllCardRecords(): Promise<ReviewRecordMap> {
        const records: ReviewRecordMap = {};
        for (let index: number = 0; index < CardShardCount; index++) {
            const shardPath: string = this.getShardPath(index);
            if (!(await fse.pathExists(shardPath))) {
                continue;
            }
            const shard: ICardShard = await fse.readJson(shardPath);
            if (!shard || !shard.records || typeof shard.records !== "object") {
                continue;
            }
            for (const problemId of Object.keys(shard.records)) {
                records[problemId] = shard.records[problemId];
            }
        }
        return records;
    }

    private async writeAllCardRecords(records: ReviewRecordMap): Promise<void> {
        const shards: { [shard: number]: ReviewRecordMap } = {};
        for (const problemId of Object.keys(records)) {
            const shard: number = getProblemShard(problemId);
            shards[shard] = shards[shard] || {};
            shards[shard][problemId] = records[problemId];
        }
        for (const shardText of Object.keys(shards)) {
            await this.writeShard(Number(shardText), shards[Number(shardText)]);
        }
    }

    private async writeCardRecord(record: ReviewRecord): Promise<void> {
        const shard: number = getProblemShard(record.problemId);
        const shardPath: string = this.getShardPath(shard);
        let records: ReviewRecordMap = {};
        if (await fse.pathExists(shardPath)) {
            const currentShard: ICardShard = await fse.readJson(shardPath);
            records = currentShard && currentShard.records && typeof currentShard.records === "object" ? currentShard.records : {};
        }
        records[record.problemId] = mergeReviewRecord(records[record.problemId], record);
        await this.writeShard(shard, records);
    }

    private async writeShard(shard: number, records: ReviewRecordMap): Promise<void> {
        const shardPath: string = this.getShardPath(shard);
        const shardData: ICardShard = {
            version: SyncManifestVersion,
            updatedAt: new Date().toISOString(),
            records,
        };
        await writeJsonAtomic(shardPath, shardData);
    }

    private async appendLogEvent(event: IReviewSyncEvent): Promise<void> {
        const logPath: string = path.join(this.getLogsRoot(), `${event.reviewedAt.slice(0, 7)}.jsonl`);
        await fse.ensureDir(path.dirname(logPath));
        await fse.appendFile(logPath, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
    }

    private async writeManifest(): Promise<void> {
        await writeJsonAtomic(path.join(this.getSyncRoot(), ManifestFileName), {
            version: SyncManifestVersion,
            updatedAt: new Date().toISOString(),
            deviceId: await this.getDeviceId(),
        });
    }

    private getShardPath(shard: number): string {
        return path.join(this.getCardsRoot(), `${toShardName(shard)}.json`);
    }

    private async getDeviceId(): Promise<string> {
        if (!this.context) {
            throw new Error("Review sync has not been initialized.");
        }
        let deviceId: string | undefined = this.context.globalState.get<string>(SyncDeviceIdKey);
        if (!deviceId) {
            deviceId = crypto.randomBytes(12).toString("hex");
            await this.context.globalState.update(SyncDeviceIdKey, deviceId);
        }
        return deviceId;
    }

    private createEventId(problemId: string, reviewedAt: string): string {
        return `${reviewedAt}-${problemId}-${crypto.randomBytes(6).toString("hex")}`;
    }
}

export const reviewSync: ReviewSync = new ReviewSync();

export function mergeRecordMaps(left: ReviewRecordMap, right: ReviewRecordMap): ReviewRecordMap {
    const result: ReviewRecordMap = {};
    for (const problemId of Object.keys(left)) {
        result[problemId] = left[problemId];
    }
    for (const problemId of Object.keys(right)) {
        result[problemId] = mergeReviewRecord(result[problemId], right[problemId]);
    }
    return result;
}

function mergeReviewRecord(left: ReviewRecord | undefined, right: ReviewRecord): ReviewRecord {
    if (!left) {
        return right;
    }
    const primary: ReviewRecord = compareIsoDate(left.updatedAt, right.updatedAt) >= 0 ? left : right;
    const secondary: ReviewRecord = primary === left ? right : left;
    return {
        ...primary,
        reviewHistory: mergeReviewHistory(primary.reviewHistory, secondary.reviewHistory),
    };
}

function mergeReviewHistory(left: ReviewHistoryEntry[], right: ReviewHistoryEntry[]): ReviewHistoryEntry[] {
    const entries: { [key: string]: ReviewHistoryEntry } = {};
    for (const entry of left.concat(right)) {
        if (!entry || !entry.reviewedAt || !entry.rating) {
            continue;
        }
        entries[`${entry.reviewedAt}|${entry.rating}|${entry.scheduledDays || ""}`] = entry;
    }
    return Object.keys(entries)
        .map((key: string) => entries[key])
        .sort((a: ReviewHistoryEntry, b: ReviewHistoryEntry) => compareIsoDate(a.reviewedAt, b.reviewedAt));
}

function getProblemShard(problemId: string): number {
    const hash: Buffer = crypto.createHash("sha1").update(problemId).digest();
    return hash[0] % CardShardCount;
}

function toShardName(shard: number): string {
    const value: string = shard.toString(16);
    return value.length < 2 ? `0${value}` : value;
}

function compareIsoDate(left: string, right: string): number {
    return new Date(left || 0).getTime() - new Date(right || 0).getTime();
}

function toFsrsSnapshot(record: ReviewRecord): Partial<ReviewRecord> {
    return {
        nextReviewDate: record.nextReviewDate,
        stability: record.stability,
        difficulty: record.difficulty,
        retrievability: record.retrievability,
        scheduledDays: record.scheduledDays,
        elapsedDays: record.elapsedDays,
        reps: record.reps,
        lapses: record.lapses,
        lastReviewDate: record.lastReviewDate,
    };
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    await fse.ensureDir(path.dirname(filePath));
    const tempPath: string = `${filePath}.tmp`;
    await fse.writeJson(tempPath, data, { spaces: 2 });
    await fse.move(tempPath, filePath, { overwrite: true });
}

function toErrorMessage(error: Error): string {
    return error && error.message ? error.message : error.toString();
}
