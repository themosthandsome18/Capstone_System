import { useCallback, useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Settings, { MAX_SAVED_COLORS } from "./Settings";
import { useAuth } from "../../auth/AuthContext";
import { mockDataContext } from "../context/TourismDataContext";
import { TourismChartPaletteContext, useTourismChartPalette } from "../theme/chartPalette";
import { TourismThemePreviewContext, useTourismShellTheme } from "../theme/themePreview";
import { deriveTourismTheme } from "../theme/deriveTourismTheme";

jest.mock(
  "react-router-dom",
  () => ({ Navigate: ({ to }) => <div data-testid="redirect" data-to={to} /> }),
  { virtual: true }
);
jest.mock("../../auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../context/TourismDataContext", () => {
  const React = require("react");
  const mockDataContext = React.createContext(null);
  return { mockDataContext, useTourismData: () => React.useContext(mockDataContext) };
});

const GREEN = "#2FA34A";
const ORANGE = "#EF7C1F";
const ORIGINAL = { hex: GREEN, label: "Original (Green)" };
const savedTheme = (overrides = {}) => ({
  primary_color: GREEN,
  mobile_follows_web: true,
  mobile_primary_color: "",
  saved_colors: [ORIGINAL],
  updated_at: "2026-10-03T10:00:00+08:00",
  ...overrides,
});

function ChartProbe() {
  const palette = useTourismChartPalette();
  return <span data-testid="chart-probe">{palette ? palette.series[0] : "none"}</span>;
}

// The same wiring AppShell uses: saved theme + preview on the shell element,
// palette read back from it, data context holding the theme.
function Shell({ initialTheme, onSave, showSettings = true }) {
  const [theme, setTheme] = useState(initialTheme);
  const saveTheme = useCallback(
    async (payload) => {
      const response = await onSave(payload);
      setTheme(response);
      return response;
    },
    [onSave]
  );
  const { shellRef, chartPalette, preview } = useTourismShellTheme(theme);
  return (
    <div className="tourism-layout" data-testid="shell" ref={shellRef}>
      <TourismThemePreviewContext.Provider value={preview}>
        <TourismChartPaletteContext.Provider value={chartPalette}>
          <mockDataContext.Provider value={{ theme, saveTheme }}>
            {showSettings ? <Settings /> : null}
            <ChartProbe />
          </mockDataContext.Provider>
        </TourismChartPaletteContext.Provider>
      </TourismThemePreviewContext.Provider>
    </div>
  );
}

const shellPrimary = () => screen.getByTestId("shell").style.getPropertyValue("--th-primary");
const pick = (hex) => fireEvent.change(screen.getByLabelText("System colour", { selector: "input" }), { target: { value: hex.toLowerCase() } });

beforeEach(() => {
  useAuth.mockReturnValue({ role: "admin" });
});

describe("Settings access", () => {
  test("a non-admin is sent away and never sees the page", () => {
    useAuth.mockReturnValue({ role: "tourism" });
    render(<Shell initialTheme={savedTheme()} onSave={jest.fn()} />);
    expect(screen.getByTestId("redirect").getAttribute("data-to")).toBe("/");
    expect(screen.queryByLabelText("System colour", { selector: "input" })).toBeNull();
  });
});

describe("Settings: system colour", () => {
  test("picking a colour previews it on the whole shell without saving", () => {
    const onSave = jest.fn();
    render(<Shell initialTheme={savedTheme()} onSave={onSave} />);
    expect(shellPrimary()).toBe(GREEN);

    pick(ORANGE);

    expect(shellPrimary()).toBe(ORANGE);
    expect(screen.getByTestId("shell").style.getPropertyValue("--th-primary-tint")).toBe(
      deriveTourismTheme(ORANGE)["--th-primary-tint"]
    );
    expect(screen.getByLabelText("System colour hex").value).toBe(ORANGE);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("the hex field previews too, and rejects a malformed value", () => {
    render(<Shell initialTheme={savedTheme()} onSave={jest.fn()} />);
    fireEvent.change(screen.getByLabelText("System colour hex"), { target: { value: "ef7c1f" } });
    expect(shellPrimary()).toBe(ORANGE);
    fireEvent.change(screen.getByLabelText("System colour hex"), { target: { value: "#12" } });
    expect(screen.getByText("Enter a colour as #RRGGBB, for example #EF7C1F.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
  });

  test("cancel restores the saved colour", () => {
    render(<Shell initialTheme={savedTheme()} onSave={jest.fn()} />);
    pick(ORANGE);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(shellPrimary()).toBe(GREEN);
    expect(screen.getByLabelText("System colour hex").value).toBe(GREEN);
  });

  test("leaving the page without saving drops the preview", () => {
    const { rerender } = render(<Shell initialTheme={savedTheme()} onSave={jest.fn()} />);
    pick(ORANGE);
    expect(shellPrimary()).toBe(ORANGE);
    rerender(<Shell initialTheme={savedTheme()} onSave={jest.fn()} showSettings={false} />);
    expect(shellPrimary()).toBe(GREEN);
  });

  test("reset to original green previews green until saved", () => {
    render(<Shell initialTheme={savedTheme({ primary_color: ORANGE })} onSave={jest.fn()} />);
    expect(shellPrimary()).toBe(ORANGE);
    fireEvent.click(screen.getByRole("button", { name: "Reset to original green" }));
    expect(shellPrimary()).toBe(GREEN);
    expect(screen.getByRole("status").textContent).toMatch(/Press Save to keep it/);
  });
});

describe("Settings: saving", () => {
  test("save sends the right payload and the app updates without a reload", async () => {
    const onSave = jest.fn(async (payload) => ({ ...payload, updated_at: "2026-10-03T11:00:00+08:00" }));
    render(<Shell initialTheme={savedTheme()} onSave={onSave} />);
    const pickerBefore = screen.getByLabelText("System colour", { selector: "input" });

    pick(ORANGE);
    fireEvent.click(screen.getByRole("radio", { name: "Use a different colour for the app" }));
    fireEvent.change(screen.getByLabelText("Mobile app colour hex"), { target: { value: "#1E40AF" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      primary_color: ORANGE,
      mobile_follows_web: false,
      mobile_primary_color: "#1E40AF",
      saved_colors: [ORIGINAL],
    });
    // Same DOM, now driven by the SAVED theme (no preview left), charts included.
    expect(screen.getByLabelText("System colour", { selector: "input" })).toBe(pickerBefore);
    expect(shellPrimary()).toBe(ORANGE);
    expect(screen.getByTestId("chart-probe").textContent).toBe(deriveTourismTheme(ORANGE)["--th-chart-1"]);
    expect(screen.getByRole("status").textContent).toMatch(/Saved/);
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(true);
  });

  test("a failed save keeps the preview and says so", async () => {
    const onSave = jest.fn(async () => {
      throw new Error("Only the system admin can change the tourism theme.");
    });
    render(<Shell initialTheme={savedTheme()} onSave={onSave} />);
    pick(ORANGE);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(screen.getByRole("status").textContent).toBe("Only the system admin can change the tourism theme.");
    expect(shellPrimary()).toBe(ORANGE);
  });

  test("the chart colours on the page follow the preview", () => {
    render(<Shell initialTheme={savedTheme()} onSave={jest.fn()} />);
    pick(ORANGE);
    const swatches = within(screen.getByTestId("chart-palette")).getAllByTitle(/#/);
    expect(swatches.map((s) => s.getAttribute("title"))).toEqual(
      [1, 2, 3, 4, 5].map((n) => deriveTourismTheme(ORANGE)[`--th-chart-${n}`])
    );
  });
});

describe("Settings: saved colours", () => {
  test("the original green is first and cannot be removed", () => {
    // Even if the stored list lost it, the page puts it back first.
    render(<Shell initialTheme={savedTheme({ saved_colors: [{ hex: ORANGE, label: "Mayor orange" }] })} onSave={jest.fn()} />);
    const items = within(screen.getByRole("list", { name: "Saved colours" })).getAllByRole("listitem");
    expect(items[0].textContent).toContain("Original (Green)");
    expect(screen.queryByRole("button", { name: "Remove Original (Green)" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Mayor orange" })).toBeTruthy();
  });

  test("adding and removing a colour goes into the save payload", async () => {
    const onSave = jest.fn(async (payload) => payload);
    render(<Shell initialTheme={savedTheme()} onSave={onSave} />);
    pick(ORANGE);
    fireEvent.change(screen.getByLabelText("Saved colour name"), { target: { value: "Mayor orange" } });
    fireEvent.click(screen.getByRole("button", { name: "Add current colour" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(onSave.mock.calls[0][0].saved_colors).toEqual([ORIGINAL, { hex: ORANGE, label: "Mayor orange" }]);
  });

  test(`the ${MAX_SAVED_COLORS}-colour limit is enforced with a clear message`, () => {
    const tenMore = Array.from({ length: MAX_SAVED_COLORS - 2 }, (_, i) => ({
      hex: `#1${i}20A0`.slice(0, 7).toUpperCase(),
      label: `Colour ${i + 1}`,
    }));
    render(<Shell initialTheme={savedTheme({ saved_colors: [ORIGINAL, ...tenMore] })} onSave={jest.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();

    pick(ORANGE);
    fireEvent.click(screen.getByRole("button", { name: "Add current colour" }));

    expect(within(screen.getByRole("list", { name: "Saved colours" })).getAllByRole("listitem")).toHaveLength(MAX_SAVED_COLORS);
    expect(screen.getByRole("button", { name: "Add current colour" }).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe(
      "You can keep up to 12 saved colours, including the Original (Green). Remove one to add another."
    );
  });
});

describe("Settings: contrast warning", () => {
  test("warns for a light colour", () => {
    render(<Shell initialTheme={savedTheme()} onSave={jest.fn()} />);
    pick("#FFD84D");
    const message = screen.getByTestId("contrast-message");
    expect(message.className).toMatch(/severe/);
    expect(message.textContent).toMatch(/very hard to read \(1\.4:1\)/);
    expect(screen.getByRole("button", { name: "Save" }).disabled).toBe(false); // warns, never blocks
  });

  test("does not warn for a dark colour", () => {
    render(<Shell initialTheme={savedTheme()} onSave={jest.fn()} />);
    pick("#1E40AF");
    const message = screen.getByTestId("contrast-message");
    expect(message.className).not.toMatch(/poor|severe/);
    expect(message.textContent).toMatch(/easy to read/);
  });

  test("orange is flagged as hard to read; the original green is not", () => {
    render(<Shell initialTheme={savedTheme()} onSave={jest.fn()} />);
    expect(screen.getByTestId("contrast-message").className).toMatch(/fair/);
    pick(ORANGE);
    expect(screen.getByTestId("contrast-message").className).toMatch(/poor/);
  });
});
