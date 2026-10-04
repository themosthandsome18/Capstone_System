import {
  editDiscountedCount,
  effectiveDiscountedCount,
  entranceFeeBreakdown,
  entranceFeeSummary,
  followDiscountedSuggestion,
  isDiscountedCountEdited,
  suggestedDiscountedCount,
} from "./entranceFee";

// Ten visitors, so the cap only matters where a test says so.
const blankForm = {
  filipino_count: "10",
  foreigner_count: "0",
  age_0_7: "0",
  age_60_above: "0",
  special_group_count: "0",
  discounted_count: "0",
  discounted_edited: false,
};

// Applies one field change the way BookingManagement's updateField does.
function change(form, field, value) {
  if (field === "discounted_count") {
    return editDiscountedCount(form, value);
  }
  return followDiscountedSuggestion({ ...form, [field]: value });
}

describe("entranceFeeBreakdown", () => {
  it("charges everyone the regular rate when no one is discounted", () => {
    expect(entranceFeeBreakdown(5, 0)).toEqual({
      regularCount: 5,
      discountedCount: 0,
      regularAmount: 400,
      discountedAmount: 0,
      total: 400,
    });
  });

  it("charges everyone the discounted rate when all are discounted", () => {
    expect(entranceFeeBreakdown(3, 3).total).toBe(192);
  });

  it("splits a mixed group", () => {
    expect(entranceFeeBreakdown(4, 3)).toEqual({
      regularCount: 1,
      discountedCount: 3,
      regularAmount: 80,
      discountedAmount: 192,
      total: 272,
    });
  });

  it("is zero for zero visitors", () => {
    expect(entranceFeeBreakdown(0, 0).total).toBe(0);
  });
});

describe("entranceFeeSummary", () => {
  it("shows the total and how it is made up", () => {
    expect(entranceFeeSummary(4, 4)).toBe("Entrance fee: PHP 256 (0 x PHP 80 + 4 x PHP 64)");
    expect(entranceFeeSummary(4, 3)).toBe("Entrance fee: PHP 272 (1 x PHP 80 + 3 x PHP 64)");
  });

  it("shows all regular when no one is discounted", () => {
    expect(entranceFeeSummary(5, 0)).toBe("Entrance fee: PHP 400 (5 x PHP 80 + 0 x PHP 64)");
  });

  it("groups thousands and is zero for no visitors", () => {
    expect(entranceFeeSummary(20, 5)).toBe("Entrance fee: PHP 1,520 (15 x PHP 80 + 5 x PHP 64)");
    expect(entranceFeeSummary(0, 0)).toBe("Entrance fee: PHP 0 (0 x PHP 80 + 0 x PHP 64)");
  });
});

describe("suggested discounted count", () => {
  it("adds children 0-7, seniors 60+ and special needs", () => {
    expect(
      suggestedDiscountedCount({ ...blankForm, age_0_7: "2", age_60_above: "1", special_group_count: "1" })
    ).toBe(4);
  });

  it("includes special needs on its own", () => {
    expect(suggestedDiscountedCount({ ...blankForm, special_group_count: "2" })).toBe(2);
  });

  it("is capped at the visitor total", () => {
    // 3 visitors: 1 child, 2 seniors, and both seniors also recorded as special needs.
    const form = {
      ...blankForm,
      filipino_count: "2",
      foreigner_count: "1",
      age_0_7: "1",
      age_60_above: "2",
      special_group_count: "2",
    };

    expect(suggestedDiscountedCount(form)).toBe(3);
  });
});

describe("discounted count auto-fill", () => {
  it("follows the ages and special needs while the user has not edited it", () => {
    let form = change(blankForm, "age_0_7", "2");
    expect(form.discounted_count).toBe("2");

    form = change(form, "age_60_above", "1");
    expect(form.discounted_count).toBe("3");

    form = change(form, "special_group_count", "1");
    expect(form.discounted_count).toBe("4");

    form = change(form, "filipino_count", "3");
    expect(form.discounted_count).toBe("3");
  });

  it("stops following after a manual edit and keeps the user's value", () => {
    let form = change(blankForm, "age_0_7", "2");
    form = change(form, "discounted_count", "4");

    form = change(form, "age_60_above", "1");
    form = change(form, "special_group_count", "2");
    form = change(form, "age_0_7", "0");

    expect(form.discounted_count).toBe("4");
    expect(effectiveDiscountedCount(form)).toBe(4);
  });

  it("resumes following once the user clears it", () => {
    let form = change(blankForm, "age_0_7", "2");
    form = change(form, "discounted_count", "4");

    form = change(form, "discounted_count", "");
    expect(form.discounted_count).toBe("");
    expect(effectiveDiscountedCount(form)).toBe(2);

    form = change(form, "special_group_count", "1");
    expect(form.discounted_count).toBe("3");
  });

  it("treats a stored record as edited only when its count differs from the suggestion", () => {
    const record = { ...blankForm, age_0_7: "1", age_60_above: "1", special_group_count: "1" };

    expect(isDiscountedCountEdited({ ...record, discounted_count: "3" })).toBe(false);
    expect(isDiscountedCountEdited({ ...record, discounted_count: "2" })).toBe(true);
  });
});
