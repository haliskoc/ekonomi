import { describe, expect, it } from "vitest";
import { getOptionalEnv } from "./env";

describe("env helper", () => {
  it("returns undefined for unset optional values", () => {
    expect(getOptionalEnv("OPENAI_API_KEY")).toBeUndefined();
  });
});
