// GET /api/strava/callback?code=...
// Strava redirects here after the user approves. We exchange the one-time code
// for tokens using the client secret (server-only), then bounce back to the app
// with the tokens in the URL fragment so the front end can save them.

export default async function handler(req, res) {
  const { code, error } = req.query;
  if (error || !code) return res.redirect("/?strava=denied");

  try {
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });
    const data = await r.json();
    if (!data.access_token) return res.redirect("/?strava=error");

    const tokens = { access: data.access_token, refresh: data.refresh_token, exp: data.expires_at };
    const payload = Buffer.from(JSON.stringify(tokens)).toString("base64");
    // Fragment (#) is never sent to a server, so tokens don't hit any log.
    return res.redirect("/?strava=ok#" + payload);
  } catch (e) {
    return res.redirect("/?strava=error");
  }
}
