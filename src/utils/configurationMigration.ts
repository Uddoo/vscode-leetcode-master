// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeChannel } from "../leetCodeChannel";
import { extensionSettingsSection, legacyExtensionSettingsSection } from "../shared";

const SettingsMigrationKey: string = "leetcodeMaster.settingsMigrated.v1";

interface IConfigurationInspect {
    globalValue?: unknown;
    workspaceValue?: unknown;
    workspaceFolderValue?: unknown;
}

const MigratedConfigurationKeys: string[] = [
    "hideSolved",
    "defaultLanguage",
    "showDescription",
    "showCommentDescription",
    "hint.setDefaultLanguage",
    "hint.configWebviewMarkdown",
    "hint.commentDescription",
    "hint.commandShortcut",
    "useWsl",
    "endpoint",
    "useEndpointTranslation",
    "workspaceFolder",
    "filePath",
    "enableStatusBar",
    "editor.shortcuts",
    "enableSideMode",
    "nodePath",
    "colorizeProblems",
    "problems.sortStrategy",
    "review.sortStrategy",
    "review.dailyGoal",
    "allowReportData",
];

export async function migrateLegacySettings(context: vscode.ExtensionContext): Promise<void> {
    if (context.globalState.get<boolean>(SettingsMigrationKey)) {
        return;
    }

    const legacyConfiguration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(legacyExtensionSettingsSection);
    const currentConfiguration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionSettingsSection);

    for (const key of MigratedConfigurationKeys) {
        const currentInspect: IConfigurationInspect | undefined = currentConfiguration.inspect(key);
        if (hasConfiguredValue(currentInspect)) {
            continue;
        }

        const legacyInspect: IConfigurationInspect | undefined = legacyConfiguration.inspect(key);
        if (!legacyInspect) {
            continue;
        }

        await copyConfiguredValue(currentConfiguration, key, legacyInspect.globalValue, vscode.ConfigurationTarget.Global);
        await copyConfiguredValue(currentConfiguration, key, legacyInspect.workspaceValue, vscode.ConfigurationTarget.Workspace);
        await copyConfiguredValue(currentConfiguration, key, legacyInspect.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder);
    }

    await context.globalState.update(SettingsMigrationKey, true);
}

function hasConfiguredValue(inspect: IConfigurationInspect | undefined): boolean {
    return !!inspect && (
        inspect.globalValue !== undefined ||
        inspect.workspaceValue !== undefined ||
        inspect.workspaceFolderValue !== undefined
    );
}

async function copyConfiguredValue(
    configuration: vscode.WorkspaceConfiguration,
    key: string,
    value: unknown,
    target: vscode.ConfigurationTarget,
): Promise<void> {
    if (value === undefined) {
        return;
    }

    try {
        await configuration.update(key, value, target);
    } catch (error) {
        const message: string = error && error.message ? error.message : error.toString();
        leetCodeChannel.appendLine(`[Settings Migration] Failed to migrate ${key}: ${message}`);
    }
}
