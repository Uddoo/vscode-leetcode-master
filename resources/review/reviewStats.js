(function () {
    const stats = window.__REVIEW_STATS__ || {};
    const summary = document.getElementById('summary');
    const rating = document.getElementById('rating-distribution');
    const trendSvg = document.getElementById('trend-chart');
    const heatmap = document.getElementById('heatmap');

    const distribution = stats.ratingDistribution || { Again: 0, Hard: 0, Good: 0, Easy: 0 };
    summary.innerHTML = `
        <div class="card">Total records: ${stats.totalRecords || 0}</div>
        <div class="card">Due today: ${stats.dueToday || 0}</div>
        <div class="card">Overdue: ${stats.overdue || 0}</div>
    `;

    rating.innerHTML = Object.keys(distribution).map((key) => {
        const value = distribution[key];
        return `<div>${key}: ${value}<div class="bar" style="width:${Math.max(8, value * 24)}px"></div></div>`;
    }).join('');

    const trend = Array.isArray(stats.dailyTrend) ? stats.dailyTrend : [];
    const maxCount = Math.max(1, ...trend.map((item) => item.count));
    const width = 700;
    const height = 180;
    const points = trend.map((item, idx) => {
        const x = 10 + (idx * (width - 20)) / Math.max(1, trend.length - 1);
        const y = height - 10 - (item.count * (height - 20)) / maxCount;
        return `${x},${y}`;
    });
    trendSvg.innerHTML = `<polyline fill="none" stroke="currentColor" stroke-width="2" points="${points.join(' ')}"></polyline>`;

    const heat = Array.isArray(stats.heatmap) ? stats.heatmap : [];
    const maxHeat = Math.max(1, ...heat.map((item) => item.count));
    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';
    heat.forEach((item) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const ratio = item.count / maxHeat;
        cell.style.background = `rgba(40, 167, 69, ${Math.max(0.15, ratio)})`;
        cell.title = `${item.date}: ${item.count}`;
        grid.appendChild(cell);
    });
    heatmap.appendChild(grid);
})();
