import { describe, expect, it } from "vitest";
import { explainChosenFile, explainUploadFailure } from "./upload";

function fakeFile(name: string, type: string, size: number) {
  const file = new File([new Uint8Array(Math.min(size, 8))], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("explainChosenFile", () => {
  it("rejects an empty file", () => {
    expect(explainChosenFile(fakeFile("empty.png", "image/png", 0))).toMatch(/empty/i);
  });

  it("rejects an unsupported type", () => {
    expect(explainChosenFile(fakeFile("note.txt", "text/plain", 12))).toMatch(/JPEG/);
  });

  it("rejects an oversized photo", () => {
    expect(explainChosenFile(fakeFile("big.jpg", "image/jpeg", 15 * 1024 * 1024 + 1))).toMatch(/15 MB/);
  });

  it("accepts a normal photo", () => {
    expect(explainChosenFile(fakeFile("ok.png", "image/png", 1200))).toBeNull();
  });
});

describe("explainUploadFailure", () => {
  it("keeps the API message", () => {
    expect(explainUploadFailure({ message: "Photos must be 15 MB or smaller." })).toBe("Photos must be 15 MB or smaller.");
  });

  it("explains a network failure", () => {
    expect(explainUploadFailure({})).toMatch(/connection/i);
  });
});
