(function () {
    const vscode = acquireVsCodeApi();
    const records = Array.isArray(window.__REVIEW_RECORDS__) ? window.__REVIEW_RECORDS__ : [];
    const root = document.getElementById('review-list');

    function render() {
        root.innerHTML = '';
        if (!records.length) {
            root.innerHTML = '<p>No review records yet.</p>';
            return;
        }

        records.forEach((record) => {
            const row = document.createElement('div');
            row.className = 'row';
            const tags = (record.tags || []).length ? record.tags.join(', ') : 'No tags';
            row.innerHTML = `
                <div class="title">[${record.problemId}] ${record.title}</div>
                <div class="meta">Next review: ${new Date(record.nextReviewDate).toLocaleDateString()} · Last rating: ${record.lastRating}</div>
                <div class="meta">Tags: ${tags}</div>
            `;
            const actionDiv = document.createElement('div');
            actionDiv.className = 'actions';
            ['Again', 'Hard', 'Good', 'Easy'].forEach((rating) => {
                const btn = document.createElement('button');
                btn.textContent = rating;
                btn.addEventListener('click', () => {
                    vscode.postMessage({ command: 'updateRating', problemId: record.problemId, rating });
                });
                actionDiv.appendChild(btn);
            });
            row.appendChild(actionDiv);
            root.appendChild(row);
        });
    }

    render();
})();
