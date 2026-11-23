import { describe, expect, test } from "bun:test";
import {
  buildQuestions,
  CATEGORIES,
  covers,
  decide,
  fitSize,
  MAX_SIDE,
  MIN_SIDE,
  questionId,
  siteOf,
  withDefaults,
} from "../policy.js";

describe("buildQuestions", () => {
  test("asks one Noul per enabled category", () => {
    const { questions, labels } = buildQuestions(withDefaults({ categories: { intimacy: false } }));
    expect(Object.values(labels)).toEqual([
      CATEGORIES.nudity.label,
      CATEGORIES.underwear.label,
      CATEGORIES.revealing.label,
      CATEGORIES.suggestive.label,
      CATEGORIES.bodyFocus.label,
    ]);
    for (const question of Object.values(questions)) {
      expect(question.type).toBe("noul");
      expect(question.instructions).toContain("`image`");
    }
  });

  test("sends criteria only for categories that have them", () => {
    const { questions } = buildQuestions(withDefaults());
    const withCriteria = Object.keys(questions).filter((id) => questions[id].criteria);
    expect(withCriteria.map((id) => id.split("_")[0])).toEqual(["nudity", "suggestive", "bodyFocus", "intimacy"]);
  });

  test("asks about women's clothing and framing only, unless menExempt is off", () => {
    const wording = (settings) => Object.values(buildQuestions(withDefaults(settings)).questions).map((q) => q.instructions);
    const exempt = wording({});
    const everyone = wording({ menExempt: false });
    expect(exempt.filter((text) => /woman/.test(text))).toHaveLength(3);
    expect(everyone.filter((text) => /woman/.test(text))).toHaveLength(0);
    expect(everyone[1]).toBe(CATEGORIES.underwear.instructions);
  });

  test("adds a Noul per extra rule, labeled with the rule", () => {
    const { questions, labels } = buildQuestions(withDefaults({ extraRules: " Is anyone showing bare shoulders? \n\n" }));
    const id = Object.keys(labels).find((key) => labels[key] === "Is anyone showing bare shoulders?");
    expect(questions[id].instructions).toBe("Looking at `image`: Is anyone showing bare shoulders?");
  });

  test("question ids change when the wording does, so stale cached answers don't count", () => {
    const a = questionId("bodyFocus", { type: "noul", instructions: "Is it framed on the body?" });
    const b = questionId("bodyFocus", { type: "noul", instructions: "Is the body the subject?" });
    expect(a).not.toBe(b);
    expect(a.startsWith("bodyFocus_")).toBe(true);
    expect(covers({ [a]: 0.4 }, { [b]: {} })).toBe(false);
  });
});

describe("decide", () => {
  const settings = withDefaults({ threshold: 0.25 });
  const asked = buildQuestions(settings);
  const ids = Object.fromEntries(Object.keys(asked.questions).map((id) => [id.split("_")[0], id]));
  const answers = (values) => Object.fromEntries(Object.entries(values).map(([name, p]) => [ids[name], p]));

  test("blocks when any question reaches the threshold, saying why, most likely first", () => {
    const nouls = answers({ nudity: 0.01, underwear: 0.3, revealing: 0.6, suggestive: 0.2, bodyFocus: 0.25, intimacy: 0 });
    expect(decide(nouls, asked, settings)).toEqual({
      verdict: "block",
      reasons: [
        { label: CATEGORIES.revealing.label, p: 0.6 },
        { label: CATEGORIES.underwear.label, p: 0.3 },
        { label: CATEGORIES.bodyFocus.label, p: 0.25 },
      ],
    });
  });

  test("allows when every question is under the threshold", () => {
    const nouls = answers({ nudity: 0.01, underwear: 0.02, revealing: 0.1, suggestive: 0.2, bodyFocus: 0.05, intimacy: 0 });
    expect(decide(nouls, asked, settings)).toEqual({ verdict: "allow", reasons: [] });
  });

  test("ignores cached answers for questions that are switched off", () => {
    const fewer = buildQuestions(withDefaults({ categories: { underwear: false } }));
    const nouls = answers({ nudity: 0, underwear: 0.9, revealing: 0, suggestive: 0, bodyFocus: 0, intimacy: 0 });
    expect(decide(nouls, fewer, settings).verdict).toBe("allow");
  });
});

test("covers needs an answer to every question", () => {
  expect(covers({ a: 0.1, b: 0 }, { a: {}, b: {} })).toBe(true);
  expect(covers({ a: 0.1 }, { a: {}, b: {} })).toBe(false);
  expect(covers(undefined, { a: {} })).toBe(false);
});

describe("fitSize", () => {
  const valid = ({ canvasWidth, canvasHeight }) =>
    [canvasWidth, canvasHeight].every((side) => side >= MIN_SIDE && side <= MAX_SIDE);

  test("shrinks big images to 280 on the short side", () => {
    expect(fitSize(4000, 3000)).toEqual({ drawWidth: 373, drawHeight: 280, canvasWidth: 373, canvasHeight: 280 });
    expect(fitSize(1080, 1920)).toEqual({ drawWidth: 280, drawHeight: 498, canvasWidth: 280, canvasHeight: 498 });
  });

  test("enlarges small images to 280 on the short side", () => {
    expect(fitSize(100, 50)).toEqual({ drawWidth: 560, drawHeight: 280, canvasWidth: 560, canvasHeight: 280 });
  });

  test("pads banners too thin to enlarge", () => {
    const size = fitSize(2000, 20);
    expect(size).toEqual({ drawWidth: 1568, drawHeight: 16, canvasWidth: 1568, canvasHeight: 280 });
  });

  test("always produces a canvas Jev accepts", () => {
    for (const [w, h] of [[1, 1], [48, 48], [279, 2000], [5000, 5000], [300, 10], [1568, 1568], [10, 9000]]) {
      expect(valid(fitSize(w, h))).toBe(true);
    }
  });
});

test("siteOf", () => {
  expect(siteOf("https://www.example.com/a?b")).toBe("www.example.com");
  expect(siteOf("not a url")).toBe("");
});
