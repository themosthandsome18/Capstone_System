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

// The main report chart's printed height, in CSS pixels.
export const PRINT_MAIN_CHART_HEIGHT = 300;

const LEGEND_BELOW = new Set(["pie", "doughnut"]);
// A label longer than this (in characters) wraps onto two lines on a printed
// horizontal bar chart: Chart.js gives a narrow chart's label axis only about
// half its width, which cut "Dona Choleng Camping Resort" short.
const PRINT_LABEL_LINE = 16;

function legendOf(chart) {
  return chart.options?.plugins?.legend;
}

export function wrapLabel(label, max = PRINT_LABEL_LINE) {
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
  return lines;
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
      if (!saved.has(chart)) {
        saved.set(chart, {
          position: legend?.position,
          thickness: datasets.map((dataset) => dataset.barThickness),
          tickCallback: yTicks ? yTicks.callback : undefined,
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
      chart.resize(width, height);
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
        if (state.tickCallback === undefined) {
          delete yTicks.callback;
        } else {
          yTicks.callback = state.tickCallback;
        }
      }
      chart.resize();
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
