const assert = require("assert");
const crypto = require("crypto");
const Module = require("module");

const remoteFiles = {};
const remoteCollections = {};
const requests = [];
const createdClientOptions = [];
let forcedErrorStatus;
let forcedErrorMethod;
let missingGetStatus = 404;
const fakeAxios = {
    create: (options) => {
        createdClientOptions.push(options);
        return {
            request: async (config) => {
                requests.push({ method: config.method, url: config.url });
                if (forcedErrorStatus && (!forcedErrorMethod || forcedErrorMethod === config.method)) {
                    const error = new Error(`forced ${forcedErrorStatus}`);
                    error.config = config;
                    error.isAxiosError = true;
                    error.response = { status: forcedErrorStatus };
                    throw error;
                }
                if (config.method === "PROPFIND") {
                    if (remoteCollections[config.url]) {
                        return { data: "", status: 207 };
                    }
                    const error = new Error("not found");
                    error.config = config;
                    error.isAxiosError = true;
                    error.response = { status: 404 };
                    throw error;
                }
                if (config.method === "MKCOL") {
                    if (remoteCollections[config.url] === "mkcol-503") {
                        const error = new Error("existing collection reported as unavailable");
                        error.config = config;
                        error.isAxiosError = true;
                        error.response = { status: 503 };
                        throw error;
                    }
                    remoteCollections[config.url] = true;
                    return { data: "" };
                }
                if (config.method === "GET") {
                    if (Object.prototype.hasOwnProperty.call(remoteFiles, config.url)) {
                        return { data: remoteFiles[config.url] };
                    }
                    const error = new Error("not found");
                    error.config = config;
                    error.isAxiosError = true;
                    error.response = { status: missingGetStatus };
                    throw error;
                }
                if (config.method === "PUT") {
                    remoteFiles[config.url] = config.data;
                    return { data: "" };
                }
                throw new Error(`Unexpected method ${config.method}`);
            },
        };
    },
    isAxiosError: (error) => !!error && error.isAxiosError === true,
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "axios") {
        return { default: fakeAxios };
    }
    if (request === "vscode") {
        return {
            window: {
                createOutputChannel: () => ({
                    append: () => undefined,
                    appendLine: () => undefined,
                    dispose: () => undefined,
                    show: () => undefined,
                }),
            },
            workspace: {
                getConfiguration: (section) => ({
                    get: (key, fallback) => {
                        const values = {
                            "leetcodeMaster.review.sync": {
                                backend: "webdav",
                                folder: "",
                            },
                            "leetcodeMaster.review.sync.webdav": {
                                rootPath: " LeetCode Master/复习 ",
                                url: " https://dav.jianguoyun.com/dav/ ",
                                username: " user@example.com ",
                            },
                        };
                        return values[section] && Object.prototype.hasOwnProperty.call(values[section], key)
                            ? values[section][key]
                            : fallback;
                    },
                }),
            },
        };
    }
    return originalLoad.apply(this, arguments);
};

const sync = require("../out/src/review/sync");

function makeRecord(problemId, updatedAt, rating) {
    return {
        problemId,
        problemTitle: `Problem ${problemId}`,
        tags: [],
        lastRating: rating,
        nextReviewDate: updatedAt,
        reviewHistory: [
            {
                reviewedAt: updatedAt,
                rating,
                scheduledDays: 1,
                elapsedDays: 0,
                stability: 1,
                difficulty: 5,
            },
        ],
        stability: 1,
        difficulty: 5,
        retrievability: 1,
        scheduledDays: 1,
        elapsedDays: 0,
        reps: 1,
        lapses: rating === "Again" ? 1 : 0,
        lastReviewDate: updatedAt,
        createdAt: updatedAt,
        updatedAt,
    };
}

assert.strictEqual(sync.isExternalSyncConfigured("off", "", undefined), false);
assert.strictEqual(sync.isExternalSyncConfigured("localFolder", "", undefined), false);
assert.strictEqual(sync.isExternalSyncConfigured("localFolder", "/tmp/review", undefined), true);
assert.strictEqual(sync.isExternalSyncConfigured("webdav", "", undefined), false);
assert.strictEqual(sync.isExternalSyncConfigured("webdav", "", {
    password: "app-password",
    rootPath: "LeetCode Master/复习",
    url: "https://dav.jianguoyun.com/dav/",
    username: "user@example.com",
}), true);

assert.strictEqual(
    sync.joinWebDavUrl("https://dav.jianguoyun.com/dav/", ["LeetCode Master", "cards", "复习 01.json"]),
    "https://dav.jianguoyun.com/dav/LeetCode%20Master/cards/%E5%A4%8D%E4%B9%A0%2001.json",
);
assert.strictEqual(
    sync.joinWebDavUrl("https://dav.jianguoyun.com/dav", ["/LeetCodeMaster/", "/logs/", "2026-04.jsonl"]),
    "https://dav.jianguoyun.com/dav/LeetCodeMaster/logs/2026-04.jsonl",
);
assert.strictEqual(
    sync.toWebDavCollectionUrl("https://dav.jianguoyun.com/dav/LeetCodeMaster"),
    "https://dav.jianguoyun.com/dav/LeetCodeMaster/",
);

const older = makeRecord("1", "2026-04-01T00:00:00.000Z", "Good");
const newer = makeRecord("1", "2026-04-02T00:00:00.000Z", "Easy");
const merged = sync.mergeRecordMaps({ "1": older }, { "1": newer });
assert.strictEqual(merged["1"].lastRating, "Easy");
assert.strictEqual(merged["1"].reviewHistory.length, 2);

function toShardName(problemId) {
    const shard = crypto.createHash("sha1").update(problemId).digest()[0] % 256;
    const value = shard.toString(16);
    return value.length < 2 ? `0${value}` : value;
}

(async () => {
    const remoteRecord = makeRecord("2", "2026-04-03T00:00:00.000Z", "Hard");
    const remoteRootUrl = sync.toWebDavCollectionUrl(sync.joinWebDavUrl("https://dav.jianguoyun.com/dav/", ["LeetCode Master/复习"]));
    remoteCollections[remoteRootUrl] = true;
    const remoteCardsUrl = sync.toWebDavCollectionUrl(sync.joinWebDavUrl("https://dav.jianguoyun.com/dav/", [
        "LeetCode Master/复习",
        "cards",
    ]));
    const remoteLogsUrl = sync.toWebDavCollectionUrl(sync.joinWebDavUrl("https://dav.jianguoyun.com/dav/", [
        "LeetCode Master/复习",
        "logs",
    ]));
    const manifestUrl = sync.joinWebDavUrl("https://dav.jianguoyun.com/dav/", [
        "LeetCode Master/复习",
        "manifest.json",
    ]);
    const remoteShardUrl = sync.joinWebDavUrl("https://dav.jianguoyun.com/dav/", [
        "LeetCode Master/复习",
        "cards",
        `${toShardName("2")}.json`,
    ]);
    remoteFiles[manifestUrl] = JSON.stringify({
        cardShards: [toShardName("2")],
        deviceId: "remote",
        updatedAt: remoteRecord.updatedAt,
        version: 1,
    });
    remoteFiles[remoteShardUrl] = JSON.stringify({
        records: { "2": remoteRecord },
        updatedAt: remoteRecord.updatedAt,
        version: 1,
    });

    const state = {};
    const context = {
        globalState: {
            get: (key) => state[key],
            update: async (key, value) => {
                state[key] = value;
            },
        },
        secrets: {
            get: async () => " app-password ",
            store: async () => undefined,
        },
    };

    await sync.reviewSync.initialize(context);
    assert.ok(createdClientOptions.some((options) => options.auth.username === "user@example.com"));
    assert.ok(createdClientOptions.some((options) => options.auth.password === "app-password"));
    missingGetStatus = 503;
    const webDavMerged = await sync.reviewSync.syncRecords({ "1": older });
    assert.strictEqual(webDavMerged["1"].problemId, "1");
    assert.strictEqual(webDavMerged["2"].problemId, "2");
    assert.ok(!requests.some((request) => request.method === "PROPFIND"));
    assert.ok(!requests.some((request) => request.method === "GET" && request.url.endsWith("/cards/bf.json")));
    assert.ok(!requests.some((request) => request.method === "MKCOL" && request.url === remoteRootUrl));
    assert.ok(requests.some((request) => request.method === "MKCOL" && request.url.endsWith("/LeetCode%20Master/%E5%A4%8D%E4%B9%A0/cards/")));
    assert.ok(requests.some((request) => request.method === "PUT" && request.url.indexOf("/cards/") >= 0));
    assert.ok(requests.some((request) => request.method === "PUT" && request.url.endsWith("/manifest.json")));
    const updatedManifest = JSON.parse(remoteFiles[manifestUrl]);
    assert.ok(updatedManifest.cardShards.includes(toShardName("1")));
    assert.ok(updatedManifest.cardShards.includes(toShardName("2")));
    missingGetStatus = 404;

    delete remoteCollections[remoteRootUrl];
    forcedErrorStatus = 401;
    const failedInitialize = await sync.reviewSync.initialize(context);
    assert.strictEqual(failedInitialize, false);
    assert.ok(sync.reviewSync.getLastError().indexOf("HTTP 401") >= 0);
    assert.ok(sync.reviewSync.getLastError().indexOf("GET") >= 0 || sync.reviewSync.getLastError().indexOf("PUT") >= 0 || sync.reviewSync.getLastError().indexOf("MKCOL") >= 0);
    forcedErrorStatus = undefined;

    requests.length = 0;
    remoteCollections[remoteCardsUrl] = "mkcol-503";
    remoteCollections[remoteLogsUrl] = "mkcol-503";
    const initializedWithExistingJianguoyunCollections = await sync.reviewSync.initialize(context);
    assert.strictEqual(initializedWithExistingJianguoyunCollections, true);
    assert.ok(requests.some((request) => request.method === "MKCOL" && request.url === remoteCardsUrl));
    assert.ok(requests.some((request) => request.method === "MKCOL" && request.url === remoteLogsUrl));

    requests.length = 0;
    forcedErrorStatus = 503;
    forcedErrorMethod = "PUT";
    const failedWrite = await sync.reviewSync.syncRecords({ "1": older });
    assert.strictEqual(failedWrite, undefined);
    assert.ok(sync.reviewSync.getLastError().indexOf("HTTP 503") >= 0);
    assert.ok(sync.reviewSync.getLastError().indexOf("PUT") >= 0);
    forcedErrorStatus = undefined;
    forcedErrorMethod = undefined;

    console.log("review sync smoke tests passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
