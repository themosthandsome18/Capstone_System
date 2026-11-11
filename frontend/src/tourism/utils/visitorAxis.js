// The Y axis of the Daily Visitor Trends chart, fitted to the data. People are counted, so every line is a whole number.
//
// The top is 10 when the busiest day is 10 or less. Above that it is the busiest day plus about 20%, taken up to the next clean
// number (1, 2 or 5 times a power of ten: 20, 50, 100, 200, 500 ...). The step is the top divided by 5 (or by 4 when the top
// is 2, 20, 200 ...), which is always a whole number: 4 or 5 lines above the 0 at the bottom.
const CLEAN = [1, 2, 5];

export function niceVisitorMax(highest) {
  const value = Number.isFinite(Number(highest)) ? Math.max(0, Number(highest)) : 0;
  if (value <= 10) return 10;
  const target = value * 1.2;
  for (let power = 1; ; power *= 10) {
    for (const base of CLEAN) {
      const candidate = base * power;
      if (candidate >= target && candidate >= 10) return candidate;
    }
  }
}

export function visitorAxis(values) {
  const highest = (Array.isArray(values) ? values : []).reduce((top, v) => Math.max(top, Number(v) || 0), 0);
  const max = niceVisitorMax(highest);
  const leading = String(max)[0];
  const step = leading === "2" ? max / 4 : max / 5;
  return { min: 0, max, stepSize: step };
}
