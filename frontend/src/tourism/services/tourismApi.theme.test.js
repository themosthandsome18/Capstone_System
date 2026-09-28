import { tourismApi } from "./tourismApi";
import { apiRequest } from "../../shared/apiClient";

jest.mock("../../shared/apiClient", () => ({
  ...jest.requireActual("../../shared/apiClient"),
  apiRequest: jest.fn(),
}));

describe("tourismApi.getBootstrapData theme pass-through", () => {
  test("keeps the theme from the /bootstrap/ payload", async () => {
    const theme = {
      primary_color: "#EF7C1F",
      mobile_follows_web: true,
      mobile_primary_color: "",
      saved_colors: [{ hex: "#2FA34A", label: "Original (Green)" }],
      updated_at: "2026-09-28T20:34:00+08:00",
    };
    apiRequest.mockResolvedValueOnce({ theme });

    const data = await tourismApi.getBootstrapData();

    expect(apiRequest).toHaveBeenCalledWith("/bootstrap/");
    expect(data.theme).toEqual(theme);
  });

  test("returns a null theme when the payload has none", async () => {
    apiRequest.mockResolvedValueOnce({});
    const data = await tourismApi.getBootstrapData();
    expect(data.theme).toBeNull();
  });
});
