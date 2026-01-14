
const { app, BrowserWindow } = require('electron');
const path = require('path');

// --- Backend server code (Express) ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const backend = express();
backend.use(cors());

const OPENAI_API_KEY = "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";

async function fetchDuckDuckGoImage(model) {
  try {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(model)}&iax=images&ia=images`;
    const tokenRes = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const vqdMatch = tokenRes.data.match(/vqd='([0-9-]+)'/);
    if (!vqdMatch) return "";
    const vqd = vqdMatch[1];
    const imagesRes = await axios.get(
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(model)}&vqd=${vqd}&f=,,,&p=1`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (imagesRes.data && imagesRes.data.results && imagesRes.data.results.length > 0) {
      return imagesRes.data.results[0].image;
    }
    return "";
  } catch (err) {
    console.error("DuckDuckGo image error:", err.message);
    return "";
  }
}

backend.get("/api/summary", async (req, res) => {
  const { model } = req.query;
  if (!model) return res.json({ summary: "", image: "" });
  const prompt = `\nWrite a professional, detailed sales summary for the device model: ${model}.\nHighlight its key features, notable specifications, design, performance, and ideal use cases.\nMake the summary suitable for a customer quote sheet.\nIf the model is unknown, just say \"No information available.\"\n`;
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
  image = await fetchDuckDuckGoImage(model);
  res.json({ summary, image });
});

backend.listen(4000, () => console.log("Backend running on port 4000 (Electron main process)"));

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: false }
  });
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
  }
}

app.on('ready', createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});