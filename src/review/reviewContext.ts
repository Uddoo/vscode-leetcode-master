import * as vscode from "vscode";

class ReviewContext {
    private extensionContext: vscode.ExtensionContext | undefined;

    public initialize(context: vscode.ExtensionContext): void {
        this.extensionContext = context;
    }

    public getContext(): vscode.ExtensionContext {
        if (!this.extensionContext) {
            throw new Error("Review context is not initialized.");
        }
        return this.extensionContext;
    }
}

export const reviewContext: ReviewContext = new ReviewContext();
