import {
  editDiscountedCount,
  effectiveDiscountedCount,
  entranceFeeBreakdown,
  followDiscountedSuggestion,
  isDiscountedCountEdited,
  suggestedDiscountedCount,
} from "./entranceFee";

const blankForm = {
  age_0_7: "0",
  age_60_above: "0",
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

describe("discounted count auto-fill", () => {
  it("suggests children 0-7 plus seniors 60+", () => {
    expect(suggestedDiscountedCount({ age_0_7: "2", age_60_above: "1" })).toBe(3);
  });

  it("follows the ages while the user has not edited it", () => {
    let form = change(blankForm, "age_0_7", "2");
    expect(form.discounted_count).toBe("2");

    form = change(form, "age_60_above", "1");
    expect(form.discounted_count).toBe("3");

    form = change(form, "age_0_7", "1");
    expect(form.discounted_count).toBe("2");
  });

  it("stops following after a manual edit and keeps the user's value", () => {
    let form = change(blankForm, "age_0_7", "2");
    form = change(form, "discounted_count", "4");

    form = change(form, "age_60_above", "1");
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

    form = change(form, "age_60_above", "1");
    expect(form.discounted_count).toBe("3");
  });

  it("treats a stored record as edited only when its count differs from the ages", () => {
    expect(isDiscountedCountEdited({ age_0_7: "1", age_60_above: "1", discounted_count: "2" })).toBe(false);
    expect(isDiscountedCountEdited({ age_0_7: "1", age_60_above: "1", discounted_count: "3" })).toBe(true);
  });
});
