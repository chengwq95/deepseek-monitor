// Run with: node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const api = require('../app.js');

// Beijing time (UTC+8) helper: bj(2026, 11, 9, 9, 0) is Monday 9 Nov 2026 09:00 in Beijing.
const bj = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 8, mi);

test('weekday peak windows are 09:00-12:00 and 14:00-18:00 Beijing time', () => {
  assert.strictEqual(api.isPeakAt(bj(2026, 11, 9, 8, 59)), false);
  assert.strictEqual(api.isPeakAt(bj(2026, 11, 9, 9, 0)), true);
  assert.strictEqual(api.isPeakAt(bj(2026, 11, 9, 11, 59)), true);
  assert.strictEqual(api.isPeakAt(bj(2026, 11, 9, 12, 0)), false);
  assert.strictEqual(api.isPeakAt(bj(2026, 11, 9, 13, 59)), false);
  assert.strictEqual(api.isPeakAt(bj(2026, 11, 9, 14, 0)), true);
  assert.strictEqual(api.isPeakAt(bj(2026, 11, 9, 17, 59)), true);
  assert.strictEqual(api.isPeakAt(bj(2026, 11, 9, 18, 0)), false);
});

test('weekends are off-peak all day', () => {
  for (const day of [14, 15]) { // Saturday and Sunday
    for (const hour of [0, 9, 10, 14, 17, 23]) {
      assert.strictEqual(api.isPeakAt(bj(2026, 11, day, hour, 30)), false);
    }
  }
});

test('next switch moves to the nearest boundary', () => {
  assert.strictEqual(api.nextSwitch(bj(2026, 11, 9, 8, 0)), bj(2026, 11, 9, 9, 0));
  assert.strictEqual(api.nextSwitch(bj(2026, 11, 9, 9, 0)), bj(2026, 11, 9, 12, 0));
  assert.strictEqual(api.nextSwitch(bj(2026, 11, 9, 12, 30)), bj(2026, 11, 9, 14, 0));
  assert.strictEqual(api.nextSwitch(bj(2026, 11, 9, 20, 0)), bj(2026, 11, 10, 9, 0));
});

test('next switch skips the weekend', () => {
  assert.strictEqual(api.nextSwitch(bj(2026, 11, 13, 18, 0)), bj(2026, 11, 16, 9, 0)); // Fri evening -> Mon
  assert.strictEqual(api.nextSwitch(bj(2026, 11, 14, 10, 0)), bj(2026, 11, 16, 9, 0)); // Saturday
  assert.strictEqual(api.nextSwitch(bj(2026, 11, 15, 23, 59)), bj(2026, 11, 16, 9, 0)); // Sunday night
});

test('previous switch looks back across the weekend', () => {
  assert.strictEqual(api.prevSwitch(bj(2026, 11, 9, 10, 0)), bj(2026, 11, 9, 9, 0));
  assert.strictEqual(api.prevSwitch(bj(2026, 11, 15, 12, 0)), bj(2026, 11, 13, 18, 0));
  assert.strictEqual(api.prevSwitch(bj(2026, 11, 16, 8, 0)), bj(2026, 11, 13, 18, 0));
});

test('results do not depend on the device time zone', () => {
  // The same instant written from a UTC point of view: 01:00 UTC is 09:00 in Beijing.
  assert.strictEqual(api.isPeakAt(Date.UTC(2026, 10, 9, 1, 0)), true);
  assert.strictEqual(api.isPeakAt(Date.UTC(2026, 10, 9, 0, 59)), false);
});
