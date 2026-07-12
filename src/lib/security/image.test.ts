import { describe, it, expect } from "vitest";
import { sniffImageType, imageBytesMatchType } from "./image";

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const bytes = (...b: number[]): Uint8Array => new Uint8Array(b);

describe("sniffImageType", () => {
  it("detects JPEG", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("image/jpeg");
  });

  it("detects PNG", () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe(
      "image/png",
    );
  });

  it("detects GIF87a and GIF89a", () => {
    expect(sniffImageType(new Uint8Array(ascii("GIF87a...")))).toBe("image/gif");
    expect(sniffImageType(new Uint8Array(ascii("GIF89a...")))).toBe("image/gif");
  });

  it("detects WEBP", () => {
    const buf = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]);
    expect(sniffImageType(buf)).toBe("image/webp");
  });

  it("detects AVIF", () => {
    const buf = new Uint8Array([0, 0, 0, 0x20, ...ascii("ftyp"), ...ascii("avif")]);
    expect(sniffImageType(buf)).toBe("image/avif");
  });

  it("returns null for SVG/XML disguised as an image", () => {
    expect(sniffImageType(new Uint8Array(ascii("<svg xmlns=")))).toBeNull();
    expect(sniffImageType(new Uint8Array(ascii("<!DOCTYPE html>")))).toBeNull();
  });

  it("returns null for empty or too-short buffers", () => {
    expect(sniffImageType(new Uint8Array())).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
  });

  it("does not misread a RIFF that is not WEBP (e.g. WAV)", () => {
    const wav = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVEfmt ")]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe("imageBytesMatchType", () => {
  it("passes when bytes match the declared type", () => {
    expect(imageBytesMatchType(bytes(0xff, 0xd8, 0xff, 0x00), "image/jpeg")).toBe(true);
  });

  it("fails when a PNG is declared as JPEG (spoofed header)", () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(imageBytesMatchType(png, "image/jpeg")).toBe(false);
  });

  it("fails when the body is not an image at all", () => {
    expect(imageBytesMatchType(new Uint8Array(ascii("<svg>")), "image/png")).toBe(false);
  });
});
