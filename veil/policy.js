// What Veil asks Jev about each image, and how it turns the answers into a verdict.
// Shared by the background worker, the options page and the tests.

export const DEFAULT_SETTINGS = {
  apiKey: "",
  apiBase: "https://api.typesafe.ai",
  model: "jev-latest",
  // Block when any enabled question's probability reaches this.
  threshold: 0.25,
  categories: {
    nudity: true,
    underwear: true,
    revealing: true,
    suggestive: true,
    bodyFocus: true,
    intimacy: true,
  },
  // Ask about women's clothing and framing only, not men's.
  menExempt: true,
  // One extra yes/no question per line, where yes means block.
  extraRules: "",
  // Images whose natural width and height are both under this are icons: let them through.
  minSide: 48,
  // Keep images hidden when they can't be checked.
  failClosed: true,
  // Seconds between checks of a playing video's current frame.
  videoInterval: 2,
  pausedSites: [],
};

// `instructions` and `criteria` are what Jev is asked. When the menExempt setting is
// on, a category's `menExempt` replaces them, so that a shirtless man or a man in
// fitted clothes isn't blocked.
export const CATEGORIES = {
  nudity: {
    label: "Nudity or sexual content",
    instructions:
      "Does `image` show nudity, partial nudity, or sexual content of any kind?",
    menExempt: {
      instructions: "Does `image` show nudity or sexual content?",
      criteria: {
        true: "Bare breasts, buttocks or genitals, a man in only his underwear, or sexual activity.",
        false: "Everyone is covered. A shirtless man or a man in swim trunks doesn't count.",
      },
    },
  },
  underwear: {
    label: "Underwear, lingerie or swimwear",
    instructions:
      "Is anyone in `image` wearing underwear, lingerie, a swimsuit, a bikini, or similar?",
    menExempt: {
      instructions: "Is a woman or girl in `image` wearing underwear, lingerie, a swimsuit, or a bikini?",
    },
  },
  revealing: {
    label: "Revealing or tight clothing",
    instructions:
      "Is anyone in `image` wearing revealing or immodest clothing, such as a low neckline, visible cleavage, a bare midriff, a very short skirt or shorts, sheer fabric, or clothing tight enough to emphasize their body?",
    menExempt: {
      instructions:
        "Is a woman or girl in `image` wearing revealing or immodest clothing, such as a low neckline, cleavage, a bare midriff, a short skirt or shorts, sheer fabric, or clothes tight enough to show her figure?",
    },
  },
  suggestive: {
    label: "Suggestive poses or expressions",
    // Without criteria, Jev counted couples posing for ordinary photos.
    instructions: "Is anyone in `image` posing or behaving in a seductive or sexualized way?",
    criteria: {
      true: "A come-hither look, a pose showing off the body, lying or arching provocatively, or sexualized dancing.",
      false: "An ordinary pose or smile for a photo, a couple standing close or hugging, or everyday activity.",
    },
    menExempt: {
      criteria: {
        true: "A come-hither look, a pose showing off the body, lying or arching provocatively, or sexualized dancing.",
        false: "An ordinary pose or smile for a photo, a couple standing close or hugging, everyday activity, or a man who is shirtless or flexing.",
      },
    },
  },
  bodyFocus: {
    label: "Framing that focuses on the body",
    // Without criteria, Jev read "framed or cropped" literally and flagged ordinary
    // headshots, mostly small profile pictures.
    instructions:
      "Is `image` composed to show off someone's body, with their chest, buttocks, hips, or legs as the main subject?",
    criteria: {
      true: "The body or a body part is what the picture is about, such as a cropped torso, a pose that displays curves, or a close-up of legs or cleavage.",
      false: "A face, headshot, portrait, group photo, cartoon, logo, product, or scene, where any body shown is incidental.",
    },
    menExempt: {
      instructions:
        "Is `image` composed to show off a woman's or girl's body, with her chest, buttocks, hips, or legs as the main subject?",
      criteria: {
        true: "Her body or a body part is the subject, such as a cropped torso, a pose that displays curves, or a close-up of legs or cleavage.",
        false: "A face, portrait, group photo, cartoon, logo, product, or scene where any body shown is incidental, or a picture of a man.",
      },
    },
  },
  intimacy: {
    label: "Kissing or physical intimacy",
    // Without criteria, Jev counted a couple posing with an arm around each other.
    instructions: "Does `image` show kissing or sensual physical intimacy?",
    criteria: {
      true: "Kissing, lying together in bed, caressing, or a sensual embrace.",
      false: "People standing or sitting together, an arm around a shoulder or waist, holding hands, a friendly hug, or a posed couple, wedding, or family photo.",
    },
  },
};

export function withDefaults(stored = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    categories: { ...DEFAULT_SETTINGS.categories, ...stored.categories },
  };
}

function hash(text) {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36);
}

// A question's id includes a hash of its wording, so cached answers stop counting
// as soon as the question changes.
export function questionId(name, question) {
  return `${name}_${hash(JSON.stringify(question))}`;
}

export function extraRules(settings) {
  return settings.extraRules
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// The Noul questions for the current settings, keyed by question id, and a
// readable label for each.
export function buildQuestions(settings) {
  const questions = {};
  const labels = {};
  const add = (name, label, question) => {
    const id = questionId(name, question);
    questions[id] = question;
    labels[id] = label;
  };
  for (const [name, category] of Object.entries(CATEGORIES)) {
    if (settings.categories[name]) {
      const { instructions, criteria } = { ...category, ...(settings.menExempt && category.menExempt) };
      add(name, category.label, { type: "noul", instructions, ...(criteria && { criteria }) });
    }
  }
  for (const rule of extraRules(settings)) {
    add("rule", rule, { type: "noul", instructions: `Looking at \`image\`: ${rule}` });
  }
  return { questions, labels };
}

// Cached answers can be reused only if they cover every question asked now.
export function covers(nouls, questions) {
  return Object.keys(questions).every((id) => typeof nouls?.[id] === "number");
}

// Blocked when any question reaches the threshold. The reasons are those questions,
// most likely first, so the page can say why.
export function decide(nouls, { questions, labels }, settings) {
  const reasons = Object.keys(questions)
    .filter((id) => nouls[id] >= settings.threshold)
    .sort((a, b) => nouls[b] - nouls[a])
    .map((id) => ({ label: labels[id], p: nouls[id] }));
  return { verdict: reasons.length ? "block" : "allow", reasons };
}

// Jev takes images 280 to 1568 pixels a side, and charges by the pixel. Veil scales
// every image to 280 on the short side, the smallest Jev takes, and pads the short
// side when an extreme aspect ratio would make the long side too long. Against a
// set of test photos, Jev answered as well at this size as at 512 on the long side.
export const MIN_SIDE = 280;
export const MAX_SIDE = 1568;

export function fitSize(width, height) {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  let scale = MIN_SIDE / short;
  if (long * scale > MAX_SIDE) scale = MAX_SIDE / long;
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  return {
    drawWidth,
    drawHeight,
    canvasWidth: Math.max(MIN_SIDE, drawWidth),
    canvasHeight: Math.max(MIN_SIDE, drawHeight),
  };
}

export function siteOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export const PRICE_PER_MTOK = 0.042;
