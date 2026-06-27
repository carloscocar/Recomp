// POST /api/strava/activities  { tokens: { access, refresh, exp } }
// Returns { activities: [...], refreshed: <new tokens or null> }
// Refreshes the access token server-side when expired (needs client secret).

async function refreshTokens(tokens) {
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh,
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("refresh failed");
  return { access: d.access_token, refresh: d.refresh_token, exp: d.expires_at };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    let tokens = body.tokens;
    if (!tokens || !tokens.access) return res.status(400).json({ error: "No Strava tokens" });

    let refreshed = null;
    const now = Math.floor(Date.now() / 1000);
    if (tokens.exp && tokens.exp < now + 60) {
      tokens = await refreshTokens(tokens);
      refreshed = tokens;
    }

    const r = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30", {
      headers: { Authorization: "Bearer " + tokens.access },
    });
    const acts = await r.json();
    if (!Array.isArray(acts)) return res.status(502).json({ error: "Strava error", detail: acts });

    return res.status(200).json({ activities: acts, refreshed });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
