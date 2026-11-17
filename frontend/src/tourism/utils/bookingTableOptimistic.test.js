import { adjustBookingSummary, applyArchive, applyStatus, settleArchive } from "./bookingTableOptimistic";

const row = (id, extra = {}) => ({ survey_id: id, status: "pending", is_archived: false, archived_at: null, ...extra });
const table = (rows, extra = {}) => ({
  filters: { archived: "active", status: "" },
  summary: { verifiedEntries: 10, pending: 4, arrived: 5, noShow: 1 },
  archivedCount: 0,
  pagination: { page: 1, pageSize: 10, total: rows.length, totalPages: 1, hasNext: false, showingStart: 1, showingEnd: rows.length },
  rows,
  ...extra,
});
const ids = (t) => t.rows.map((r) => r.survey_id);

describe("applyArchive", () => {
  it("Active view: the row leaves, '1 archived', the total and the showing numbers follow, the cards are not touched", () => {
    const before = table([row("A"), row("B"), row("C")]);
    const { next } = applyArchive(before, "B", true, "T");
    expect(ids(next)).toEqual(["A", "C"]);
    expect(next.archivedCount).toBe(1);
    expect(next.pagination).toMatchObject({ total: 2, showingStart: 1, showingEnd: 2, totalPages: 1 });
    expect(next.summary).toEqual(before.summary);
  });

  it("Archived view: unarchiving removes the row and lowers the count; archiving there is a no-op (it is already archived)", () => {
    const before = table([row("A", { is_archived: true }), row("B", { is_archived: true })], { archivedCount: 2, filters: { archived: "archived" } });
    const { next } = applyArchive(before, "A", false);
    expect(ids(next)).toEqual(["B"]);
    expect(next.archivedCount).toBe(1);
    expect(applyArchive(before, "A", true).next).toBe(before);
  });

  it("All view: the row stays and only its mark changes", () => {
    const before = table([row("A"), row("B", { is_archived: true })], { archivedCount: 1, filters: { archived: "all" } });
    const { next } = applyArchive(before, "A", true, "T");
    expect(ids(next)).toEqual(["A", "B"]);
    expect(next.rows[0]).toMatchObject({ is_archived: true, archived_at: "T" });
    expect(next.archivedCount).toBe(2);
    expect(next.pagination).toBe(before.pagination);
  });

  it("the count never goes below zero", () => {
    const before = table([row("A", { is_archived: true })], { archivedCount: 0, filters: { archived: "archived" } });
    expect(applyArchive(before, "A", false).next.archivedCount).toBe(0);
  });

  it("a row that is not on the page changes nothing", () => {
    const before = table([row("A")]);
    expect(applyArchive(before, "Z", true).next).toBe(before);
  });

  it("undo puts the row back in the same place and the count and totals as they were", () => {
    const before = table([row("A"), row("B"), row("C")], { archivedCount: 3 });
    const { next, undo } = applyArchive(before, "B", true);
    const back = undo(next);
    expect(ids(back)).toEqual(["A", "B", "C"]);
    expect(back.archivedCount).toBe(3);
    expect(back.pagination).toMatchObject({ total: 3, showingEnd: 3 });
    expect(back.rows[1]).toEqual(before.rows[1]);
  });

  it("undo in the All view takes the mark off and lowers the count", () => {
    const before = table([row("A"), row("B")], { filters: { archived: "all" } });
    const { next, undo } = applyArchive(before, "A", true);
    const back = undo(next);
    expect(back.rows[0].is_archived).toBe(false);
    expect(back.archivedCount).toBe(0);
  });

  it("undo does not touch a list the server has since replaced (the row is there, showing what the server says)", () => {
    const before = table([row("A"), row("B")]);
    const { undo } = applyArchive(before, "B", true);
    const fromServer = table([row("A"), row("B")], { archivedCount: 7 });
    expect(undo(fromServer)).toBe(fromServer);
  });

  it("undo twice does not put the row in twice", () => {
    const before = table([row("A"), row("B")]);
    const { next, undo } = applyArchive(before, "B", true);
    const once = undo(next);
    expect(ids(undo(once))).toEqual(["A", "B"]);
  });

  it("two changes made one after the other come back one after the other, to exactly the start", () => {
    const start = table([row("A"), row("B"), row("C")], { archivedCount: 1 });
    const first = applyArchive(start, "A", true);
    const second = applyArchive(first.next, "C", true);
    expect(ids(second.next)).toEqual(["B"]);
    expect(second.next.archivedCount).toBe(3);
    const back = first.undo(second.undo(second.next));
    expect(ids(back)).toEqual(["A", "B", "C"]);
    expect(back.archivedCount).toBe(1);
    expect(back.pagination.total).toBe(3);
  });

  it("the page numbers follow a removal on a later page", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`R${i}`));
    const before = table(rows, { pagination: { page: 2, pageSize: 10, total: 20, totalPages: 2, hasNext: false, showingStart: 11, showingEnd: 20 } });
    const { next } = applyArchive(before, "R3", true);
    expect(next.pagination).toMatchObject({ total: 19, totalPages: 2, showingStart: 11, showingEnd: 19 });
  });
});

describe("settleArchive", () => {
  it("takes the server's count and the record's state", () => {
    const shown = table([row("A", { is_archived: true, archived_at: "guess" })], { archivedCount: 4, filters: { archived: "all" } });
    const settled = settleArchive(shown, { survey_id: "A", is_archived: true, archived_at: "real", archivedCount: 9 });
    expect(settled.archivedCount).toBe(9);
    expect(settled.rows[0].archived_at).toBe("real");
  });

  it("keeps the guess when the server sends no usable count", () => {
    const shown = table([row("A")], { archivedCount: 4 });
    expect(settleArchive(shown, { survey_id: "A", is_archived: false }).archivedCount).toBe(4);
    expect(settleArchive(shown, undefined).archivedCount).toBe(4);
  });
});

describe("applyStatus", () => {
  it("moves the row's status and the cards at once; undo puts both back", () => {
    const before = table([row("A"), row("B")]);
    const { next, undo } = applyStatus(before, "A", "arrived");
    expect(next.rows[0].status).toBe("arrived");
    expect(next.summary).toEqual({ verifiedEntries: 10, pending: 3, arrived: 6, noShow: 1 });
    const back = undo(next);
    expect(back.rows[0].status).toBe("pending");
    expect(back.summary).toEqual(before.summary);
  });

  it("a status filter removes the row, undo returns it to its place and the total", () => {
    const before = table([row("A"), row("B"), row("C")], { filters: { archived: "active", status: "pending" } });
    const { next, undo } = applyStatus(before, "B", "no_show");
    expect(ids(next)).toEqual(["A", "C"]);
    expect(next.summary.noShow).toBe(2);
    const back = undo(next);
    expect(ids(back)).toEqual(["A", "B", "C"]);
    expect(back.summary).toEqual(before.summary);
    expect(back.pagination.total).toBe(3);
  });

  it("the same status changes nothing, and undo does not move the cards", () => {
    const before = table([row("A", { status: "arrived" })]);
    const { next, undo } = applyStatus(before, "A", "arrived");
    expect(next.summary).toEqual(before.summary);
    expect(undo(next).summary).toEqual(before.summary);
  });

  it("undo leaves a list the server has replaced alone", () => {
    const before = table([row("A")]);
    const { undo } = applyStatus(before, "A", "arrived");
    const fromServer = table([row("A")], { summary: { verifiedEntries: 11, pending: 5, arrived: 5, noShow: 1 } });
    expect(undo(fromServer)).toBe(fromServer);
  });
});

describe("adjustBookingSummary", () => {
  it("never goes below zero", () => {
    expect(adjustBookingSummary({ pending: 0, arrived: 0, noShow: 0 }, "pending", "arrived")).toEqual({ pending: 0, arrived: 1, noShow: 0 });
  });
});
