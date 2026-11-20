// Sniffing image bytes for the formats createImageBitmap can't fully handle.

// Which images need more than createImageBitmap, which only draws the first frame
// and can't draw SVG at all in a worker.
export function kindOf(bytes, type) {
  const head = new TextDecoder().decode(bytes.subarray(0, 256));
  if (type.includes("svg") || /^\s*(<\?xml|<svg|<!DOCTYPE svg)/i.test(head)) return "svg";
  const text = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  const find = (needle, limit = bytes.length) => {
    const codes = [...needle].map((c) => c.charCodeAt(0));
    outer: for (let i = 0; i + codes.length <= limit; i++) {
      for (let j = 0; j < codes.length; j++) if (bytes[i + j] !== codes[j]) continue outer;
      return i;
    }
    return -1;
  };
  if (text(0, 4) === "GIF8") {
    // Count Graphic Control Extensions: one per frame in an animation.
    let frames = 0;
    for (let i = 0; i + 2 < bytes.length && frames < 2; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) frames++;
    }
    return frames > 1 ? "animated" : "still";
  }
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
    return find("ANIM", Math.min(bytes.length, 4096)) >= 0 ? "animated" : "still";
  }
  if (bytes[0] === 0x89 && text(1, 4) === "PNG") {
    const actl = find("acTL", Math.min(bytes.length, 65536));
    const idat = find("IDAT", Math.min(bytes.length, 65536));
    return actl >= 0 && (idat < 0 || actl < idat) ? "animated" : "still";
  }
  if (text(4, 8) === "ftyp" && /avis/.test(text(8, 32))) return "animated";
  return "still";
}
