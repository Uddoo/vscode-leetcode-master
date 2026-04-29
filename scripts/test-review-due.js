const assert = require("assert");
const { isDue } = require("../out/src/review/dateUtils");

const now = new Date(2026, 3, 29, 22, 4, 0);

assert.strictEqual(isDue(new Date(2026, 3, 29, 23, 30, 0).toISOString(), now), true);
assert.strictEqual(isDue(new Date(2026, 3, 29, 8, 0, 0).toISOString(), now), true);
assert.strictEqual(isDue(new Date(2026, 3, 28, 23, 59, 0).toISOString(), now), true);
assert.strictEqual(isDue(new Date(2026, 3, 30, 0, 0, 0).toISOString(), now), false);
assert.strictEqual(isDue("not-a-date", now), false);

console.log("review due date tests passed");
