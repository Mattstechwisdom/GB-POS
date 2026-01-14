const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();
app.use(cors());

const OPENAI_API_KEY = "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";

// Helper function to fetch an image from DuckDuckGo
async function fetchDuckDuckGoImage(model) {
  try {
    // DuckDuckGo's image search endpoint (unofficial)
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(model)}&iax=images&ia=images`;

    // DuckDuckGo requires a vqd token to access its image API
    const tokenRes = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const vqdMatch = tokenRes.data.match(/vqd='([0-9-]+)'/);
    if (!vqdMatch) return "";

    const vqd = vqdMatch[1];

    // Now fetch images using the token
    const imagesRes = await axios.get(
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(model)}&vqd=${vqd}&f=,,,&p=1`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    
    if (imagesRes.data && imagesRes.data.results && imagesRes.data.results.length > 0) {
      // Return the first image URL
      return imagesRes.data.results[0].image;
    }
    return "";
  } catch (err) {
    console.error("DuckDuckGo image error:", err.message);
    return "";
  }
}

app.get("/api/summary", async (req, res) => {
  const { model } = req.query;
  if (!model) return res.json({ summary: "", image: "" });

  const prompt = `
Write a professional, detailed sales summary for the device model: ${model}.
Highlight its key features, notable specifications, design, performance, and ideal use cases.
Make the summary suitable for a customer quote sheet.
If the model is unknown, just say "No information available."
`;

  let summary = "No information available.";
  let image = "";

  try {
    const openaiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 350,
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    summary = openaiRes.data.choices?.[0]?.message?.content || summary;
  } catch (e) {
    console.error("OpenAI error:", e.message);
  }

  // Get DuckDuckGo image
  image = await fetchDuckDuckGoImage(model);

  res.json({ summary, image });
});

app.listen(4000, () => console.log("Backend running on port 4000"));