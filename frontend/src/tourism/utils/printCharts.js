// Redraws the Reports charts at their printed size, and puts them back after.
//
// Chart.js only resizes through a ResizeObserver, which printing does not
// trigger, so without this a chart prints at its on-screen pixel size and the
// print stylesheet can only scale it down (small, soft text). The redraw runs on
// the print media change: in Chrome and Edge it fires after `beforeprint`, with
// the page already laid out for paper, so each chart can measure its printed
// box. At `beforeprint` the page still has its screen layout, so it is not used
// for sizing. `afterprint` and the change back to screen restore every chart.
// If a browser fires neither, the print stylesheet's scale-down still applies.
// Chrome and Edge print a canvas redrawn this way as vector shapes and text, so
// no extra pixel ratio is needed: printing at ratio 2 or 1 gave the same output.
//
// A chart created moments before printing (after a tab switch or Apply
// Filters, or the all-reports block) is still in its opening animation. Chart.js
// then leaves every redraw to its next animation frame, which never comes while
// the browser prepares the print, so the chart printed blank. The redraw stops
// any animation and draws the final state at once (stop, resize, update "none").

// The main report chart's printed height, in CSS pixels. The print stylesheet
// gives every report chart box this height (Tourism_index.css, Phase 1b), so
// the redraw never changes the layout; keep the two equal.
export const PRINT_MAIN_CHART_HEIGHT = 300;

const LEGEND_BELOW = new Set(["pie", "doughnut"]);
// A label longer than this (in characters) wraps onto two lines on a printed
// horizontal bar chart: Chart.js gives a narrow chart's label axis only about
// half its width, which cut "Dona Choleng Camping Resort" short.
const PRINT_LABEL_LINE = 16;

// Name labels under a printed column chart (Resort, Origin, Purpose, Vehicle,
// Boat, No-show: boxes marked data-print-labels="wrap") are set level on up to
// four lines instead of rotated. Rotated, seven resort names took the left of
// the chart and left the plot 464px of a 630px chart. A line holds what fits
// one column at the 15px tick font (about 8px a character, 60px for the value
// axis); columns too narrow for 8 characters keep Chart.js's rotation and
// skipping. Date labels (Daily, Monthly, Yearly) always keep them.
const PRINT_CHAR_PX = 8;
const PRINT_VALUE_AXIS_PX = 60;
const PRINT_MIN_LINE_CHARS = 8;
const PRINT_MAX_LABEL_LINES = 4;

function legendOf(chart) {
  return chart.options?.plugins?.legend;
}

export function wrapLabel(label, max = PRINT_LABEL_LINE, maxLines = Infinity) {
  const text = String(label ?? "");
  if (text.length <= max) {
    return text;
  }
  const lines = [];
  text.split(/\s+/).forEach((word) => {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= max) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  });
  // Past the last line, the rest of the label stays on it.
  return lines.length > maxLines
    ? [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")]
    : lines;
}

function restoreProperty(target, key, value) {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
}

function wrappedTick(value) {
  return wrapLabel(this.getLabelForValue(value));
}

export function watchPrint(getRoot, getCharts) {
  const saved = new Map();

  function fit() {
    const root = getRoot();
    if (!root) {
      return;
    }
    getCharts().forEach((chart) => {
      const box = chart.canvas?.parentElement;
      if (!box || !root.contains(chart.canvas)) {
        return;
      }
      const width = box.clientWidth;
      // Key Insights boxes are sized by the print stylesheet (they fill their
      // card); the main chart's box takes the chart's height.
      const height = box.classList.contains("insight-chart-box") ? box.clientHeight : PRINT_MAIN_CHART_HEIGHT;
      if (!width || !height) {
        return;
      }
      const legend = legendOf(chart);
      const datasets = chart.data?.datasets || [];
      const yTicks = chart.options.indexAxis === "y" ? chart.options.scales?.y?.ticks : null;
      const xTicks =
        box.dataset?.printLabels === "wrap" && chart.options.indexAxis !== "y" ? chart.options.scales?.x?.ticks : null;
      const columns = Math.max(1, (chart.data?.labels || []).length);
      const lineChars = Math.floor((width - PRINT_VALUE_AXIS_PX) / columns / PRINT_CHAR_PX);
      const wrapX = Boolean(xTicks) && lineChars >= PRINT_MIN_LINE_CHARS;
      if (!saved.has(chart)) {
        saved.set(chart, {
          position: legend?.position,
          thickness: datasets.map((dataset) => dataset.barThickness),
          tickCallback: yTicks ? yTicks.callback : undefined,
          xTicks: wrapX
            ? {
                callback: xTicks.callback,
                maxRotation: xTicks.maxRotation,
                minRotation: xTicks.minRotation,
                autoSkip: xTicks.autoSkip,
              }
            : null,
        });
      }
      if (legend && LEGEND_BELOW.has(chart.config.type)) {
        legend.position = "bottom";
      }
      // A fixed bar thickness (the resort chart's 80px) overlaps at paper
      // width; Chart.js sizes the bars to fit instead.
      datasets.forEach((dataset) => {
        delete dataset.barThickness;
      });
      if (yTicks) {
        yTicks.callback = wrappedTick;
      }
      if (wrapX) {
        xTicks.callback = function wrappedNameTick(value) {
          return wrapLabel(this.getLabelForValue(value), lineChars, PRINT_MAX_LABEL_LINES);
        };
        xTicks.maxRotation = 0;
        xTicks.minRotation = 0;
        xTicks.autoSkip = false;
      }
      chart.stop();
      chart.resize(width, height);
      chart.update("none");
    });
  }

  function restore() {
    saved.forEach((state, chart) => {
      const legend = legendOf(chart);
      if (legend && state.position !== undefined) {
        legend.position = state.position;
      }
      (chart.data?.datasets || []).forEach((dataset, index) => {
        if (state.thickness[index] !== undefined) {
          dataset.barThickness = state.thickness[index];
        }
      });
      const yTicks = chart.options.indexAxis === "y" ? chart.options.scales?.y?.ticks : null;
      if (yTicks) {
        restoreProperty(yTicks, "callback", state.tickCallback);
      }
      const xTicks = state.xTicks ? chart.options.scales?.x?.ticks : null;
      if (xTicks) {
        Object.entries(state.xTicks).forEach(([key, value]) => restoreProperty(xTicks, key, value));
      }
      chart.stop();
      chart.resize();
      chart.update("none");
    });
    saved.clear();
  }

  const media = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
  const onMediaChange = (event) => (event.matches ? fit() : restore());
  media?.addEventListener?.("change", onMediaChange);
  window.addEventListener("afterprint", restore);

  return function unwatch() {
    media?.removeEventListener?.("change", onMediaChange);
    window.removeEventListener("afterprint", restore);
    restore();
  };
}
