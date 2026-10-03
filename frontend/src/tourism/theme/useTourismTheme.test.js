import { render } from "@testing-library/react";
import useTourismTheme from "./useTourismTheme";
import { deriveTourismTheme } from "./deriveTourismTheme";

function Shell({ theme, onPalette }) {
  const { shellRef, chartPalette } = useTourismTheme(theme);
  if (onPalette) onPalette(chartPalette);
  return <div className="tourism-layout" data-testid="shell" ref={shellRef} />;
}

function rootHasThemeProperties() {
  const rootStyle = document.documentElement.style;
  return Array.from({ length: rootStyle.length }, (_, i) => rootStyle.item(i)).some((name) =>
    name.startsWith("--th-")
  );
}

describe("useTourismTheme", () => {
  test("sets the derived properties on the shell element, not on :root", () => {
    const { getByTestId } = render(<Shell theme={{ primary_color: "#EF7C1F" }} />);
    const shell = getByTestId("shell");
    const expected = deriveTourismTheme("#EF7C1F");

    Object.entries(expected).forEach(([name, value]) => {
      expect(shell.style.getPropertyValue(name)).toBe(value);
    });
    expect(rootHasThemeProperties()).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--th-primary")).toBe("");
    expect(document.body.style.getPropertyValue("--th-primary")).toBe("");
  });

  test("updates when the theme colour changes", () => {
    const { getByTestId, rerender } = render(<Shell theme={{ primary_color: "#2FA34A" }} />);
    rerender(<Shell theme={{ primary_color: "#EF7C1F" }} />);
    expect(getByTestId("shell").style.getPropertyValue("--th-primary")).toBe("#EF7C1F");
  });

  test("removes the properties on unmount", () => {
    const { getByTestId, unmount } = render(<Shell theme={{ primary_color: "#EF7C1F" }} />);
    const shell = getByTestId("shell");
    expect(shell.style.getPropertyValue("--th-primary")).toBe("#EF7C1F");

    unmount();

    Object.keys(deriveTourismTheme("#EF7C1F")).forEach((name) => {
      expect(shell.style.getPropertyValue(name)).toBe("");
    });
    expect(rootHasThemeProperties()).toBe(false);
  });

  test("reads the chart palette back from the shell after setting it", () => {
    const seen = [];
    render(<Shell theme={{ primary_color: "#EF7C1F" }} onPalette={(p) => seen.push(p)} />);
    const orange = deriveTourismTheme("#EF7C1F");
    expect(seen[0]).toBeNull(); // the first pass, before the shell exists, is never painted
    expect(seen[seen.length - 1].series).toEqual([1, 2, 3, 4, 5].map((n) => orange[`--th-chart-${n}`]));
    expect(seen[seen.length - 1].wash).toBe(orange["--th-chart-wash"]);
  });

  test("re-reads the chart palette when the theme changes", () => {
    let latest = null;
    const { rerender } = render(<Shell theme={{ primary_color: "#2FA34A" }} onPalette={(p) => { latest = p; }} />);
    expect(latest.series[0]).toBe(deriveTourismTheme("#2FA34A")["--th-chart-1"]);
    rerender(<Shell theme={{ primary_color: "#EF7C1F" }} onPalette={(p) => { latest = p; }} />);
    expect(latest.series[0]).toBe(deriveTourismTheme("#EF7C1F")["--th-chart-1"]);
  });

  test.each([
    ["missing theme", undefined],
    ["null theme", null],
    ["theme without a colour", {}],
    ["malformed colour", { primary_color: "not-a-colour" }],
    ["null colour", { primary_color: null }],
    ["theme that is a string", "#EF7C1F"],
  ])("falls back to green for a %s", (_label, theme) => {
    const { getByTestId } = render(<Shell theme={theme} />);
    expect(getByTestId("shell").style.getPropertyValue("--th-primary")).toBe("#2FA34A");
    expect(getByTestId("shell").style.getPropertyValue("--th-primary-tint")).toBe("#F0FDF4");
  });
});
