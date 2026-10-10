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
  const calls = [];
  return {
    canvas,
    calls,
    config: { type },
    data: {
      labels: extra.labels || ["a", "b"],
      datasets: [{ data: [1, 2], ...(extra.barThickness ? { barThickness: extra.barThickness } : {}) }],
    },
    options: {
      plugins: { legend: legendPosition ? { display: true, position: legendPosition } : undefined },
      ...(extra.indexAxis ? { indexAxis: extra.indexAxis, scales: { y: { ticks: { font: { size: 11 } } } } } : {}),
      ...(extra.xTicks ? { scales: { x: { ticks: { font: { size: 15 } } }, y: { ticks: { font: { size: 16 } } } } } : {}),
    },
    stop: jest.fn(() => calls.push("stop")),
    resize: jest.fn((...args) => calls.push(args.length ? "resize" : "resize back")),
    update: jest.fn((mode) => calls.push(`update ${mode}`)),
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

  it("stops a running animation and draws the final state at once, so a just-created chart is not printed blank", () => {
    const { charts, printMedia } = setup();

    printMedia(true);
    window.dispatchEvent(new Event("afterprint"));

    expect(charts.main.calls).toEqual(["stop", "resize", "update none", "stop", "resize back", "update none"]);
    expect(charts.pie.calls).toEqual(["stop", "resize", "update none", "stop", "resize back", "update none"]);
  });

  it("wraps name labels level on paper and leaves date labels to rotate, then puts both back", () => {
    const root = document.createElement("div");
    const nameBox = box("report-chart-area", 630, 300);
    nameBox.dataset.printLabels = "wrap";
    const dateBox = box("report-chart-area", 630, 300);
    dateBox.dataset.printLabels = "rotate";
    root.append(nameBox, dateBox);
    document.body.append(root);
    const resorts = [
      "Dona Choleng Camping Resort", "Jovencio's Resort", "Rio Del Sol Beach Resort", "Orlan Beach Resort",
      "Villa Noe Beach", "Villa Pilarosa Beach Resort", "Nenita Del Sol",
    ];
    const names = fakeChart("bar", nameBox, undefined, { xTicks: true, labels: resorts });
    const dates = fakeChart("bar", dateBox, undefined, { xTicks: true, labels: ["Sep 18, 2026", "Sep 22, 2026"] });
    let listener;
    window.matchMedia = jest.fn(() => ({ addEventListener: (e, fn) => { listener = fn; }, removeEventListener: jest.fn() }));
    watchPrint(() => root, () => [names, dates]);

    listener({ matches: true });

    const x = names.options.scales.x.ticks;
    expect([x.maxRotation, x.minRotation, x.autoSkip]).toEqual([0, 0, false]);
    // 630px over seven columns: ten characters a line at the print font.
    const label = (i) => x.callback.call({ getLabelForValue: (v) => resorts[v] }, i);
    expect(label(0)).toEqual(["Dona", "Choleng", "Camping", "Resort"]);
    expect(label(2)).toEqual(["Rio Del", "Sol Beach", "Resort"]);
    expect(label(6)).toEqual(["Nenita Del", "Sol"]);
    expect(dates.options.scales.x.ticks).toEqual({ font: { size: 15 } });

    window.dispatchEvent(new Event("afterprint"));

    expect(names.options.scales.x.ticks).toEqual({ font: { size: 15 } });
    expect(dates.options.scales.x.ticks).toEqual({ font: { size: 15 } });
  });

  it("keeps rotation for name labels when the columns are too narrow to wrap", () => {
    const root = document.createElement("div");
    const nameBox = box("report-chart-area", 630, 300);
    nameBox.dataset.printLabels = "wrap";
    root.append(nameBox);
    document.body.append(root);
    const many = fakeChart("bar", nameBox, undefined, { xTicks: true, labels: Array.from({ length: 20 }, (_, i) => `Province ${i}`) });
    let listener;
    window.matchMedia = jest.fn(() => ({ addEventListener: (e, fn) => { listener = fn; }, removeEventListener: jest.fn() }));
    watchPrint(() => root, () => [many]);

    listener({ matches: true });

    expect(many.options.scales.x.ticks).toEqual({ font: { size: 15 } });
  });

  it("wraps only labels longer than one printed line", () => {
    expect(wrapLabel("Quezon")).toBe("Quezon");
    expect(wrapLabel("Villa Escaparde Camping and Beach Resort")).toEqual(["Villa Escaparde", "Camping and", "Beach Resort"]);
    expect(wrapLabel("Villa Escaparde Camping and Beach Resort", 8, 4)).toEqual(["Villa", "Escaparde", "Camping", "and Beach Resort"]);
  });

  it("does nothing on screen", () => {
    const { charts, printMedia, unwatch } = setup();

    printMedia(false);
    unwatch();

    Object.values(charts).forEach((chart) => expect(chart.resize).not.toHaveBeenCalled());
  });
});
