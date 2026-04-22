(function () {
    const vscode = acquireVsCodeApi();
    const summary = document.getElementById("summary");
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
        const maxCount = Math.max(1, ...days.map(function (day) { return day.count || 0; }));
        days.forEach(function (day) {
            const cell = document.createElement("div");
            cell.className = "heat-cell";
            const level = Math.ceil(((day.count || 0) / maxCount) * 5);
            cell.classList.add(`level-${level}`);
            cell.title = `${day.date}: ${day.count || 0} review(s)`;

            const count = document.createElement("strong");
            count.textContent = String(day.count || 0);
            cell.appendChild(count);

            const label = document.createElement("span");
            label.textContent = compactDate(day.date);
            cell.appendChild(label);

            heatmap.appendChild(cell);
        });
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
