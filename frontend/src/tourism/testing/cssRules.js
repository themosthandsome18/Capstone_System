// Reads rules out of Tourism_index.css for the tests that hold a design's sizes and colours against the file itself (jsdom does not apply
// a stylesheet). `rule(".a .b")` gives the declarations of every rule that names exactly that selector, added up in order.
import { readFileSync } from "fs";
import { join } from "path";

export const tourismCss = readFileSync(join(__dirname, "..", "Tourism_index.css"), "utf8").replace(/\r\n/g, "\n");

// A value written the way the design writes it or the way the file does: spaces and a leading zero before a point do not count.
export const norm = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(^|[^\d])0\./g, "$1.");

export function rule(selector, css = tourismCss) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = Array.from(css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g")));
  if (!found.length) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries(
    found
      .map((match) => match[1])
      .join(";")
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      })
  );
}

// Every declared property of the rule, each value normalised, so a test can compare them with `toMatchObject` and the design's own writing.
export function normalised(selector) {
  return Object.fromEntries(Object.entries(rule(selector)).map(([property, value]) => [property, norm(value)]));
}

// The same for an expected object.
export function expectedNorm(object) {
  return Object.fromEntries(Object.entries(object).map(([property, value]) => [property, norm(value)]));
}
