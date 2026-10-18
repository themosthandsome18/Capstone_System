/* eslint-env node */
const assert = require("node:assert/strict");

// Real-browser regression helper. The caller supplies an authenticated local
// page and owns its disposable backend/browser lifecycle; no credentials here.
module.exports = async function verifyPermitMonitoringLayout(page, name) {
  const measurements = [];
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const row = page.getByRole("row", { name: new RegExp(name) });
    await row.waitFor();
    const measurement = await row.evaluate((element) => {
      const wrapper = element.closest(".permit-table-wrap");
      wrapper.scrollLeft = 0;
      const cells = Array.from(element.cells);
      const bounds = (node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      const cell = cells[5];
      return {
        viewport: window.innerWidth,
        columnWidths: cells.map((node) => bounds(node).width),
        enforcement: bounds(cell),
        content: Array.from(cell.querySelectorAll(".enforcement-stage, button")).map(bounds),
        badges: cells.flatMap((node) => Array.from(node.querySelectorAll(".permit-status, .permit-compliance"))
          .map((badge) => ({ cell: bounds(node), badge: bounds(badge) }))),
        wrapperWidth: wrapper.clientWidth,
        scrollWidth: wrapper.scrollWidth,
        overflowX: getComputedStyle(wrapper).overflowX,
      };
    });
    measurements.push(measurement);
    assert.equal(measurement.columnWidths.length, 6);
    assert.ok(measurement.columnWidths[5] >= 190,
      `${width}px: Enforcement Stage collapsed to ${measurement.columnWidths[5]}px`);
    assert.ok(measurement.columnWidths.slice(0, 5).every((value) => value >= 110),
      `${width}px: existing columns must remain readable`);
    for (const item of measurement.content) {
      assert.ok(item.left >= measurement.enforcement.left && item.right <= measurement.enforcement.right + 1,
        `${width}px: enforcement content overlaps its column`);
    }
    for (const item of measurement.badges) {
      assert.ok(item.badge.left >= item.cell.left && item.badge.right <= item.cell.right + 1,
        `${width}px: existing permit/compliance badges overlap their columns`);
    }
    if (width === 1440) {
      assert.ok(measurement.scrollWidth <= measurement.wrapperWidth + 1,
        "Desktop columns must fit the available table viewport");
    }
    const scrolled = await row.evaluate((element) => {
      const wrapper = element.closest(".permit-table-wrap");
      wrapper.scrollLeft = wrapper.scrollWidth;
      const badge = element.querySelector(".enforcement-stage").getBoundingClientRect();
      const visible = wrapper.getBoundingClientRect();
      return { left: wrapper.scrollLeft, badgeVisible: badge.left >= visible.left && badge.right <= visible.right + 1 };
    });
    assert.ok(scrolled.badgeVisible, `${width}px: stage badge must be reachable inside the scroll viewport`);
    if (width <= 1024) {
      assert.equal(measurement.overflowX, "auto");
      assert.ok(scrolled.left > 0, `${width}px: horizontal scrolling must work`);
    }
    measurement.scrollLeft = scrolled.left;
  }
  return measurements;
};
