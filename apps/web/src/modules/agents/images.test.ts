import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, readImages, toBase64 } from "./images";

function file(name: string, type: string, content: BlobPart = "hello") {
  return new File([content], name, { type });
}

/** A file that reports a size without holding the bytes. */
function sized(name: string, type: string, size: number) {
  const value = file(name, type);
  Object.defineProperty(value, "size", { value: size });
  return value;
}

describe("toBase64", () => {
  it("encodes the bytes without a data: prefix", async () => {
    expect(await toBase64(file("a.png", "image/png", "hello"))).toBe("aGVsbG8=");
    expect(await toBase64(file("a.png", "image/png", new Uint8Array([0, 255, 128])))).toBe("AP+A");
  });

  it("encodes files larger than one chunk", async () => {
    const bytes = new Uint8Array(100_000).map((_, index) => index % 256);
    const encoded = await toBase64(file("big.png", "image/png", bytes));
    expect(encoded).not.toMatch(/^data:/);
    expect(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))).toEqual(bytes);
  });
});

describe("readImages", () => {
  it("accepts PNG, JPEG, GIF and WebP", async () => {
    const { images, problems } = await readImages(
      [file("a.png", "image/png"), file("b.jpg", "image/jpeg"), file("c.webp", "image/webp")],
      0,
    );
    expect(problems).toEqual([]);
    expect(images.map((image) => image.mediaType)).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(images[0]).toEqual({ name: "a.png", size: 5, mediaType: "image/png", data: "aGVsbG8=" });
  });

  it("rejects other types", async () => {
    const result = await readImages([file("doc.pdf", "application/pdf"), file("x.svg", "image/svg+xml")], 0);
    expect(result.images).toEqual([]);
    expect(result.problems).toEqual([
      { name: "doc.pdf", problem: "type" },
      { name: "x.svg", problem: "type" },
    ]);
  });

  it("allows 5 MB and rejects larger files", async () => {
    const result = await readImages(
      [sized("ok.png", "image/png", MAX_IMAGE_BYTES), sized("big.png", "image/png", MAX_IMAGE_BYTES + 1)],
      0,
    );
    expect(result.images.map((image) => image.name)).toEqual(["ok.png"]);
    expect(result.problems).toEqual([{ name: "big.png", problem: "size" }]);
  });

  it("stops at three images, counting those already attached", async () => {
    const result = await readImages(
      [file("1.png", "image/png"), file("2.png", "image/png"), file("3.png", "image/png")],
      1,
    );
    expect(result.images.map((image) => image.name)).toEqual(["1.png", "2.png"]);
    expect(result.problems).toEqual([{ name: "3.png", problem: "count" }]);
  });
});
