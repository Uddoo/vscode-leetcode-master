// Copyright (c) leo.zhao. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const CookieKey = "leetcodeMaster.cookie";
const UserStatusKey = "leetcodeMaster.userStatus";
const LegacyCookieKey = "leetcode-cookie";
const LegacyUserStatusKey = "leetcode-user-status";
const GlobalStateMigrationKey = "leetcodeMaster.globalStateMigrated.v1";

export type UserDataType = {
    isSignedIn: boolean;
    isPremium: boolean;
    username: string;
    avatar: string;
    isVerified?: boolean;
};

class GlobalState {
    private context: vscode.ExtensionContext;
    private _state: vscode.Memento;
    private _cookie: string;
    private _userStatus: UserDataType;

    public async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
        this._state = this.context.globalState;
        await this.migrateLegacyState();
    }

    public setCookie(cookie: string): any {
        this._cookie = cookie;
        return this._state.update(CookieKey, this._cookie);
    }
    public getCookie(): string | undefined {
        return this._cookie ?? this._state.get(CookieKey);
    }

    public setUserStatus(userStatus: UserDataType): any {
        this._userStatus = userStatus;
        return this._state.update(UserStatusKey, this._userStatus);
    }

    public getUserStatus(): UserDataType | undefined {
        return this._userStatus ?? this._state.get(UserStatusKey);
    }

    public removeCookie(): void {
        this._state.update(CookieKey, undefined);
    }

    public removeAll(): void {
        this._state.update(CookieKey, undefined);
        this._state.update(UserStatusKey, undefined);
    }

    private async migrateLegacyState(): Promise<void> {
        if (this._state.get<boolean>(GlobalStateMigrationKey)) {
            return;
        }

        const legacyCookie: string | undefined = this._state.get<string>(LegacyCookieKey);
        if (this._state.get<string>(CookieKey) === undefined && legacyCookie !== undefined) {
            await this._state.update(CookieKey, legacyCookie);
        }

        const legacyUserStatus: UserDataType | undefined = this._state.get<UserDataType>(LegacyUserStatusKey);
        if (this._state.get<UserDataType>(UserStatusKey) === undefined && legacyUserStatus !== undefined) {
            await this._state.update(UserStatusKey, legacyUserStatus);
        }

        await this._state.update(GlobalStateMigrationKey, true);
    }
}

export const globalState: GlobalState = new GlobalState();
