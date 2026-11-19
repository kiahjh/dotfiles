// Match scripts/generate.py's RGB mixing, including Python's round-to-even.
export function mix(a, b, amount) {
  const roundEven = (n) => {
    const floor = Math.floor(n);
    return n - floor === 0.5 ? floor + (floor % 2) : Math.round(n);
  };
  return '#' + [1, 3, 5].map((i) => roundEven(
    parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount,
  ).toString(16).padStart(2, '0')).join('');
}

export function derived(p) {
  return { ...p,
    diffAdded: mix(p.background, p.green, .14),
    diffRemoved: mix(p.background, p.red, .14),
    diffAddedLine: mix(p.background, p.green, .10),
    diffRemovedLine: mix(p.background, p.red, .10),
    search: mix(p.background, p.cyan, .22),
  };
}

export function luminance(hex) {
  return [1, 3, 5].reduce((sum, i, index) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return sum + [.2126, .7152, .0722][index] * (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  }, 0);
}

export function contrast(a, b) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + .05) / (low + .05);
}

export function validatePalette(p, keys, name) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.name !== name || !['dark', 'light'].includes(p.mode)
    || Object.keys(p).sort().join() !== [...keys].sort().join()
    || Object.entries(p).some(([k, v]) => !['name', 'mode', 'source'].includes(k) && (typeof v !== 'string' || !/^#[0-9a-f]{6}$/.test(v)))) {
    throw new Error(`Expected a complete ${name} palette with lowercase #rrggbb colors.`);
  }
  return p;
}
