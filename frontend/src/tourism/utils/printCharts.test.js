import { PRINT_MAIN_CHART_HEIGHT, watchPrint, wrapLabel } from "./printCharts";

function box(className, width, height) {
  const element = document.createElement("div");
  element.className = className;
  Object.defineProperty(element, "clientWidth", { value: width });
  Object.defineProperty(element, "clientHeight", { value: height });
  return element;
}

function fakeChart(type, parent, legendPosition, extra = {}) {
  const canvas = document.createElement("canvas");
  parent.appendChild(canvas);
  return {
    canvas,
    config: { type },
    data: { datasets: [{ data: [1, 2], ...(extra.barThickness ? { barThickness: extra.barThickness } : {}) }] },
    options: {
      plugins: { legend: legendPosition ? { display: true, position: legendPosition } : undefined },
      ...(extra.indexAxis ? { indexAxis: extra.indexAxis, scales: { y: { ticks: { font: { size: 11 } } } } } : {}),
    },
    resize: jest.fn(),
  };
}

function setup() {
  const root = document.createElement("div");
  const mainBox = box("report-chart-area", 630, 216);
  const pieBox = box("insight-chart-box", 277, 260);
  const barBox = box("insight-chart-box", 277, 240);
  root.append(mainBox, pieBox, barBox);
  const outside = box("insight-chart-box", 500, 500);
  document.body.append(root, outside);
  const charts = {
    main: fakeChart("bar", mainBox, undefined, { barThickness: 80 }),
    pie: fakeChart("pie", pieBox, "right"),
    bar: fakeChart("bar", barBox, undefined, { indexAxis: "y" }),
    other: fakeChart("doughnut", outside, "right"),
  };
  let listener;
  window.matchMedia = jest.fn(() => ({
    addEventListener: (event, fn) => { listener = fn; },
    removeEventListener: jest.fn(),
  }));
  const unwatch = watchPrint(() => root, () => Object.values(charts));
  return { charts, printMedia: (matches) => listener({ matches }), unwatch };
}

describe("watchPrint", () => {
  it("redraws every chart on the page at its printed box size when print media applies", () => {
    const { charts, printMedia } = setup();

    printMedia(true);

    expect(charts.main.resize).toHaveBeenCalledWith(630, PRINT_MAIN_CHART_HEIGHT);
    expect(charts.pie.resize).toHaveBeenCalledWith(277, 260);
    expect(charts.bar.resize).toHaveBeenCalledWith(277, 240);
    expect(charts.other.resize).not.toHaveBeenCalled();
  });

  it("puts pie and doughnut legends below the chart for print, and only those", () => {
    const { charts, printMedia } = setup();

    printMedia(true);

    expect(charts.pie.options.plugins.legend.position).toBe("bottom");
    expect(charts.other.options.plugins.legend.position).toBe("right");
  });

  it("restores the screen size and legend after printing", () => {
    const { charts, printMedia } = setup();
    printMedia(true);

    window.dispatchEvent(new Event("afterprint"));

    expect(charts.pie.options.plugins.legend.position).toBe("right");
    expect(charts.pie.resize).toHaveBeenLastCalledWith();
    expect(charts.main.resize).toHaveBeenLastCalledWith();

    // The media change back to screen after afterprint changes nothing more.
    const calls = charts.pie.resize.mock.calls.length;
    printMedia(false);
    expect(charts.pie.resize.mock.calls.length).toBe(calls);
  });

  it("lets Chart.js size fixed-thickness bars and wraps long ranking labels, then restores both", () => {
    const { charts, printMedia } = setup();

    printMedia(true);

    expect(charts.main.data.datasets[0].barThickness).toBeUndefined();
    const callback = charts.bar.options.scales.y.ticks.callback;
    expect(callback.call({ getLabelForValue: () => "Dona Choleng Camping Resort" }, 0)).toEqual([
      "Dona Choleng",
      "Camping Resort",
    ]);

    window.dispatchEvent(new Event("afterprint"));

    expect(charts.main.data.datasets[0].barThickness).toBe(80);
    expect(charts.bar.options.scales.y.ticks.callback).toBeUndefined();
  });

  it("wraps only labels longer than one printed line", () => {
    expect(wrapLabel("Quezon")).toBe("Quezon");
    expect(wrapLabel("Villa Escaparde Camping and Beach Resort")).toEqual(["Villa Escaparde", "Camping and", "Beach Resort"]);
  });

  it("does nothing on screen", () => {
    const { charts, printMedia, unwatch } = setup();

    printMedia(false);
    unwatch();

    Object.values(charts).forEach((chart) => expect(chart.resize).not.toHaveBeenCalled());
  });
});
