import { expect, test } from "bun:test";
import { kindOf } from "../formats.js";

const bytes = (...parts) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));
const gce = [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0];

test("SVG, by type or by content", () => {
  expect(kindOf(bytes("anything"), "image/svg+xml")).toBe("svg");
  expect(kindOf(bytes('<?xml version="1.0"?><svg>'), "")).toBe("svg");
  expect(kindOf(bytes("  <svg xmlns=...>"), "application/octet-stream")).toBe("svg");
});

test("GIF is animated with more than one frame", () => {
  expect(kindOf(bytes("GIF89a", [0, 0], gce, [0x2c]), "image/gif")).toBe("still");
  expect(kindOf(bytes("GIF89a", [0, 0], gce, [0x2c], gce, [0x2c]), "image/gif")).toBe("animated");
});

test("WebP is animated with an ANIM chunk", () => {
  expect(kindOf(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "), "image/webp")).toBe("still");
  expect(kindOf(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8X", [0, 0, 0, 0], "ANIM"), "image/webp")).toBe("animated");
});

test("PNG is animated with acTL before IDAT", () => {
  const png = [0x89, ..."PNG"].map((c) => (typeof c === "string" ? c.charCodeAt(0) : c));
  expect(kindOf(bytes(png, "IHDRIDAT"), "image/png")).toBe("still");
  expect(kindOf(bytes(png, "IHDRacTLIDAT"), "image/png")).toBe("animated");
});

test("AVIF is animated with the avis brand", () => {
  expect(kindOf(bytes([0, 0, 0, 0x1c], "ftypavif"), "image/avif")).toBe("still");
  expect(kindOf(bytes([0, 0, 0, 0x1c], "ftypavis"), "image/avif")).toBe("animated");
});

test("anything else is a still image", () => {
  expect(kindOf(bytes([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe("still");
});
