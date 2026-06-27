// POST /api/analyze-meal  { image: <base64>, mediaType: "image/jpeg" }
// Returns { name, items, calories, protein, carbs, fat, confidence, note }
// Your ANTHROPIC_API_KEY lives only here on the server — never shipped to the browser.

const MEAL_PROMPT = `You are a nutrition estimator. Look at this meal photo and estimate its nutrition.
Respond with ONLY a JSON object, no markdown, no preamble. Shape:
{"name":"short dish name","items":["food 1","food 2"],"calories":number,"protein":number,"carbs":number,"fat":number,"confidence":"low"|"medium"|"high","note":"one short caveat about portion assumptions"}
Estimate totals for the whole plate, macros in grams. If unsure, give your single best estimate, not a range.`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { image, mediaType } = body;
    if (!image) return res.status(400).json({ error: "No image provided" });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
              { type: "text", text: MEAL_PROMPT },
            ],
          },
        ],
      }),
    });

    const data = await r.json();
    if (data.error) return res.status(502).json({ error: data.error.message || "Anthropic error" });

    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      return res.status(502).json({ error: "Could not parse the model's output" });
    }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
