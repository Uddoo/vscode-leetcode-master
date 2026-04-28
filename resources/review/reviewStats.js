(function () {
    const vscode = acquireVsCodeApi();
    const summary = document.getElementById("summary");
    const insights = document.getElementById("insights");
    const heatmap = document.getElementById("heatmap");
    const ratingBars = document.getElementById("ratingBars");
    const trendLine = document.getElementById("trendLine");
    const message = document.getElementById("message");
    const refreshButton = document.getElementById("refreshButton");

    refreshButton.addEventListener("click", function () {
        setMessage("Refreshing statistics...");
        vscode.postMessage({ command: "refresh" });
    });

    window.addEventListener("message", function (event) {
        const payload = event.data;
        if (payload.command === "stats") {
            renderStats(payload.stats);
            setMessage("");
        }
    });

    vscode.postMessage({ command: "ready" });

    function renderStats(stats) {
        renderSummary(stats);
        renderInsights(stats.insights || []);
        renderHeatmap(stats.heatmap || []);
        renderRatingBars(stats.ratingDistribution || []);
        renderTrendLine(stats.dailyTrend || []);
    }

    function renderSummary(stats) {
        summary.textContent = "";
        appendSummaryCard("Tracked", stats.totalRecords || 0, "problems");
        appendSummaryCard("Due", stats.dueCount || 0, "problems ready now");
        appendSummaryCard("Updated", formatDateTime(stats.generatedAt), "local time");
    }

    function renderInsights(items) {
        insights.textContent = "";
        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "insight-card insight-info";
            const title = document.createElement("h3");
            title.textContent = "No insights yet";
            empty.appendChild(title);
            const description = document.createElement("p");
            description.textContent = "Add accepted submissions to the review list to generate review insights.";
            empty.appendChild(description);
            insights.appendChild(empty);
            return;
        }

        items.forEach(function (item) {
            const card = document.createElement("article");
            card.className = `insight-card insight-${item.severity || "info"}`;

            const title = document.createElement("h3");
            title.textContent = item.title || "Insight";
            card.appendChild(title);

            const value = document.createElement("strong");
            value.textContent = item.value || "";
            card.appendChild(value);

            const description = document.createElement("p");
            description.textContent = item.description || "";
            card.appendChild(description);

            insights.appendChild(card);
        });
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

    function renderHeatmap(days) {
        heatmap.textContent = "";
        const footer = getHeatmapFooter();
        const maxCount = Math.max(1, ...days.map(function (day) { return day.count || 0; }));
        days.forEach(function (day) {
            const cell = document.createElement("div");
            cell.className = "heat-cell";
            const level = Math.ceil(((day.count || 0) / maxCount) * 5);
            cell.classList.add(`level-${level}`);
            cell.title = `${day.date}: ${day.count || 0} review(s)`;
            cell.setAttribute("aria-label", `${day.date}: ${day.count || 0} review(s)`);

            const count = document.createElement("strong");
            count.textContent = String(day.count || 0);
            cell.appendChild(count);

            heatmap.appendChild(cell);
        });
        footer.textContent = days.length ? `${compactDate(days[0].date)} - ${compactDate(days[days.length - 1].date)} · hover for exact date` : "No review activity yet";
    }

    function getHeatmapFooter() {
        let footer = document.getElementById("heatmapFooter");
        if (!footer) {
            footer = document.createElement("div");
            footer.id = "heatmapFooter";
            footer.className = "heatmap-footer";
            heatmap.parentNode.insertBefore(footer, heatmap.nextSibling);
        }
        return footer;
    }

    function renderRatingBars(distribution) {
        ratingBars.textContent = "";
        const maxCount = Math.max(1, ...distribution.map(function (item) { return item.count || 0; }));
        distribution.forEach(function (item) {
            const row = document.createElement("div");
            row.className = "bar-row";

            const label = document.createElement("span");
            label.textContent = item.rating;
            row.appendChild(label);

            const track = document.createElement("div");
            track.className = "bar-track";
            const fill = document.createElement("div");
            fill.className = "bar-fill";
            fill.style.width = `${((item.count || 0) / maxCount) * 100}%`;
            track.appendChild(fill);
            row.appendChild(track);

            const count = document.createElement("strong");
            count.textContent = String(item.count || 0);
            row.appendChild(count);

            ratingBars.appendChild(row);
        });
    }

    function renderTrendLine(days) {
        trendLine.textContent = "";
        trendLine.setAttribute("viewBox", "0 0 720 260");

        const width = 720;
        const height = 260;
        const padding = 30;
        const maxCount = Math.max(1, ...days.map(function (day) { return day.count || 0; }));
        const points = days.map(function (day, index) {
            const x = padding + (days.length <= 1 ? 0 : index * ((width - padding * 2) / (days.length - 1)));
            const y = height - padding - ((day.count || 0) / maxCount) * (height - padding * 2);
            return { x: x, y: y, count: day.count || 0, date: day.date };
        });

        appendLine(padding, height - padding, width - padding, height - padding, "trend-axis");
        appendLine(padding, padding, padding, height - padding, "trend-axis");

        if (!points.length) {
            return;
        }

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "trend-path");
        path.setAttribute("d", points.map(function (point, index) {
            return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
        }).join(" "));
        trendLine.appendChild(path);

        points.forEach(function (point) {
            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("class", "trend-dot");
            dot.setAttribute("cx", String(point.x));
            dot.setAttribute("cy", String(point.y));
            dot.setAttribute("r", point.count > 0 ? "4" : "2.5");
            dot.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "title")).textContent = `${point.date}: ${point.count} review(s)`;
            trendLine.appendChild(dot);
        });
    }

    function appendLine(x1, y1, x2, y2, className) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", className);
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        trendLine.appendChild(line);
    }

    function compactDate(dateText) {
        const date = new Date(`${dateText}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
            return dateText;
        }
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    function formatDateTime(isoDate) {
        const date = new Date(isoDate);
        if (Number.isNaN(date.getTime())) {
            return "Unknown";
        }
        return date.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function setMessage(text) {
        message.textContent = text;
    }
}());
