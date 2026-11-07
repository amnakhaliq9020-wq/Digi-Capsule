import { describe, expect, it } from "vitest";
import { readApiFailure } from "./api";

describe("readApiFailure", () => {
  it("uses the API error message", () => {
    const failure = readApiFailure(400, {
      error: { code: "VALIDATION_ERROR", message: "Choose a delivery time after the test clock (2027-02-16T10:00:00.000Z)." },
    });
    expect(failure.message).toContain("test clock");
    expect(failure.code).toBe("VALIDATION_ERROR");
  });

  it("reads a Fastify not-found body instead of hiding it", () => {
    const failure = readApiFailure(404, {
      message: "Route GET:/v1/does-not-exist not found",
      error: "Not Found",
      statusCode: 404,
    });
    expect(failure.message).toBe("Route GET:/v1/does-not-exist not found");
    expect(failure.code).toBe("Not Found");
  });

  it("includes the status when the body has no message", () => {
    expect(readApiFailure(502, "<html>").message).toBe("The request failed (502).");
  });
});
