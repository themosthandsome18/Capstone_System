import { niceVisitorMax, visitorAxis } from "./visitorAxis";

describe("visitor axis", () => {
  it.each([
    [[0], 10],
    [[3], 10],
    [[8], 10],
    [[10], 10],
    [[45], 100],
    [[320], 500],
    [[11], 20],
    [[16], 20],
    [[17], 50],
    [[0, 3, 8, 45, 320], 500],
    [[], 10],
    [undefined, 10],
  ])("the top for %j is %i", (values, max) => {
    expect(visitorAxis(values).max).toBe(max);
  });

  it("is never below the busiest day plus 20%, once past 10", () => {
    for (let top = 11; top <= 6000; top += 1) {
      expect(niceVisitorMax(top)).toBeGreaterThanOrEqual(top * 1.2);
    }
  });

  it("is always a clean number: 1, 2 or 5 times a power of ten", () => {
    for (let top = 0; top <= 6000; top += 1) {
      expect(/^[125]0*$/.test(String(niceVisitorMax(top)))).toBe(true);
    }
  });

  it("has 4 or 5 lines above the 0, every one a whole number, from 0 to the top", () => {
    for (const top of [0, 1, 7, 10, 11, 19, 45, 99, 100, 150, 320, 499, 500, 1234, 4999]) {
      const { min, max, stepSize } = visitorAxis([top]);
      expect(min).toBe(0);
      expect(Number.isInteger(stepSize)).toBe(true);
      expect(stepSize).toBeGreaterThan(0);
      expect(max % stepSize).toBe(0);
      const lines = max / stepSize;
      expect(lines === 4 || lines === 5).toBe(true);
      for (let at = 0; at <= max; at += stepSize) expect(Number.isInteger(at)).toBe(true);
    }
  });

  it("reads strings and rubbish in the data without breaking", () => {
    expect(visitorAxis(["45", null, undefined, "x"]).max).toBe(100);
  });
});
