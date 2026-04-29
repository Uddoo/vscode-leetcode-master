// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.
// tslint:disable:max-classes-per-file

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import * as crypto from "crypto";
import * as path from "path";
import * as fse from "fs-extra";
import * as vscode from "vscode";
import { leetCodeChannel } from "../leetCodeChannel";
import { ConfidenceRating, ReviewHistoryEntry, ReviewRecord } from "./types";

export type ReviewRecordMap = { [problemId: string]: ReviewRecord };
type ReviewSyncBackendKind = "off" | "localFolder" | "webdav";

interface ICardShard {
    version: number;
    updatedAt: string;
    records: ReviewRecordMap;
}

interface ISyncManifest {
    cardShards?: string[];
    deviceId: string;
    updatedAt: string;
    version: number;
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

interface IReviewSyncBackend {
    initialize(): Promise<void>;
    syncRecords(records: ReviewRecordMap): Promise<ReviewRecordMap>;
    recordReviewEvent(record: ReviewRecord, historyEntry: ReviewHistoryEntry, previousRecord?: ReviewRecord): Promise<void>;
}

export interface IWebDavSyncOptions {
    password?: string;
    rootPath: string;
    url: string;
    username: string;
}

const SyncManifestVersion: number = 1;
const SyncDeviceIdKey: string = "leetcodeMaster.review.sync.deviceId";
export const WebDavPasswordSecretKey: string = "leetcodeMaster.review.sync.webdav.password";
const CardShardCount: number = 256;
const CardsDirectoryName: string = "cards";
const LogsDirectoryName: string = "logs";
const ManifestFileName: string = "manifest.json";

class ReviewSync {
    private context: vscode.ExtensionContext | undefined;
    private lastError: string | undefined;

    public async initialize(context: vscode.ExtensionContext): Promise<boolean> {
        this.context = context;
        const backend: IReviewSyncBackend | undefined = await this.createConfiguredBackend();
        if (!backend) {
            this.lastError = undefined;
            return true;
        }
        try {
            await backend.initialize();
            this.lastError = undefined;
            return true;
        } catch (error) {
            this.recordError("Failed to initialize review sync", error);
            return false;
        }
    }

    public async syncRecords(records: ReviewRecordMap): Promise<ReviewRecordMap | undefined> {
        const backend: IReviewSyncBackend | undefined = await this.createConfiguredBackend();
        if (!backend) {
            return undefined;
        }
        try {
            await backend.initialize();
            const mergedRecords: ReviewRecordMap = await backend.syncRecords(records);
            this.lastError = undefined;
            return mergedRecords;
        } catch (error) {
            this.recordError("Failed to synchronize review records", error);
            return undefined;
        }
    }

    public async recordReviewEvent(record: ReviewRecord, historyEntry: ReviewHistoryEntry, previousRecord?: ReviewRecord): Promise<void> {
        const backend: IReviewSyncBackend | undefined = await this.createConfiguredBackend();
        if (!backend) {
            return;
        }
        try {
            await backend.initialize();
            await backend.recordReviewEvent(record, historyEntry, previousRecord);
            this.lastError = undefined;
        } catch (error) {
            this.recordError("Failed to write review sync event", error);
        }
    }

    public async setWebDavPassword(password: string): Promise<void> {
        await this.getContext().secrets.store(WebDavPasswordSecretKey, password);
    }

    public async hasConfiguredExternalBackend(): Promise<boolean> {
        const backend: ReviewSyncBackendKind = getBackend();
        const localFolder: string = getLocalFolder();
        const webDavOptions: IWebDavSyncOptions | undefined = await this.getWebDavOptions();
        return isExternalSyncConfigured(backend, localFolder, webDavOptions);
    }

    public getLastError(): string | undefined {
        return this.lastError;
    }

    private async createConfiguredBackend(): Promise<IReviewSyncBackend | undefined> {
        const backend: ReviewSyncBackendKind = getBackend();
        if (backend === "localFolder") {
            const localFolder: string = getLocalFolder();
            if (!localFolder) {
                return undefined;
            }
            return new LocalFolderSyncBackend(this.getContext(), localFolder);
        }
        if (backend === "webdav") {
            const options: IWebDavSyncOptions | undefined = await this.getWebDavOptions();
            if (!isWebDavConfigured(options)) {
                return undefined;
            }
            return new WebDavSyncBackend(this.getContext(), options);
        }
        return undefined;
    }

    private async getWebDavOptions(): Promise<IWebDavSyncOptions | undefined> {
        const configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("leetcodeMaster.review.sync.webdav");
        const url: string = configuration.get<string>("url", "").trim();
        const username: string = configuration.get<string>("username", "").trim();
        const rootPath: string = configuration.get<string>("rootPath", "LeetCodeMaster").trim();
        const password: string | undefined = normalizeOptionalText(await this.getContext().secrets.get(WebDavPasswordSecretKey));
        return { password, rootPath, url, username };
    }

    private getContext(): vscode.ExtensionContext {
        if (!this.context) {
            throw new Error("Review sync has not been initialized.");
        }
        return this.context;
    }

    private recordError(action: string, error: Error): void {
        this.lastError = toErrorMessage(error);
        leetCodeChannel.appendLine(`[Review Sync] ${action}: ${this.lastError}`);
    }
}

class LocalFolderSyncBackend implements IReviewSyncBackend {
    constructor(private readonly context: vscode.ExtensionContext, private readonly syncRoot: string) { }

    public async initialize(): Promise<void> {
        await fse.ensureDir(this.getCardsRoot());
        await fse.ensureDir(this.getLogsRoot());
        await this.writeManifest(await this.getExistingShardNames());
    }

    public async syncRecords(records: ReviewRecordMap): Promise<ReviewRecordMap> {
        const remoteRecords: ReviewRecordMap = await this.readAllCardRecords();
        const mergedRecords: ReviewRecordMap = mergeRecordMaps(records, remoteRecords);
        const shardNames: string[] = await this.writeAllCardRecords(mergedRecords);
        await this.writeManifest(shardNames);
        return mergedRecords;
    }

    public async recordReviewEvent(record: ReviewRecord, historyEntry: ReviewHistoryEntry, previousRecord?: ReviewRecord): Promise<void> {
        const shardName: string = await this.writeCardRecord(record);
        await this.appendLogEvent(await createReviewSyncEvent(this.context, record, historyEntry, previousRecord));
        await this.writeManifest(await this.getExistingShardNames([shardName]));
    }

    private getCardsRoot(): string {
        return path.join(this.syncRoot, CardsDirectoryName);
    }

    private getLogsRoot(): string {
        return path.join(this.syncRoot, LogsDirectoryName);
    }

    private async readAllCardRecords(): Promise<ReviewRecordMap> {
        const records: ReviewRecordMap = {};
        for (let index: number = 0; index < CardShardCount; index++) {
            const shardPath: string = this.getShardPath(index);
            if (!(await fse.pathExists(shardPath))) {
                continue;
            }
            const shard: ICardShard = await fse.readJson(shardPath);
            mergeShardRecords(records, shard);
        }
        return records;
    }

    private async writeAllCardRecords(records: ReviewRecordMap): Promise<string[]> {
        const shards: { [shard: number]: ReviewRecordMap } = splitRecordsByShard(records);
        const shardNames: string[] = [];
        for (const shardText of Object.keys(shards)) {
            await this.writeShard(Number(shardText), shards[Number(shardText)]);
            shardNames.push(toShardName(Number(shardText)));
        }
        return shardNames.sort();
    }

    private async writeCardRecord(record: ReviewRecord): Promise<string> {
        const shard: number = getProblemShard(record.problemId);
        const shardPath: string = this.getShardPath(shard);
        let records: ReviewRecordMap = {};
        if (await fse.pathExists(shardPath)) {
            const currentShard: ICardShard = await fse.readJson(shardPath);
            records = currentShard && currentShard.records && typeof currentShard.records === "object" ? currentShard.records : {};
        }
        records[record.problemId] = mergeReviewRecord(records[record.problemId], record);
        await this.writeShard(shard, records);
        return toShardName(shard);
    }

    private async writeShard(shard: number, records: ReviewRecordMap): Promise<void> {
        await writeJsonAtomic(this.getShardPath(shard), createCardShard(records));
    }

    private async appendLogEvent(event: IReviewSyncEvent): Promise<void> {
        const logPath: string = path.join(this.getLogsRoot(), `${event.reviewedAt.slice(0, 7)}.jsonl`);
        await fse.ensureDir(path.dirname(logPath));
        await fse.appendFile(logPath, `${JSON.stringify(event)}\n`, { encoding: "utf8" });
    }

    private async writeManifest(cardShards: string[]): Promise<void> {
        await writeJsonAtomic(path.join(this.syncRoot, ManifestFileName), await createManifest(this.context, cardShards));
    }

    private getShardPath(shard: number): string {
        return path.join(this.getCardsRoot(), `${toShardName(shard)}.json`);
    }

    private async getExistingShardNames(extraShardNames: string[] = []): Promise<string[]> {
        const shardNames: string[] = extraShardNames.slice();
        if (await fse.pathExists(this.getCardsRoot())) {
            const fileNames: string[] = await fse.readdir(this.getCardsRoot());
            for (const fileName of fileNames) {
                if (/^[0-9a-f]{2}\.json$/i.test(fileName)) {
                    shardNames.push(fileName.slice(0, 2).toLowerCase());
                }
            }
        }
        return normalizeShardNames(shardNames);
    }
}

class WebDavSyncBackend implements IReviewSyncBackend {
    private readonly client: AxiosInstance;

    constructor(private readonly context: vscode.ExtensionContext, private readonly options: IWebDavSyncOptions) {
        this.client = axios.create({
            auth: {
                password: options.password || "",
                username: options.username,
            },
            timeout: 30000,
        });
    }

    public async initialize(): Promise<void> {
        await this.ensureCollection([CardsDirectoryName]);
        await this.ensureCollection([LogsDirectoryName]);
        await this.ensureManifest();
    }

    public async syncRecords(records: ReviewRecordMap): Promise<ReviewRecordMap> {
        const remoteManifest: ISyncManifest | undefined = await this.readManifest();
        const remoteRecords: ReviewRecordMap = await this.readCardRecordsByShardNames(getManifestCardShards(remoteManifest));
        const mergedRecords: ReviewRecordMap = mergeRecordMaps(records, remoteRecords);
        const shardNames: string[] = await this.writeAllCardRecords(mergedRecords);
        await this.writeManifest(shardNames);
        return mergedRecords;
    }

    public async recordReviewEvent(record: ReviewRecord, historyEntry: ReviewHistoryEntry, previousRecord?: ReviewRecord): Promise<void> {
        const shardName: string = await this.writeCardRecord(record);
        await this.appendLogEvent(await createReviewSyncEvent(this.context, record, historyEntry, previousRecord));
        await this.addManifestShard(shardName);
    }

    private async readCardRecordsByShardNames(shardNames: string[]): Promise<ReviewRecordMap> {
        const records: ReviewRecordMap = {};
        for (const shardName of normalizeShardNames(shardNames)) {
            const shard: ICardShard | undefined = await this.readJson<ICardShard>([CardsDirectoryName, `${shardName}.json`]);
            mergeShardRecords(records, shard);
        }
        return records;
    }

    private async writeAllCardRecords(records: ReviewRecordMap): Promise<string[]> {
        const shards: { [shard: number]: ReviewRecordMap } = splitRecordsByShard(records);
        const shardNames: string[] = [];
        for (const shardText of Object.keys(shards)) {
            await this.writeShard(Number(shardText), shards[Number(shardText)]);
            shardNames.push(toShardName(Number(shardText)));
        }
        return shardNames.sort();
    }

    private async writeCardRecord(record: ReviewRecord): Promise<string> {
        const shard: number = getProblemShard(record.problemId);
        const shardName: string = toShardName(shard);
        const currentManifest: ISyncManifest | undefined = await this.readManifest();
        const knownShardNames: string[] = getManifestCardShards(currentManifest);
        const currentShard: ICardShard | undefined = knownShardNames.indexOf(shardName) >= 0
            ? await this.readJson<ICardShard>([CardsDirectoryName, `${shardName}.json`])
            : undefined;
        const records: ReviewRecordMap = currentShard && currentShard.records && typeof currentShard.records === "object" ? currentShard.records : {};
        records[record.problemId] = mergeReviewRecord(records[record.problemId], record);
        await this.writeShard(shard, records);
        return shardName;
    }

    private async writeShard(shard: number, records: ReviewRecordMap): Promise<void> {
        await this.putJson([CardsDirectoryName, `${toShardName(shard)}.json`], createCardShard(records));
    }

    private async appendLogEvent(event: IReviewSyncEvent): Promise<void> {
        const logPath: string[] = [LogsDirectoryName, `${event.reviewedAt.slice(0, 7)}.jsonl`];
        const currentLog: string = await this.readText(logPath, [404, 503]);
        await this.putText(logPath, `${currentLog}${JSON.stringify(event)}\n`);
    }

    private async ensureManifest(): Promise<void> {
        const manifest: ISyncManifest | undefined = await this.readManifest();
        if (!manifest) {
            await this.writeManifest([]);
        }
    }

    private async readManifest(): Promise<ISyncManifest | undefined> {
        return this.readJson<ISyncManifest>([ManifestFileName], [404, 503]);
    }

    private async writeManifest(cardShards: string[]): Promise<void> {
        await this.putJson([ManifestFileName], await createManifest(this.context, cardShards));
    }

    private async addManifestShard(shardName: string): Promise<void> {
        const manifest: ISyncManifest | undefined = await this.readManifest();
        const cardShards: string[] = getManifestCardShards(manifest);
        cardShards.push(shardName);
        await this.writeManifest(cardShards);
    }

    private async ensureCollection(relativeSegments: string[]): Promise<void> {
        const url: string = toWebDavCollectionUrl(this.getUrl(relativeSegments));
        try {
            await this.client.request({ method: "MKCOL", url });
        } catch (error) {
            if (isAxiosStatus(error, 405)) {
                return;
            }
            if (isAxiosStatus(error, 409)) {
                return;
            }
            if (isAxiosStatus(error, 503)) {
                leetCodeChannel.appendLine(`[Review Sync] WebDAV MKCOL returned HTTP 503 for ${url}; continuing because some WebDAV providers report existing folders this way.`);
                return;
            }
            throw new Error(toWebDavErrorMessage(error));
        }
    }

    private async readJson<T>(relativeSegments: string[], missingStatuses?: number[]): Promise<T | undefined> {
        const responseText: string = await this.readText(relativeSegments, missingStatuses);
        if (!responseText) {
            return undefined;
        }
        return JSON.parse(responseText) as T;
    }

    private async readText(relativeSegments: string[], missingStatuses: number[] = [404]): Promise<string> {
        try {
            const response: AxiosResponse<string> = await this.client.request<string>({
                method: "GET",
                responseType: "text",
                transformResponse: [(data: string) => data],
                url: this.getUrl(relativeSegments),
            });
            return response.data || "";
        } catch (error) {
            for (const status of missingStatuses) {
                if (isAxiosStatus(error, status)) {
                    return "";
                }
            }
            throw new Error(toWebDavErrorMessage(error));
        }
    }

    private async putJson(relativeSegments: string[], data: unknown): Promise<void> {
        await this.putText(relativeSegments, JSON.stringify(data, undefined, 2));
    }

    private async putText(relativeSegments: string[], data: string): Promise<void> {
        await this.request({
            data,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            method: "PUT",
            url: this.getUrl(relativeSegments),
        });
    }

    private async request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        try {
            return await this.client.request<T>(config);
        } catch (error) {
            throw new Error(toWebDavErrorMessage(error));
        }
    }

    private getUrl(relativeSegments: string[]): string {
        return joinWebDavUrl(this.options.url, [this.options.rootPath].concat(relativeSegments));
    }
}

export const reviewSync: ReviewSync = new ReviewSync();

export function getBackend(): ReviewSyncBackendKind {
    const value: string = vscode.workspace.getConfiguration("leetcodeMaster.review.sync").get<string>("backend", "off");
    return value === "localFolder" || value === "webdav" ? value : "off";
}

export function getLocalFolder(): string {
    return vscode.workspace.getConfiguration("leetcodeMaster.review.sync").get<string>("folder", "").trim();
}

export function isExternalSyncConfigured(backend: string, localFolder: string, webDavOptions?: IWebDavSyncOptions): boolean {
    if (backend === "localFolder") {
        return !!localFolder;
    }
    if (backend === "webdav") {
        return isWebDavConfigured(webDavOptions);
    }
    return false;
}

export function isWebDavConfigured(options: IWebDavSyncOptions | undefined): options is Required<IWebDavSyncOptions> {
    return !!options && !!options.url && !!options.username && !!options.rootPath && !!options.password;
}

export function joinWebDavUrl(baseUrl: string, segments: string[]): string {
    const normalizedBase: string = baseUrl.replace(/\/+$/, "");
    const encodedSegments: string[] = [];
    for (const segment of segments) {
        const parts: string[] = segment.split("/").filter((part: string) => part.length > 0);
        for (const part of parts) {
            encodedSegments.push(encodeURIComponent(part));
        }
    }
    return `${normalizedBase}/${encodedSegments.join("/")}`;
}

export function toWebDavCollectionUrl(url: string): string {
    return url.endsWith("/") ? url : `${url}/`;
}

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

function splitRecordsByShard(records: ReviewRecordMap): { [shard: number]: ReviewRecordMap } {
    const shards: { [shard: number]: ReviewRecordMap } = {};
    for (const problemId of Object.keys(records)) {
        const shard: number = getProblemShard(problemId);
        shards[shard] = shards[shard] || {};
        shards[shard][problemId] = records[problemId];
    }
    return shards;
}

function mergeShardRecords(records: ReviewRecordMap, shard: ICardShard | undefined): void {
    if (!shard || !shard.records || typeof shard.records !== "object") {
        return;
    }
    for (const problemId of Object.keys(shard.records)) {
        records[problemId] = shard.records[problemId];
    }
}

function createCardShard(records: ReviewRecordMap): ICardShard {
    return {
        version: SyncManifestVersion,
        updatedAt: new Date().toISOString(),
        records,
    };
}

async function createManifest(context: vscode.ExtensionContext, cardShards: string[]): Promise<ISyncManifest> {
    return {
        cardShards: normalizeShardNames(cardShards),
        version: SyncManifestVersion,
        updatedAt: new Date().toISOString(),
        deviceId: await getDeviceId(context),
    };
}

async function createReviewSyncEvent(
    context: vscode.ExtensionContext,
    record: ReviewRecord,
    historyEntry: ReviewHistoryEntry,
    previousRecord?: ReviewRecord,
): Promise<IReviewSyncEvent> {
    return {
        eventId: createEventId(record.problemId, historyEntry.reviewedAt),
        deviceId: await getDeviceId(context),
        problemId: record.problemId,
        rating: historyEntry.rating,
        reviewedAt: historyEntry.reviewedAt,
        beforeFsrs: previousRecord ? toFsrsSnapshot(previousRecord) : undefined,
        afterFsrs: toFsrsSnapshot(record),
    };
}

async function getDeviceId(context: vscode.ExtensionContext): Promise<string> {
    let deviceId: string | undefined = context.globalState.get<string>(SyncDeviceIdKey);
    if (!deviceId) {
        deviceId = crypto.randomBytes(12).toString("hex");
        await context.globalState.update(SyncDeviceIdKey, deviceId);
    }
    return deviceId;
}

function createEventId(problemId: string, reviewedAt: string): string {
    return `${reviewedAt}-${problemId}-${crypto.randomBytes(6).toString("hex")}`;
}

function getProblemShard(problemId: string): number {
    const hash: Buffer = crypto.createHash("sha1").update(problemId).digest();
    return hash[0] % CardShardCount;
}

function toShardName(shard: number): string {
    const value: string = shard.toString(16);
    return value.length < 2 ? `0${value}` : value;
}

function getManifestCardShards(manifest: ISyncManifest | undefined): string[] {
    return manifest && Array.isArray(manifest.cardShards) ? normalizeShardNames(manifest.cardShards) : [];
}

function normalizeShardNames(shardNames: string[]): string[] {
    const result: { [shardName: string]: true } = {};
    for (const shardName of shardNames) {
        if (typeof shardName === "string" && /^[0-9a-f]{2}$/i.test(shardName)) {
            result[shardName.toLowerCase()] = true;
        }
    }
    return Object.keys(result).sort();
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

function isAxiosStatus(error: Error, status: number): boolean {
    return axios.isAxiosError(error) && !!error.response && error.response.status === status;
}

function toWebDavErrorMessage(error: Error): string {
    if (!axios.isAxiosError(error)) {
        return toErrorMessage(error);
    }
    const axiosError: AxiosError = error;
    const method: string = axiosError.config && axiosError.config.method ? axiosError.config.method.toUpperCase() : "REQUEST";
    const url: string = axiosError.config && axiosError.config.url ? axiosError.config.url : "configured WebDAV URL";
    if (axiosError.response) {
        if (axiosError.response.status === 401 || axiosError.response.status === 403) {
            return `WebDAV authentication failed (HTTP ${axiosError.response.status}) during ${method} ${url}. Check the account and application password.`;
        }
        return `WebDAV request failed with HTTP ${axiosError.response.status} during ${method} ${url}.`;
    }
    if (axiosError.code === "ECONNABORTED") {
        return `WebDAV request timed out during ${method} ${url}. Check the server address and network connection.`;
    }
    return `WebDAV network request failed during ${method} ${url}: ${axiosError.message}`;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
    return value === undefined ? undefined : value.trim();
}

function toErrorMessage(error: Error): string {
    return error && error.message ? error.message : error.toString();
}
