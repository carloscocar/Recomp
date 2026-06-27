import { useEffect, useRef, useState } from "react";
import { supabase, hasSupabase } from "./lib/supabase";
import * as store from "./lib/storage";
import {
  ACTIVITY,
  GOALS,
  round,
  computeTargets,
  localDateKey,
  prettyDate,
} from "./lib/targets";

/* ============================ shared styles ============================ */
const card = { background: "#1E1C16", border: "1px solid #2C2A22", borderRadius: 16, padding: 18 };
const sectionLabel = { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#6B6760", marginBottom: 12 };
const inputStyle = { width: "100%", background: "#14130F", border: "1px solid #2C2A22", borderRadius: 10, color: "#ECE7DA", padding: "11px 12px", fontSize: 15, boxSizing: "border-box", outline: "none" };
const amberBtn = { background: "#E0A53D", border: "none", color: "#14130F", borderRadius: 12, padding: 14, cursor: "pointer", fontWeight: 600, fontSize: 15, width: "100%" };

/* ============================ Strava helpers ============================ */
const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID;
const stravaConfigured = () => Boolean(STRAVA_CLIENT_ID);
function stravaAuthUrl() {
  const redirect = window.location.origin + "/api/strava/callback";
  return `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    redirect
  )}&approval_prompt=auto&scope=activity:read_all`;
}
const SPORT_MAP = { Run: "Cardio", Ride: "Cardio", VirtualRide: "Cardio", Walk: "Cardio", Swim: "Cardio", WeightTraining: "Lifting", Workout: "Full body" };

/* ============================ meal analysis ============================ */
// Full-res iPhone photos are huge and often HEIC. We load the image, draw it to
// a canvas downscaled, and re-encode as JPEG — which the model accepts. On Apple
// devices (where these photos come from) the browser decodes HEIC natively, so
// no extra library is needed.
async function fileToJpegDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("decode-failed"));
      im.src = url;
    });
    const MAX = 1280;
    let { width, height } = img;
    if (Math.max(width, height) > MAX) {
      const s = MAX / Math.max(width, height);
      width = Math.round(width * s);
      height = Math.round(height * s);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function describeMealError(msg = "") {
  if (/ANTHROPIC_API_KEY|missing/i.test(msg))
    return "The meal AI isn't connected yet — add ANTHROPIC_API_KEY in Vercel and redeploy (README step 2). Until then, log meals manually below.";
  if (/decode-failed|heic|format|media_type/i.test(msg))
    return "That photo couldn't be converted. Try a JPEG, or add the meal manually.";
  if (/credit|balance|billing/i.test(msg))
    return "Anthropic says the credit balance is too low — add funds in the Anthropic console, then try again.";
  if (/model/i.test(msg))
    return "Model error from Anthropic: " + msg + " — your account may not have access to that model.";
  // Show the real reason rather than a vague message, so problems are debuggable.
  return msg ? "Couldn't analyze: " + msg : "Couldn't read that one — try a clearer shot, or add it manually below.";
}

async function analyzeMeal(base64, mediaType) {
  const res = await fetch("/api/analyze-meal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: base64, mediaType }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || "Analysis failed");
  }
  return res.json();
}

/* ================================ ROOT ================================ */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking

  useEffect(() => {
    if (!hasSupabase) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <Splash text="Loading…" />;
  }
  if (hasSupabase && !session) {
    return <Auth />;
  }

  store.setUser(session?.user?.id || null);
  return <Dashboard signedIn={Boolean(session)} email={session?.user?.email} />;
}

function Splash({ text }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6760" }}>{text}</div>
  );
}

/* ================================ AUTH ================================ */
function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg("");
    const fn = mode === "signin" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password: pw });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "signup") setMsg("Account made. If email confirmation is on, check your inbox, then sign in.");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "#E0A53D", marginBottom: 4 }}>Recomp</div>
        <div style={{ fontSize: 22, fontWeight: 300, marginBottom: 22, color: "#ECE7DA" }}>{mode === "signin" ? "Sign in" : "Create account"}</div>
        <input placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
        <input placeholder="password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} />
        <button onClick={submit} disabled={busy} style={{ ...amberBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        {msg ? <div style={{ color: "#C7A14D", fontSize: 13, marginTop: 12 }}>{msg}</div> : null}
        <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(""); }} style={{ background: "none", border: "none", color: "#9A9586", cursor: "pointer", fontSize: 13, marginTop: 16, textDecoration: "underline" }}>
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
function Dashboard({ signedIn, email }) {
  const [tab, setTab] = useState("today");
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState({ weightLbs: 158, heightIn: 70, age: 20, sex: "male", activity: "moderate" });
  const [goal, setGoal] = useState("recomp");
  const [customTargets, setCustomTargets] = useState(null);
  const [logs, setLogs] = useState({});
  const [strava, setStravaTokens] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const day = localDateKey();

  /* load + handle Strava redirect */
  useEffect(() => {
    (async () => {
      const [p, g, ct, lg, st, ms] = await Promise.all([
        store.get("profile"), store.get("goal"), store.get("customTargets"), store.get("logs"), store.get("strava"), store.get("measurements"),
      ]);
      if (p) setProfile(p);
      if (g) setGoal(g);
      if (ct) setCustomTargets(ct);
      if (lg) setLogs(lg);
      if (st) setStravaTokens(st);
      if (ms) setMeasurements(ms);

      // Strava callback drops tokens in the URL fragment
      if (window.location.search.includes("strava=ok") && window.location.hash.length > 1) {
        try {
          const tokens = JSON.parse(atob(window.location.hash.slice(1)));
          setStravaTokens(tokens);
          store.set("strava", tokens);
        } catch {}
        window.history.replaceState({}, "", window.location.pathname);
      }
      setLoaded(true);
    })();
  }, []);

  const targets = computeTargets(profile, goal);
  const active = customTargets || targets;
  const todayLog = logs[day] || { meals: [], workouts: [] };
  const totals = todayLog.meals.reduce(
    (a, m) => ({ calories: a.calories + (m.calories || 0), protein: a.protein + (m.protein || 0), carbs: a.carbs + (m.carbs || 0), fat: a.fat + (m.fat || 0) }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const streak = (() => {
    let s = 0, d = new Date();
    for (let i = 0; i < 400; i++) {
      const k = localDateKey(d);
      if ((logs[k]?.workouts?.length || 0) > 0) { s++; d.setDate(d.getDate() - 1); }
      else if (i === 0) { d.setDate(d.getDate() - 1); }
      else break;
    }
    return s;
  })();
  const weekCount = (() => {
    let n = 0, d = new Date();
    for (let i = 0; i < 7; i++) { if ((logs[localDateKey(d)]?.workouts?.length || 0) > 0) n++; d.setDate(d.getDate() - 1); }
    return n;
  })();

  function saveLogs(next) { setLogs(next); store.set("logs", next); }
  const ensureDay = (l, k) => l[k] || { meals: [], workouts: [] };

  function addMeal(meal) {
    const d = ensureDay(logs, day);
    saveLogs({ ...logs, [day]: { ...d, meals: [...d.meals, { id: Date.now(), ...meal }] } });
  }
  function removeMeal(id) {
    saveLogs({ ...logs, [day]: { ...todayLog, meals: todayLog.meals.filter((m) => m.id !== id) } });
  }
  function addWorkout(w) {
    const d = ensureDay(logs, day);
    saveLogs({ ...logs, [day]: { ...d, workouts: [...d.workouts, { id: Date.now(), ...w }] } });
  }
  function removeWorkout(dateKey, id) {
    const d = ensureDay(logs, dateKey);
    saveLogs({ ...logs, [dateKey]: { ...d, workouts: d.workouts.filter((w) => w.id !== id) } });
  }

  function mergeStravaActivities(acts) {
    const next = { ...logs };
    let added = 0;
    for (const a of acts) {
      const dateKey = (a.start_date_local || a.start_date || "").slice(0, 10);
      if (!dateKey) continue;
      const d = next[dateKey] ? { ...next[dateKey], workouts: [...next[dateKey].workouts] } : { meals: [], workouts: [] };
      if (d.workouts.some((w) => w.stravaId === a.id)) continue;
      d.workouts.push({
        id: Date.now() + Math.random(),
        stravaId: a.id,
        type: SPORT_MAP[a.sport_type] || SPORT_MAP[a.type] || a.sport_type || a.type || "Activity",
        minutes: a.moving_time ? round(a.moving_time / 60) : null,
        notes: a.name || "",
      });
      next[dateKey] = d;
      added++;
    }
    saveLogs(next);
    return added;
  }

  function setProfileP(p) { setProfile(p); store.set("profile", p); }
  function setGoalP(g) { setGoal(g); store.set("goal", g); }
  function setCustomP(c) { setCustomTargets(c); store.set("customTargets", c); }

  function addMeasurement(weight, bodyFat) {
    if (!weight) return;
    const entry = { date: day, weight: +weight, bodyFat: bodyFat === "" || bodyFat == null ? null : +bodyFat };
    const next = [...measurements.filter((m) => m.date !== day), entry].sort((a, b) => (a.date < b.date ? -1 : 1));
    setMeasurements(next);
    store.set("measurements", next);
    // keep profile weight (and therefore targets) in sync with reality
    setProfileP({ ...profile, weightLbs: +weight });
  }

  if (!loaded) return <Splash text="Loading your data…" />;

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", minHeight: "100vh", paddingBottom: 88 }}>
      <div className="safe-top" style={{ padding: "22px 20px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "#E0A53D" }}>Recomp</div>
            <div style={{ fontSize: 13, color: "#6B6760", marginTop: 3 }}>{prettyDate(day)}</div>
          </div>
          {!hasSupabase && (
            <div style={{ fontSize: 10, color: "#6B6760", textAlign: "right", maxWidth: 150, lineHeight: 1.4 }}>
              Local mode — saved on this device
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 20px" }}>
        {tab === "today" && <Today totals={totals} active={active} todayLog={todayLog} streak={streak} weekCount={weekCount} removeMeal={removeMeal} removeWorkout={(id) => removeWorkout(day, id)} goTo={setTab} />}
        {tab === "meal" && <AddMeal addMeal={addMeal} active={active} totals={totals} />}
        {tab === "train" && <Train addWorkout={addWorkout} todayLog={todayLog} removeWorkout={(id) => removeWorkout(day, id)} streak={streak} weekCount={weekCount} />}
        {tab === "you" && (
          <You
            profile={profile} setProfile={setProfileP}
            goal={goal} setGoal={(g) => { setGoalP(g); setCustomP(null); }}
            auto={targets} customTargets={customTargets} setCustomTargets={setCustomP}
            strava={strava} setStrava={(t) => { setStravaTokens(t); store.set("strava", t); }}
            mergeStravaActivities={mergeStravaActivities}
            measurements={measurements} addMeasurement={addMeasurement}
            signedIn={signedIn} email={email}
          />
        )}
      </div>

      <nav className="safe-bottom" style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 460, margin: "0 auto", background: "rgba(20,19,15,0.92)", backdropFilter: "blur(10px)", borderTop: "1px solid #2C2A22", display: "flex", paddingTop: 8 }}>
        {[{ id: "today", label: "Today" }, { id: "meal", label: "Meal" }, { id: "train", label: "Train" }, { id: "you", label: "You" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0", color: tab === t.id ? "#E0A53D" : "#6B6760", fontSize: 12, letterSpacing: "0.05em", fontWeight: tab === t.id ? 600 : 400 }}>
            <div style={{ width: 5, height: 5, borderRadius: 99, background: tab === t.id ? "#E0A53D" : "transparent", margin: "0 auto 6px" }} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ============================== pieces ============================== */
function Ring({ value, max, size = 132, stroke = 10, color, label, unit }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const over = max && value > max;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A2820" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? "#C7613D" : color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease, stroke .3s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{round(value)}</div>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6B6760", marginTop: 2 }}>{label}</div>
        <div style={{ fontSize: 10, color: "#6B6760", marginTop: 1 }}>of {round(max)}{unit}</div>
      </div>
    </div>
  );
}

function MacroBar({ label, value, max, color }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: "#9A9586", letterSpacing: "0.04em" }}>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{round(value)} / {round(max)}g</span>
      </div>
      <div style={{ height: 6, background: "#2A2820", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: color, borderRadius: 99, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

/* ================================ TODAY ================================ */
function Today({ totals, active, todayLog, streak, weekCount, removeMeal, removeWorkout, goTo }) {
  const calLeft = active.calories - totals.calories;
  return (
    <div>
      <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-around", marginBottom: 14 }}>
        <Ring value={totals.calories} max={active.calories} color="#E0A53D" label="kcal" />
        <Ring value={totals.protein} max={active.protein} color="#8FA66E" label="protein" unit="g" />
      </div>
      <div style={{ ...card, marginBottom: 14 }}>
        <MacroBar label="Carbs" value={totals.carbs} max={active.carbs} color="#C7A14D" />
        <MacroBar label="Fat" value={totals.fat} max={active.fat} color="#B07B57" />
        <div style={{ fontSize: 12, color: "#6B6760", marginTop: 4 }}>{calLeft >= 0 ? `${round(calLeft)} kcal left today` : `${round(-calLeft)} kcal over`}</div>
      </div>
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: "-0.02em" }}>{streak}<span style={{ fontSize: 15, color: "#6B6760", marginLeft: 6 }}>day{streak === 1 ? "" : "s"}</span></div>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6B6760", marginTop: 2 }}>Training streak</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "#9A9586" }}>This week</div>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {Array.from({ length: 7 }).map((_, i) => <div key={i} style={{ width: 9, height: 22, borderRadius: 3, background: i < weekCount ? "#E0A53D" : "#2A2820" }} />)}
          </div>
        </div>
      </div>

      <div style={sectionLabel}>Meals</div>
      {todayLog.meals.length === 0 ? (
        <button onClick={() => goTo("meal")} style={{ ...card, width: "100%", textAlign: "left", cursor: "pointer", color: "#6B6760", marginBottom: 14, fontSize: 14 }}>Nothing logged yet. Snap a photo of your next meal →</button>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {todayLog.meals.map((m) => (
            <div key={m.id} style={{ ...card, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "#6B6760", marginTop: 3 }}>{round(m.calories)} kcal · P {round(m.protein)} · C {round(m.carbs)} · F {round(m.fat)}</div>
              </div>
              <button onClick={() => removeMeal(m.id)} style={{ background: "none", border: "none", color: "#6B6760", cursor: "pointer", fontSize: 18, padding: 4 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={sectionLabel}>Training</div>
      {todayLog.workouts.length === 0 ? (
        <button onClick={() => goTo("train")} style={{ ...card, width: "100%", textAlign: "left", cursor: "pointer", color: "#6B6760", fontSize: 14 }}>No session yet today. Log a workout to keep the streak →</button>
      ) : (
        todayLog.workouts.map((w) => (
          <div key={w.id} style={{ ...card, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 15 }}>{w.type}{w.minutes ? ` · ${w.minutes} min` : ""}{w.stravaId ? "  ·  Strava" : ""}</div>{w.notes ? <div style={{ fontSize: 12, color: "#6B6760", marginTop: 3 }}>{w.notes}</div> : null}</div>
            <button onClick={() => removeWorkout(w.id)} style={{ background: "none", border: "none", color: "#6B6760", cursor: "pointer", fontSize: 18, padding: 4 }}>×</button>
          </div>
        ))
      )}
    </div>
  );
}

/* ============================== ADD MEAL ============================== */
function AddMeal({ addMeal, active, totals }) {
  const [status, setStatus] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    setPreview(null);
    setStatus("analyzing");
    try {
      const dataUrl = await fileToJpegDataUrl(file);
      setPreview(dataUrl);
      const r = await analyzeMeal(dataUrl.split(",")[1], "image/jpeg");
      setResult({ name: r.name || "Meal", calories: +r.calories || 0, protein: +r.protein || 0, carbs: +r.carbs || 0, fat: +r.fat || 0, confidence: r.confidence || "medium", note: r.note || "" });
      setStatus("review");
    } catch (err) {
      setErr(describeMealError(err?.message));
      setStatus("error");
    }
  }

  const field = (key, label, unit) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: "#6B6760", marginBottom: 5 }}>{label}{unit ? ` (${unit})` : ""}</div>
      <input type="number" value={result[key]} onChange={(e) => setResult({ ...result, [key]: +e.target.value })} style={inputStyle} />
    </div>
  );

  function save() {
    addMeal({ name: result.name, calories: result.calories, protein: result.protein, carbs: result.carbs, fat: result.fat });
    setStatus("idle"); setPreview(null); setResult(null);
  }

  return (
    <div>
      <div style={sectionLabel}>Log a meal</div>
      {(status === "idle" || status === "error") && (
        <>
          <button onClick={() => fileRef.current?.click()} style={{ ...card, width: "100%", cursor: "pointer", padding: 28, textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>◎</div>
            <div style={{ fontSize: 16 }}>Snap or upload a photo</div>
            <div style={{ fontSize: 12, color: "#6B6760", marginTop: 6 }}>Estimates calories & macros from the picture</div>
          </button>
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" capture="environment" onChange={onFile} style={{ display: "none" }} />
          {err ? <div style={{ color: "#C7613D", fontSize: 13, marginBottom: 12 }}>{err}</div> : null}
          <ManualAdd onAdd={addMeal} />
        </>
      )}
      {status === "analyzing" && (
        <div style={{ ...card, textAlign: "center", padding: 30 }}>
          {preview ? <img src={preview} alt="meal" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12, marginBottom: 16, opacity: 0.6 }} /> : null}
          <div style={{ color: "#E0A53D", fontSize: 14 }}>Reading your plate…</div>
        </div>
      )}
      {status === "review" && result && (
        <div style={card}>
          {preview ? <img src={preview} alt="meal" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, marginBottom: 14 }} /> : null}
          <input value={result.name} onChange={(e) => setResult({ ...result, name: e.target.value })} style={{ ...inputStyle, fontSize: 17, marginBottom: 6 }} />
          <div style={{ fontSize: 11, color: result.confidence === "high" ? "#8FA66E" : result.confidence === "low" ? "#C7613D" : "#C7A14D", marginBottom: 14 }}>{result.confidence} confidence{result.note ? ` · ${result.note}` : ""} — tweak any number</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>{field("calories", "Calories", "kcal")}{field("protein", "Protein", "g")}</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>{field("carbs", "Carbs", "g")}{field("fat", "Fat", "g")}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setStatus("idle"); setPreview(null); setResult(null); }} style={{ flex: 1, background: "#14130F", border: "1px solid #2C2A22", color: "#9A9586", borderRadius: 10, padding: 13, cursor: "pointer", fontSize: 15 }}>Discard</button>
            <button onClick={save} style={{ ...amberBtn, flex: 2, padding: 13, borderRadius: 10 }}>Add to today</button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 16, fontSize: 12, color: "#6B6760" }}>So far today: {round(totals.calories)} / {active.calories} kcal · {round(totals.protein)} / {active.protein}g protein</div>
    </div>
  );
}

function ManualAdd({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  if (!open) return <button onClick={() => setOpen(true)} style={{ background: "none", border: "none", color: "#9A9586", cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 4 }}>+ Add manually instead</button>;
  return (
    <div style={card}>
      <input placeholder="What did you eat?" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} style={{ ...inputStyle, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input placeholder="kcal" type="number" value={m.calories} onChange={(e) => setM({ ...m, calories: e.target.value })} style={inputStyle} />
        <input placeholder="protein" type="number" value={m.protein} onChange={(e) => setM({ ...m, protein: e.target.value })} style={inputStyle} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="carbs" type="number" value={m.carbs} onChange={(e) => setM({ ...m, carbs: e.target.value })} style={inputStyle} />
        <input placeholder="fat" type="number" value={m.fat} onChange={(e) => setM({ ...m, fat: e.target.value })} style={inputStyle} />
      </div>
      <button onClick={() => { if (!m.name) return; onAdd({ name: m.name, calories: +m.calories || 0, protein: +m.protein || 0, carbs: +m.carbs || 0, fat: +m.fat || 0 }); setM({ name: "", calories: "", protein: "", carbs: "", fat: "" }); setOpen(false); }} style={{ ...amberBtn, padding: 12 }}>Add meal</button>
    </div>
  );
}

/* ================================ TRAIN ================================ */
function Train({ addWorkout, todayLog, removeWorkout, streak, weekCount }) {
  const [type, setType] = useState("Push");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const types = ["Push", "Pull", "Legs", "Upper", "Lower", "Full body", "Lifting", "Cardio", "Other"];
  return (
    <div>
      <div style={{ ...card, display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div><div style={{ fontSize: 30, fontWeight: 300 }}>{streak}</div><div style={{ fontSize: 11, color: "#6B6760", letterSpacing: "0.1em", textTransform: "uppercase" }}>Streak</div></div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 30, fontWeight: 300 }}>{weekCount}<span style={{ fontSize: 14, color: "#6B6760" }}>/7</span></div><div style={{ fontSize: 11, color: "#6B6760", letterSpacing: "0.1em", textTransform: "uppercase" }}>This week</div></div>
      </div>
      <div style={sectionLabel}>Log today's session</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} style={{ background: type === t ? "#E0A53D" : "#1E1C16", color: type === t ? "#14130F" : "#9A9586", border: "1px solid " + (type === t ? "#E0A53D" : "#2C2A22"), borderRadius: 99, padding: "8px 15px", fontSize: 13, cursor: "pointer", fontWeight: type === t ? 600 : 400 }}>{t}</button>
        ))}
      </div>
      <input placeholder="Minutes (optional)" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
      <input placeholder="Notes — lifts, PRs, how it felt (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
      <button onClick={() => { addWorkout({ type, minutes: +minutes || null, notes }); setMinutes(""); setNotes(""); }} style={{ ...amberBtn, marginBottom: 20 }}>Log session</button>
      {todayLog.workouts.length > 0 && (
        <>
          <div style={sectionLabel}>Logged today</div>
          {todayLog.workouts.map((w) => (
            <div key={w.id} style={{ ...card, padding: 14, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 15 }}>{w.type}{w.minutes ? ` · ${w.minutes} min` : ""}{w.stravaId ? "  ·  Strava" : ""}</div>{w.notes ? <div style={{ fontSize: 12, color: "#6B6760", marginTop: 3 }}>{w.notes}</div> : null}</div>
              <button onClick={() => removeWorkout(w.id)} style={{ background: "none", border: "none", color: "#6B6760", cursor: "pointer", fontSize: 18, padding: 4 }}>×</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ============================ PROGRESS / TREND ============================ */
const shortDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function TrendChart({ points, color, unit }) {
  const W = 440, H = 160, L = 10, R = 44, T = 16, B = 26;
  if (points.length < 2) return null;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15;
  min -= pad; max += pad;
  const X = (i) => L + (i / (points.length - 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${X(points.length - 1).toFixed(1)},${H - B} L${X(0).toFixed(1)},${H - B} Z`;
  const gid = "g_" + unit.replace(/\W/g, "");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={X(i)} cy={Y(p.value)} r={i === points.length - 1 ? 4 : 2.5} fill={i === points.length - 1 ? color : "#14130F"} stroke={color} strokeWidth="1.5" />
      ))}
      <text x={W - R + 6} y={T + 4} fill="#6B6760" fontSize="10">{(max - (max - min) * 0.15).toFixed(0)}</text>
      <text x={W - R + 6} y={H - B} fill="#6B6760" fontSize="10">{(min + (max - min) * 0.15).toFixed(0)}</text>
      <text x={L} y={H - 8} fill="#6B6760" fontSize="10">{shortDate(points[0].date)}</text>
      <text x={X(points.length - 1)} y={H - 8} fill="#6B6760" fontSize="10" textAnchor="end">{shortDate(last.date)}</text>
    </svg>
  );
}

function TrendBlock({ measurements, addMeasurement, currentWeight }) {
  const [metric, setMetric] = useState("weight");
  const [w, setW] = useState("");
  const [bf, setBf] = useState("");

  const META = {
    weight: { label: "Weight", unit: "lb", color: "#E0A53D" },
    bodyFat: { label: "Body fat", unit: "%", color: "#C7613D" },
    lean: { label: "Lean mass", unit: "lb", color: "#8FA66E" },
  };
  const meta = META[metric];

  const points = measurements
    .map((m) => {
      if (metric === "weight") return { date: m.date, value: m.weight };
      if (m.bodyFat == null) return null;
      if (metric === "bodyFat") return { date: m.date, value: m.bodyFat };
      return { date: m.date, value: m.weight * (1 - m.bodyFat / 100) }; // lean mass
    })
    .filter(Boolean);

  const first = points[0], last = points[points.length - 1];
  const delta = points.length >= 2 ? last.value - first.value : null;
  const fmt = (v) => (metric === "weight" ? v.toFixed(1) : metric === "bodyFat" ? v.toFixed(1) : v.toFixed(1));

  function save() {
    addMeasurement(w || currentWeight, bf);
    setW(""); setBf("");
  }

  return (
    <div>
      {/* metric toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {Object.entries(META).map(([k, v]) => (
          <button key={k} onClick={() => setMetric(k)} style={{ flex: 1, background: metric === k ? "#2A2820" : "transparent", border: "1px solid " + (metric === k ? "#3A372E" : "#2C2A22"), color: metric === k ? v.color : "#6B6760", borderRadius: 8, padding: "7px 0", fontSize: 12, cursor: "pointer", fontWeight: metric === k ? 600 : 400 }}>{v.label}</button>
        ))}
      </div>

      {points.length >= 2 ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 300, color: meta.color, fontVariantNumeric: "tabular-nums" }}>{fmt(last.value)}<span style={{ fontSize: 14, color: "#6B6760", marginLeft: 3 }}>{meta.unit}</span></span>
            {delta != null && (
              <span style={{ fontSize: 13, color: "#9A9586" }}>{delta >= 0 ? "+" : ""}{fmt(delta)} {meta.unit} since {shortDate(first.date)}</span>
            )}
          </div>
          <TrendChart points={points} color={meta.color} unit={meta.unit} />
        </>
      ) : (
        <div style={{ fontSize: 13, color: "#6B6760", padding: "8px 0 16px", lineHeight: 1.5 }}>
          {metric === "weight"
            ? "Log your weight a few times to see the trend line build."
            : "Add a body-fat % when you log (even a rough estimate) to track this — consistency matters more than precision."}
        </div>
      )}

      {/* log form */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input type="number" placeholder={`Weight (${currentWeight})`} value={w} onChange={(e) => setW(e.target.value)} style={inputStyle} />
        <input type="number" placeholder="Body fat %" value={bf} onChange={(e) => setBf(e.target.value)} style={inputStyle} />
      </div>
      <button onClick={save} style={{ ...amberBtn, padding: 12, marginTop: 10 }}>Log today's measurement</button>
      <div style={{ fontSize: 11, color: "#6B6760", marginTop: 8 }}>One entry per day — logging again today updates it.</div>
    </div>
  );
}

/* ================================= YOU ================================= */
function You({ profile, setProfile, goal, setGoal, auto, customTargets, setCustomTargets, strava, setStrava, mergeStravaActivities, measurements, addMeasurement, signedIn, email }) {
  const t = customTargets || auto;
  const [importStatus, setImportStatus] = useState("idle");
  const [importMsg, setImportMsg] = useState("");

  const num = (key, label, unit) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: "#6B6760", marginBottom: 5 }}>{label}{unit ? ` (${unit})` : ""}</div>
      <input type="number" value={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: +e.target.value })} style={inputStyle} />
    </div>
  );

  async function importStrava() {
    if (!strava) return;
    setImportStatus("importing"); setImportMsg("");
    try {
      const res = await fetch("/api/strava/activities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tokens: strava }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      if (data.refreshed) setStrava(data.refreshed);
      const added = mergeStravaActivities(data.activities || []);
      setImportStatus("done"); setImportMsg(`Imported ${added} new ${added === 1 ? "activity" : "activities"}.`);
    } catch (e) {
      setImportStatus("error"); setImportMsg("Import failed — reconnect Strava and try again.");
    }
  }

  return (
    <div>
      <div style={sectionLabel}>Your stats</div>
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>{num("weightLbs", "Weight", "lb")}{num("heightIn", "Height", "in")}{num("age", "Age")}</div>
        <div style={{ fontSize: 11, color: "#6B6760", marginBottom: 5 }}>Activity</div>
        <select value={profile.activity} onChange={(e) => setProfile({ ...profile, activity: e.target.value })} style={inputStyle}>
          {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.hint}</option>)}
        </select>
      </div>

      <div style={sectionLabel}>Progress</div>
      <div style={{ ...card, marginBottom: 14 }}>
        <TrendBlock measurements={measurements} addMeasurement={addMeasurement} currentWeight={profile.weightLbs} />
      </div>

      <div style={sectionLabel}>Goal</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {Object.entries(GOALS).map(([k, v]) => (
          <button key={k} onClick={() => setGoal(k)} style={{ ...card, textAlign: "left", cursor: "pointer", borderColor: goal === k ? "#E0A53D" : "#2C2A22", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 15, color: goal === k ? "#E0A53D" : "#ECE7DA" }}>{v.label}</div><div style={{ fontSize: 12, color: "#6B6760", marginTop: 2 }}>{v.hint}</div></div>
              <div style={{ width: 16, height: 16, borderRadius: 99, border: "1px solid " + (goal === k ? "#E0A53D" : "#3A372E"), background: goal === k ? "#E0A53D" : "transparent" }} />
            </div>
          </button>
        ))}
      </div>

      <div style={sectionLabel}>Daily targets {customTargets ? "(edited)" : "(auto)"}</div>
      <div style={{ ...card, marginBottom: 14 }}>
        {[["calories", "Calories", "kcal"], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"]].map(([k, label, unit]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: "#9A9586", fontSize: 14 }}>{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" value={t[k]} onChange={(e) => setCustomTargets({ ...t, [k]: +e.target.value })} style={{ ...inputStyle, width: 90, textAlign: "right", padding: "8px 10px" }} />
              <span style={{ fontSize: 12, color: "#6B6760", width: 28 }}>{unit}</span>
            </div>
          </div>
        ))}
        {customTargets && <button onClick={() => setCustomTargets(null)} style={{ background: "none", border: "none", color: "#9A9586", textDecoration: "underline", cursor: "pointer", fontSize: 13, padding: 0 }}>Reset to auto</button>}
      </div>

      <div style={sectionLabel}>Connections</div>
      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 15 }}>Strava</div><div style={{ fontSize: 12, color: "#6B6760", marginTop: 2 }}>{strava ? "Connected — pull in your activities" : "Auto-log runs, rides & lifts"}</div></div>
          {!stravaConfigured() ? (
            <span style={{ fontSize: 11, color: "#6B6760" }}>not set up</span>
          ) : strava ? (
            <button onClick={() => setStrava(null)} style={{ background: "none", border: "1px solid #2C2A22", color: "#9A9586", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>Disconnect</button>
          ) : (
            <a href={stravaAuthUrl()} style={{ background: "#FC4C02", color: "#fff", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Connect</a>
          )}
        </div>
        {strava && (
          <button onClick={importStrava} disabled={importStatus === "importing"} style={{ ...amberBtn, marginTop: 14, padding: 12, opacity: importStatus === "importing" ? 0.6 : 1 }}>
            {importStatus === "importing" ? "Importing…" : "Import recent activities"}
          </button>
        )}
        {importMsg ? <div style={{ fontSize: 12, color: importStatus === "error" ? "#C7613D" : "#8FA66E", marginTop: 10 }}>{importMsg}</div> : null}
      </div>
      <div style={{ ...card, marginBottom: 14, opacity: 0.7 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 15 }}>Apple Health</div><div style={{ fontSize: 12, color: "#6B6760", marginTop: 2 }}>Needs a native iOS app — not available on web</div></div>
          <span style={{ fontSize: 11, color: "#6B6760" }}>unavailable</span>
        </div>
      </div>

      {signedIn && (
        <div style={{ ...card, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#9A9586", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
          <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "1px solid #2C2A22", color: "#9A9586", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>Sign out</button>
        </div>
      )}

      <div style={{ fontSize: 12, color: "#6B6760", lineHeight: 1.6, padding: "4px 2px 0" }}>
        You're already a healthy weight, so this is built for <span style={{ color: "#9A9586" }}>recomposition</span> — losing fat while holding muscle. Expect the scale to move slowly even as you look leaner; protein and consistent training matter more than the number. Targets are estimates, not medical advice.
      </div>
    </div>
  );
}
