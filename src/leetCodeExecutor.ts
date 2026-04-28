// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as cp from "child_process";
import * as fse from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as requireFromString from "require-from-string";
import { ExtensionContext } from "vscode";
import { ConfigurationChangeEvent, Disposable, MessageItem, window, workspace, WorkspaceConfiguration } from "vscode";
import { Endpoint, extensionSettingsSection, getUrl, IProblem, leetcodeHasInited, legacyLeetcodeHasInited, supportedPlugins } from "./shared";
import { executeCommand, executeCommandWithProgress } from "./utils/cpUtils";
import { LcAxios } from "./utils/httpUtils";
import { DialogOptions, openUrl } from "./utils/uiUtils";
import * as wsl from "./utils/wslUtils";
import { toWslPath, useWsl } from "./utils/wslUtils";

class LeetCodeExecutor implements Disposable {
    private leetCodeRootPath: string;
    private nodeExecutable: string;
    private configurationChangeListener: Disposable;
    private dailyChallengeCache: { date: string; data: IProblem } | null = null;

    constructor() {
        this.leetCodeRootPath = path.join(__dirname, "..", "..", "node_modules", "vsc-leetcode-cli");
        this.nodeExecutable = this.getNodePath();
        this.configurationChangeListener = workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
            if (event.affectsConfiguration(`${extensionSettingsSection}.nodePath`)) {
                this.nodeExecutable = this.getNodePath();
            }
        }, this);
    }

    public async getLeetCodeBinaryPath(): Promise<string> {
        if (wsl.useWsl()) {
            return `${await wsl.toWslPath(`"${path.join(this.leetCodeRootPath, "bin", "leetcode")}"`)}`;
        }
        return `"${path.join(this.leetCodeRootPath, "bin", "leetcode")}"`;
    }

    public async meetRequirements(context: ExtensionContext): Promise<boolean> {
        this.nodeExecutable = this.getNodePath();
        let hasInited: boolean | undefined = context.globalState.get(leetcodeHasInited);
        const legacyHasInited: boolean | undefined = context.globalState.get(legacyLeetcodeHasInited);
        if (hasInited === undefined && legacyHasInited !== undefined) {
            await context.globalState.update(leetcodeHasInited, legacyHasInited);
            hasInited = legacyHasInited;
        }
        if (!hasInited) {
            await this.removeOldCache();
        }
        if (this.nodeExecutable !== "node") {
            if (!await fse.pathExists(this.nodeExecutable)) {
                throw new Error(`The Node.js executable does not exist on path ${this.nodeExecutable}`);
            }
            // Wrap the executable with "" to avoid space issue in the path.
            this.nodeExecutable = `"${this.nodeExecutable}"`;
            if (useWsl()) {
                this.nodeExecutable = await toWslPath(this.nodeExecutable);
            }
        }
        try {
            await this.executeCommandEx(this.nodeExecutable, ["-v"]);
        } catch (error) {
            const choice: MessageItem | undefined = await window.showErrorMessage(
                "LeetCode extension needs Node.js installed in environment path",
                DialogOptions.open,
            );
            if (choice === DialogOptions.open) {
                openUrl("https://nodejs.org");
            }
            return false;
        }
        for (const plugin of supportedPlugins) {
            try { // Check plugin
                await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "plugin", "-e", plugin]);
            } catch (error) { // Remove old cache that may cause the error download plugin and activate
                await this.removeOldCache();
                await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "plugin", "-i", plugin]);
            }
        }
        // Set the global state HasInited true to skip delete old cache after init
        context.globalState.update(leetcodeHasInited, true);
        return true;
    }

    public async deleteCache(): Promise<string> {
        return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "cache", "-d"]);
    }

    public async getUserInfo(): Promise<string> {
        return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "user"]);
    }

    public async signOut(): Promise<string> {
        return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "user", "-L"]);
    }

    public async listProblems(showLocked: boolean, needTranslation: boolean): Promise<string> {
        const cmd: string[] = [await this.getLeetCodeBinaryPath(), "list"];
        if (!needTranslation) {
            cmd.push("-T"); // use -T to prevent translation
        }
        if (!showLocked) {
            cmd.push("-q");
            cmd.push("L");
        }
        return await this.executeCommandEx(this.nodeExecutable, cmd);
    }

    public async showProblem(problemNode: IProblem, language: string, filePath: string, showDescriptionInComment: boolean = false, needTranslation: boolean): Promise<void> {
        const templateType: string = showDescriptionInComment ? "-cx" : "-c";
        const cmd: string[] = [await this.getLeetCodeBinaryPath(), "show", problemNode.id, templateType, "-l", language];

        if (!needTranslation) {
            cmd.push("-T"); // use -T to force English version
        }

        if (!await fse.pathExists(filePath)) {
            await fse.createFile(filePath);
            const codeTemplate: string = await this.executeCommandWithProgressEx("Fetching problem data...", this.nodeExecutable, cmd);
            await fse.writeFile(filePath, codeTemplate);
        }
    }

    /**
     * This function returns solution of a problem identified by input
     *
     * @remarks
     * Even though this function takes the needTranslation flag, it is important to note
     * that as of vsc-leetcode-cli 2.8.0, leetcode-cli doesn't support querying solution
     * on CN endpoint yet. So this flag doesn't have any effect right now.
     *
     * @param input - parameter to pass to cli that can identify a problem
     * @param language - the source code language of the solution desired
     * @param needTranslation - whether or not to use endPoint translation on solution query
     * @returns promise of the solution string
     */
    public async showSolution(input: string, language: string, needTranslation: boolean): Promise<string> {
        // solution don't support translation
        const cmd: string[] = [await this.getLeetCodeBinaryPath(), "show", input, "--solution", "-l", language];
        if (!needTranslation) {
            cmd.push("-T");
        }
        const solution: string = await this.executeCommandWithProgressEx("Fetching top voted solution from discussions...", this.nodeExecutable, cmd);
        return solution;
    }

    public async getDescription(problemNodeId: string, needTranslation: boolean): Promise<string> {
        const cmd: string[] = [await this.getLeetCodeBinaryPath(), "show", problemNodeId, "-x"];
        if (!needTranslation) {
            cmd.push("-T");
        }
        return await this.executeCommandWithProgressEx("Fetching problem description...", this.nodeExecutable, cmd);
    }

    public async listSessions(): Promise<string> {
        return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "session"]);
    }

    public async enableSession(name: string): Promise<string> {
        return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "session", "-e", name]);
    }

    public async createSession(id: string): Promise<string> {
        return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "session", "-c", id]);
    }

    public async deleteSession(id: string): Promise<string> {
        return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "session", "-d", id]);
    }

    public async submitSolution(filePath: string): Promise<string> {
        try {
            return await this.executeCommandWithProgressEx("Submitting to LeetCode...", this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "submit", `"${filePath}"`]);
        } catch (error: any) {
            if (error.result) {
                return error.result;
            }
            throw error;
        }
    }

    public async testSolution(filePath: string, testString?: string): Promise<string> {
        if (testString) {
            return await this.executeCommandWithProgressEx("Submitting to LeetCode...", this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "test", `"${filePath}"`, "-t", `${testString}`]);
        }
        return await this.executeCommandWithProgressEx("Submitting to LeetCode...", this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "test", `"${filePath}"`]);
    }

    public async switchEndpoint(endpoint: string): Promise<string> {
        switch (endpoint) {
            case Endpoint.LeetCodeCN:
                return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "plugin", "-e", "leetcode.cn"]);
            case Endpoint.LeetCode:
            default:
                return await this.executeCommandEx(this.nodeExecutable, [await this.getLeetCodeBinaryPath(), "plugin", "-d", "leetcode.cn"]);
        }
    }

    public async toggleFavorite(node: IProblem, addToFavorite: boolean): Promise<void> {
        const commandParams: string[] = [await this.getLeetCodeBinaryPath(), "star", node.id];
        if (!addToFavorite) {
            commandParams.push("-d");
        }
        await this.executeCommandWithProgressEx("Updating the favorite list...", "node", commandParams);
    }

    public async getCompaniesAndTags(): Promise<{ companies: { [key: string]: string[] }, tags: { [key: string]: string[] } }> {
        // preprocess the plugin source
        const companiesTagsPath: string = path.join(this.leetCodeRootPath, "lib", "plugins", "company.js");
        const companiesTagsSrc: string = (await fse.readFile(companiesTagsPath, "utf8")).replace(
            "module.exports = plugin",
            "module.exports = { COMPONIES, TAGS }",
        );
        const { COMPONIES, TAGS } = (requireFromString as any)(companiesTagsSrc, companiesTagsPath);
        return { companies: COMPONIES, tags: TAGS };
    }

    public async getDailyChallenge(): Promise<IProblem | undefined> {
        const today: string = new Date().toISOString().slice(0, 10);
        if (this.dailyChallengeCache?.date === today) {
            return this.dailyChallengeCache.data;
        }

        try {
            const graphqlUrl: string = getUrl("graphql");
            const endpoint: string = workspace.getConfiguration(extensionSettingsSection).get<string>("endpoint", Endpoint.LeetCode);
            const isCn: boolean = endpoint === Endpoint.LeetCodeCN;
            console.log(`[LeetCode Master] Fetching daily challenge from: ${graphqlUrl} (CN: ${isCn})`);

            // leetcode.com uses activeDailyCodingChallengeQuestion, leetcode.cn uses todayRecord (array)
            const query: string = isCn
                ? `query questionOfToday { todayRecord { date question { questionFrontendId title difficulty acRate } } }`
                : `query questionOfToday { activeDailyCodingChallengeQuestion { date question { questionFrontendId title difficulty acRate } } }`;

            const response: any = await LcAxios(graphqlUrl, {
                method: "POST",
                data: { query, variables: {} },
            });

            const responseData = response.data?.data;
            let dailyData: any;
            if (isCn) {
                // todayRecord is an array, take the first element
                const records = responseData?.todayRecord;
                dailyData = Array.isArray(records) ? records[0] : undefined;
            } else {
                dailyData = responseData?.activeDailyCodingChallengeQuestion;
            }

            if (!dailyData?.question) {
                console.log("[LeetCode Master] Daily challenge API returned no question data. Response keys:", Object.keys(responseData || {}));
                return undefined;
            }
            const q = dailyData.question;
            const problem: IProblem = {
                id: q.questionFrontendId,
                name: q.title,
                difficulty: q.difficulty,
                passRate: String(q.acRate || ""),
                isFavorite: false,
                locked: false,
                state: 3, // ProblemState.Unknown
                companies: [] as string[],
                tags: [] as string[],
                isDaily: true,
            };
            this.dailyChallengeCache = { date: today, data: problem };
            console.log(`[LeetCode Master] Daily challenge fetched: [${problem.id}] ${problem.name}`);
            return problem;
        } catch (e) {
            console.error("[LeetCode Master] Failed to fetch daily challenge:", e);
            return undefined;
        }
    }

    public get node(): string {
        return this.nodeExecutable;
    }

    public dispose(): void {
        this.configurationChangeListener.dispose();
    }

    private getNodePath(): string {
        const extensionConfig: WorkspaceConfiguration = workspace.getConfiguration(extensionSettingsSection, null);
        return extensionConfig.get<string>("nodePath", "node" /* default value */);
    }

    private async executeCommandEx(command: string, args: string[], options: cp.SpawnOptions = { shell: true }): Promise<string> {
        if (wsl.useWsl()) {
            return await executeCommand("wsl", [command].concat(args), options);
        }
        return await executeCommand(command, args, options);
    }

    private async executeCommandWithProgressEx(message: string, command: string, args: string[], options: cp.SpawnOptions = { shell: true }): Promise<string> {
        if (wsl.useWsl()) {
            return await executeCommandWithProgress(message, "wsl", [command].concat(args), options);
        }
        return await executeCommandWithProgress(message, command, args, options);
    }

    private async removeOldCache(): Promise<void> {
        const oldPath: string = path.join(os.homedir(), ".lc");
        if (await fse.pathExists(oldPath)) {
            await fse.remove(oldPath);
        }
    }

}

export const leetCodeExecutor: LeetCodeExecutor = new LeetCodeExecutor();
