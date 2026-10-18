import { apiRequest } from "../../shared/apiClient";
import { issueSanitationEnforcementStage } from "./sanitationApi";

jest.mock("../../shared/apiClient", () => ({ apiRequest: jest.fn(), buildQueryString: jest.fn() }));
beforeEach(() => jest.resetAllMocks());

test("uses the dedicated POST endpoint with exact stage and expected previous stage", async () => {
  apiRequest.mockResolvedValue({ changed: true });
  await issueSanitationEnforcementStage(7, "warning", "");
  expect(apiRequest).toHaveBeenCalledWith("/sanitation/establishments/7/enforcement-stage/", {
    method: "POST", errorMessage: "Sanitation API request failed.",
    body: JSON.stringify({ stage: "warning", expected_previous_stage: "" }),
  });
});

test("encodes record identity and preserves conflict status for caller handling", async () => {
  const conflict = Object.assign(new Error("Conflict"), { status: 409 });
  apiRequest.mockRejectedValue(conflict);
  await expect(issueSanitationEnforcementStage("7/8", "nov_1", "warning")).rejects.toBe(conflict);
  expect(apiRequest.mock.calls[0][0]).toBe("/sanitation/establishments/7%2F8/enforcement-stage/");
});
