export const ACTIVITY = {
  sedentary: { f: 1.2, label: "Sedentary", hint: "desk job, little exercise" },
  light: { f: 1.375, label: "Light", hint: "train 1–3×/week" },
  moderate: { f: 1.55, label: "Moderate", hint: "train 3–5×/week" },
  very: { f: 1.725, label: "Very active", hint: "train 6–7×/week" },
};

export const GOALS = {
  recomp: { adj: -300, label: "Recomp / lean", hint: "lose fat, hold muscle" },
  maintain: { adj: 0, label: "Maintain", hint: "stay where you are" },
  bulk: { adj: 200, label: "Lean bulk", hint: "build, minimal fat" },
};

export const round = (n) => Math.round(n);
const lbToKg = (lb) => lb / 2.2046;
const inToCm = (i) => i * 2.54;

export function computeTargets(p, goalKey) {
  const kg = lbToKg(p.weightLbs);
  const cm = inToCm(p.heightIn);
  const bmr = 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === "female" ? -161 : 5);
  const tdee = bmr * (ACTIVITY[p.activity]?.f || 1.55);
  let cals = tdee + (GOALS[goalKey]?.adj || 0);
  cals = Math.max(cals, bmr * 1.1); // sane floor — never crater intake
  const protein = round(p.weightLbs * 1.0); // 1 g / lb protects muscle
  const fat = round(p.weightLbs * 0.35);
  const carbs = Math.max(0, round((cals - protein * 4 - fat * 9) / 4));
  return { calories: round(cals), protein, carbs, fat };
}

export function localDateKey(d = new Date()) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
