import { window } from "vscode";
import * as list from "../commands/list";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { globalState } from "../globalState";
import { calculateNextReviewDate } from "./scheduler";
import { buildReviewStats } from "./stats";
import { ConfidenceRating, confidenceRatings, ReviewRecord, ReviewRecordInput, ReviewStats } from "./types";

const ReviewRecordsKey: string = "leetcode.review.records";

class ReviewService {
    public getAllRecords(): ReviewRecord[] {
        const records: ReviewRecord[] = globalState.getWorkspaceState<ReviewRecord[]>(ReviewRecordsKey, []) || [];
        return records
            .filter((record: ReviewRecord) => Boolean(record.problemId))
            .sort((a: ReviewRecord, b: ReviewRecord) => a.nextReviewDate.localeCompare(b.nextReviewDate));
    }

    public getStats(): ReviewStats {
        return buildReviewStats(this.getAllRecords());
    }

    public async updateReviewRecord(problemId: string, rating: string, input?: ReviewRecordInput): Promise<ReviewRecord> {
        if (!this.isValidRating(rating)) {
            throw new Error(`Invalid rating: ${rating}`);
        }

        const records: ReviewRecord[] = this.getAllRecords();
        const now: Date = new Date();
        const nowIso: string = now.toISOString();
        const nextIso: string = calculateNextReviewDate(rating, now).toISOString();

        let record: ReviewRecord | undefined = records.find((item: ReviewRecord) => item.problemId === problemId);
        if (!record) {
            const fallback: ReviewRecordInput = await this.resolveProblemMeta(problemId);
            record = {
                problemId,
                title: input?.title || fallback.title || problemId,
                tags: input?.tags || fallback.tags || [],
                lastRating: rating,
                lastReviewedAt: nowIso,
                nextReviewDate: nextIso,
                history: [{ rating, reviewedAt: nowIso }],
            };
            records.push(record);
        } else {
            record.title = input?.title || record.title || problemId;
            record.tags = input?.tags || record.tags || [];
            record.lastRating = rating;
            record.lastReviewedAt = nowIso;
            record.nextReviewDate = nextIso;
            record.history.push({ rating, reviewedAt: nowIso });
        }

        await globalState.setWorkspaceState(ReviewRecordsKey, records);
        return record;
    }

    public async promptAndUpdate(problemId: string, input?: ReviewRecordInput): Promise<void> {
        const rating: ConfidenceRating | undefined = await window.showQuickPick(confidenceRatings.map((value) => ({
            label: value,
            description: this.getRatingDescription(value),
            value,
        })), {
            placeHolder: "Rate your confidence for this problem review",
            canPickMany: false,
        }).then((selected) => selected?.value);

        if (!rating) {
            return;
        }

        await this.updateReviewRecord(problemId, rating, input);
    }

    private isValidRating(rating: string): rating is ConfidenceRating {
        return (confidenceRatings as readonly string[]).indexOf(rating) >= 0;
    }

    private getRatingDescription(rating: ConfidenceRating): string {
        switch (rating) {
            case "Again": return "Review tomorrow";
            case "Hard": return "Review in 3 days";
            case "Good": return "Review in 7 days";
            case "Easy": return "Review in 14 days";
            default: return "";
        }
    }

    private async resolveProblemMeta(problemId: string): Promise<ReviewRecordInput> {
        const node = explorerNodeManager.getNodeById(problemId);
        if (node) {
            return { title: node.name, tags: node.tags.filter((tag: string) => tag !== "Unknown") };
        }

        const problems = await list.listProblems();
        const problem = problems.find((item) => item.id === problemId);
        if (problem) {
            return { title: problem.name, tags: problem.tags.filter((tag: string) => tag !== "Unknown") };
        }

        return { title: problemId, tags: [] };
    }
}

export const reviewService: ReviewService = new ReviewService();
