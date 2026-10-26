import { describe, expect, it } from "vitest";
import { placeLabel } from "./constants";

describe("placeLabel", () => {
  it("does not repeat the work mode when the location already says it", () => {
    expect(placeLabel("Remote", "REMOTE")).toBe("Remote");
    expect(placeLabel("Remote (Canada)", "REMOTE")).toBe("Remote (Canada)");
    expect(placeLabel("Montreal, QC", "HYBRID")).toBe("Montreal, QC · Hybrid");
    expect(placeLabel(null, "ON_SITE")).toBe("On-site");
    expect(placeLabel(null, null)).toBe("");
  });
});
