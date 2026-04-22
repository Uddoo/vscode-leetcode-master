(function () {
    const vscode = acquireVsCodeApi();
    const ratings = ["Again", "Hard", "Good", "Easy"];
    const state = {
        records: [],
        now: new Date().toISOString()
    };

    const table = document.getElementById("reviewTable");
    const tableBody = document.getElementById("reviewTableBody");
    const emptyState = document.getElementById("emptyState");
    const summary = document.getElementById("summary");
    const message = document.getElementById("message");
    const refreshButton = document.getElementById("refreshButton");

    refreshButton.addEventListener("click", function () {
        setMessage("Refreshing review list...");
        vscode.postMessage({ command: "refresh" });
    });

    window.addEventListener("message", function (event) {
        const payload = event.data;
        if (payload.command === "records") {
            state.records = Array.isArray(payload.records) ? payload.records : [];
            state.now = payload.now || new Date().toISOString();
            render();
            setMessage("");
        } else if (payload.command === "error") {
            setMessage(payload.message || "Failed to update review data.");
        }
    });

    vscode.postMessage({ command: "ready" });

    function render() {
        renderSummary();
        renderTable();
    }

    function renderSummary() {
        summary.textContent = "";
        const now = new Date(state.now);
        const dueCount = state.records.filter(function (record) {
            return new Date(record.nextReviewDate).getTime() <= now.getTime();
        }).length;
        const historyCount = state.records.reduce(function (total, record) {
            return total + (Array.isArray(record.reviewHistory) ? record.reviewHistory.length : 0);
        }, 0);

        appendSummaryCard("Tracked", state.records.length, "problems in review list");
        appendSummaryCard("Due", dueCount, "ready for review now");
        appendSummaryCard("Reviews", historyCount, "total completed ratings");
    }

    function appendSummaryCard(label, value, caption) {
        const card = document.createElement("div");
        card.className = "summary-card";

        const strong = document.createElement("strong");
        strong.textContent = String(value);
        card.appendChild(strong);

        const span = document.createElement("span");
        span.textContent = `${label}: ${caption}`;
        card.appendChild(span);

        summary.appendChild(card);
    }

    function renderTable() {
        tableBody.textContent = "";
        const hasRecords = state.records.length > 0;
        emptyState.classList.toggle("hidden", hasRecords);
        table.classList.toggle("hidden", !hasRecords);

        const fragment = document.createDocumentFragment();
        state.records.forEach(function (record) {
            fragment.appendChild(createRecordRow(record));
        });
        tableBody.appendChild(fragment);
    }

    function createRecordRow(record) {
        const row = document.createElement("tr");

        const problemCell = document.createElement("td");
        const title = document.createElement("button");
        title.type = "button";
        title.className = "problem-title problem-title-button";
        title.textContent = record.problemTitle || `Problem ${record.problemId}`;
        title.title = "Open problem preview";
        title.setAttribute("aria-label", `Open problem preview for ${record.problemTitle || record.problemId}`);
        title.addEventListener("click", function () {
            setMessage(`Opening ${record.problemTitle || record.problemId}...`);
            vscode.postMessage({
                command: "openProblem",
                problemId: record.problemId
            });
        });
        problemCell.appendChild(title);

        const id = document.createElement("span");
        id.className = "problem-id";
        id.textContent = `#${record.problemId}`;
        problemCell.appendChild(id);
        row.appendChild(problemCell);

        const tagsCell = document.createElement("td");
        const tags = document.createElement("div");
        tags.className = "tags";
        const safeTags = Array.isArray(record.tags) && record.tags.length ? record.tags : ["Untagged"];
        safeTags.forEach(function (tagText) {
            const tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = tagText;
            tags.appendChild(tag);
        });
        tagsCell.appendChild(tags);
        row.appendChild(tagsCell);

        const ratingCell = document.createElement("td");
        ratingCell.textContent = record.lastRating;
        row.appendChild(ratingCell);

        const dateCell = document.createElement("td");
        dateCell.className = "date-cell";
        if (new Date(record.nextReviewDate).getTime() <= new Date(state.now).getTime()) {
            dateCell.classList.add("due");
        }
        dateCell.textContent = formatDate(record.nextReviewDate);
        row.appendChild(dateCell);

        const actionCell = document.createElement("td");
        const actions = document.createElement("div");
        actions.className = "rating-actions";
        ratings.forEach(function (rating) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "rating-button";
            if (rating === record.lastRating) {
                button.classList.add("active");
            }
            button.textContent = rating;
            button.addEventListener("click", function () {
                setMessage(`Updating ${record.problemTitle || record.problemId} as ${rating}...`);
                vscode.postMessage({
                    command: "review",
                    problemId: record.problemId,
                    rating: rating
                });
            });
            actions.appendChild(button);
        });
        actionCell.appendChild(actions);
        row.appendChild(actionCell);

        return row;
    }

    function formatDate(isoDate) {
        const date = new Date(isoDate);
        if (Number.isNaN(date.getTime())) {
            return "Invalid date";
        }
        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function setMessage(text) {
        message.textContent = text;
    }
}());
