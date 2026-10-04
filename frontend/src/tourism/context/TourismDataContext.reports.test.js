import { act, render, waitFor } from "@testing-library/react";
import { TourismDataProvider, useTourismData } from "./TourismDataContext";
import { tourismApi } from "../services/tourismApi";

// Every API method resolves to an empty object unless a test says otherwise.
jest.mock("../services/tourismApi", () => {
  const methods = {};
  return {
    tourismApi: new Proxy(methods, {
      get(target, name) {
        if (!target[name]) {
          target[name] = jest.fn(() => Promise.resolve({}));
        }
        return target[name];
      },
    }),
  };
});

const LOADED_ANSWERS = [{ id: "top_resort", question: "Which resort?", answer: "Alpha leads." }];

function renderProvider() {
  const context = {};
  function Capture() {
    Object.assign(context, useTourismData());
    return null;
  }
  render(
    <TourismDataProvider>
      <Capture />
    </TourismDataProvider>
  );
  return context;
}

beforeEach(() => {
  tourismApi.getBootstrapData.mockResolvedValue({
    referenceTables: { resorts: [] },
    reportData: { type: "resort", filters: { year: "2026" }, rows: [], questionAnswers: LOADED_ANSWERS },
  });
});

describe("refreshReportData", () => {
  it("keeps the loaded question answers on a report-only request", async () => {
    const context = renderProvider();
    await waitFor(() => expect(context.reportData.questionAnswers).toEqual(LOADED_ANSWERS));
    tourismApi.getReportsData.mockResolvedValue({
      type: "daily",
      filters: { year: "2026", type: "daily" },
      rows: [{ id: "2026-09-22", name: "Sep 22", visitors: 4 }],
      questionAnswers: [],
    });

    await act(async () => {
      await context.refreshReportData({ year: "2026", type: "daily", include_questions: false });
    });

    expect(context.reportData.type).toBe("daily");
    expect(context.reportData.rows).toHaveLength(1);
    expect(context.reportData.questionAnswers).toEqual(LOADED_ANSWERS);
  });

  it("replaces the question answers when they are requested", async () => {
    const context = renderProvider();
    await waitFor(() => expect(context.reportData.questionAnswers).toEqual(LOADED_ANSWERS));
    const fresh = [{ id: "top_resort", question: "Which resort?", answer: "Bravo leads." }];
    tourismApi.getReportsData.mockResolvedValue({ type: "resort", rows: [], questionAnswers: fresh });

    await act(async () => {
      await context.refreshReportData({ year: "2025", type: "resort", include_questions: true });
    });

    expect(context.reportData.questionAnswers).toEqual(fresh);
  });
});
