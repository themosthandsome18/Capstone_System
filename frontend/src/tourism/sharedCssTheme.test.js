/**
 * The shared stylesheets and the theme. Sanitation uses these files too, and the --th-* tokens are set only on .tourism-layout (never on :root),
 * so inside Sanitation a var(--th-primary) would fall back to the green of :root and repaint Sanitation. Measured in a browser, not guessed.
 * These tests keep the line: only what is Tourism's alone reads a token; everything Sanitation draws keeps its own literals.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { rule } from "./testing/cssRules";

const read = (...parts) => readFileSync(join(__dirname, "..", "shared", ...parts), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

const overlayCss = read("LoadingOverlay.css");
const pickerCss = read("LocationPicker.css");
const activityCss = read("pages", "ActivityLogsPage.css");
const pageLoaderCss = read("PageLoader.css");

const THEME_TOKEN = /var\(--th-/;

describe("the tourism overlay follows the theme", () => {
  it.each([
    [".loading-overlay--tourism .loading-overlay__pulse-glow", { background: "var(--th-primary)" }],
    [".loading-overlay--tourism .loading-overlay__ring-outer", { "border-top-color": "var(--th-primary-ink)", "border-right-color": "var(--th-primary)" }],
    [".loading-overlay--tourism .loading-overlay__ring-inner", { "border-top-color": "var(--th-primary)", "border-left-color": "var(--th-primary-hover)" }],
    [".loading-overlay--tourism .loading-overlay__core-dot", { background: "var(--th-primary-ink)", "box-shadow": "0 0 10px var(--th-primary)" }],
  ])("%s", (selector, expected) => {
    expect(rule(selector, overlayCss)).toEqual(expected);
  });
});

describe("what Sanitation draws keeps its own colours", () => {
  it("no rule of the neutral or Sanitation overlay reads a theme token", () => {
    const outsideTourism = overlayCss
      .split(/\n(?=\.)/)
      .filter((block) => !block.startsWith(".loading-overlay--tourism"))
      .join("\n");
    expect(outsideTourism).not.toMatch(THEME_TOKEN);
    expect(outsideTourism).toContain("#0ea5e9"); // the neutral overlay's blue, used by Sanitation's PermitRenewal
  });

  it("LocationPicker.css (its link and search button paint only in Sanitation) has no theme token", () => {
    expect(pickerCss).not.toMatch(THEME_TOKEN);
  });

  it("the shared Activity Logs file has no theme token: Tourism's colours are scoped rules in Tourism_index.css", () => {
    expect(activityCss).not.toMatch(THEME_TOKEN);
  });

  it("PageLoader.css (shown before the shell exists, where no token is reachable) has no theme token", () => {
    expect(pageLoaderCss).not.toMatch(THEME_TOKEN);
  });
});
