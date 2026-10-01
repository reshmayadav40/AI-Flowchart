import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: "./.env", override: true });

function cleanKey(val) {
  if (!val) return "";
  return val.toString().trim().replace(/^["']|["']$/g, "").trim();
}

const GEMINI_API_KEY = cleanKey(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = cleanKey(process.env.GROQ_API_KEY);

console.log("📝 Loaded Env Vars:", {
  hasGeminiKey: !!GEMINI_API_KEY,
  geminiKeyLength: GEMINI_API_KEY ? GEMINI_API_KEY.length : 0,
  hasGroqKey: !!GROQ_API_KEY,
  port: process.env.PORT || 5000,
});

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "AI Flowchart API is online", status: "ok" });
});

app.get("/api/ping", (req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: !!GEMINI_API_KEY,
    time: new Date().toISOString(),
  });
});

const upload = multer({ dest: "uploads/" });

/* ================= AI CLIENTS SETUP ================= */

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

if (!genAI && !groq) {
  console.log("⚠️ No AI API keys found. Please set GEMINI_API_KEY in environment.");
}

/* ================= HELPER: CLEAN JSON ================= */

function extractJSON(text) {
  try {
    const startObj = text.indexOf("{");
    const endObj = text.lastIndexOf("}");

    if (startObj === -1 || endObj === -1 || startObj > endObj) {
      return null;
    }

    const jsonText = text.substring(startObj, endObj + 1);
    return JSON.parse(jsonText);
  } catch (err) {
    console.error("❌ JSON Parse Error:", err);
    return null;
  }
}

/* ================= MOCK FALLBACK ================= */
const MOCK_FLOWCHART = {
  nodes: [
    { id: "1", type: "start", text: "Start" },
    { id: "2", type: "process", text: "sum = a + b" },
    { id: "3", type: "decision", text: "sum > 10" },
    { id: "4", type: "output", text: "Output (sum)" },
    { id: "5", type: "end", text: "End" },
  ],
  edges: [
    { from: "1", to: "2" },
    { from: "2", to: "3" },
    { from: "3", to: "4", label: "yes" },
    { from: "3", to: "5", label: "no" },
    { from: "4", to: "5" },
  ],
  variables: ["a", "b"],
};

/* ================= FLOWCHART PROMPT ================= */

const FLOWCHART_PROMPT_SYSTEM = `
You are an expert flowchart analyzer and generator.
Convert the provided input (algorithm or image) into a structured graph-based JSON for a dry run simulator.

STRICT JSON FORMAT:
{
  "nodes": [
    { "id": "unique_id", "type": "start|process|decision|input|output|end", "text": "display text" }
  ],
  "edges": [
    { "from": "node_id", "to": "node_id", "label": "yes|no|null" }
  ],
  "variables": ["var1", "var2"]
}

Rules:
1. 'start' and 'end' nodes are mandatory.
2. 'decision' nodes MUST have exactly two outgoing edges labeled 'yes' and 'no'.
3. 'process' nodes should contain assignments like 'x = 10' or 'x = x + 1'.
4. 'output' nodes should be in format 'Output (variable_name)'.
5. Order nodes logically for a step-by-step traversal.
6. Extract all variable names used in the flowchart.
`;

const MODERN_GEMINI_MODELS = [
  // Gemini 2.5 Series
  "gemini-2.5-flash",
  "gemini-2.5-pro",

  // Gemini 2.0 Series
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-pro-exp-02-05",
  "gemini-2.0-flash-thinking-exp",

  // Dynamic Latest Aliases
  "gemini-flash-latest",
  "gemini-pro-latest",

  // Gemini 1.5 LTS Series
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash-8b",
];

function isInvalidKeyError(err) {
  const msg = (err?.message || "").toLowerCase();
  return (
    msg.includes("api_key_invalid") ||
    msg.includes("api key not valid") ||
    msg.includes("invalid api key") ||
    msg.includes("permission_denied")
  );
}

/* ================= TEXT TO FLOWCHART ================= */

app.post("/api/flowchart-from-text", async (req, res) => {
  console.log("📥 [TEXT] Received request. Algorithm length:", req.body?.algorithm?.length);
  try {
    const { algorithm } = req.body;
    if (!algorithm) {
      console.log("❌ [TEXT] Missing algorithm in body");
      return res.status(400).json({ error: "Algorithm is required" });
    }

    let resultText = "";
    let lastError = null;
    let keyInvalid = false;

    // 1. Try Gemini
    if (genAI) {
      console.log("🤖 [TEXT] Calling Google Gemini...");
      for (const modelName of MODERN_GEMINI_MODELS) {
        try {
          console.log(`⏳ Trying model: ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });
          const prompt = `${FLOWCHART_PROMPT_SYSTEM}\n\nAlgorithm:\n${algorithm}`;
          const result = await model.generateContent(prompt);
          resultText = result.response.text();
          console.log(`✅ Success with model: ${modelName}`);
          break;
        } catch (mErr) {
          console.error(`⚠️ Model ${modelName} failed:`, mErr.message);
          lastError = mErr;
          if (isInvalidKeyError(mErr)) {
            keyInvalid = true;
            console.error("🚫 Gemini API Key is invalid. Halting Gemini model retries.");
            break;
          }
        }
      }
    }

    // 2. Fallback to Groq if Gemini failed or wasn't configured
    if (!resultText && groq) {
      try {
        console.log("🔄 Trying Groq fallback for text...");
        const chatCompletion = await groq.chat.completions.create({
          messages: [{ role: "user", content: `${FLOWCHART_PROMPT_SYSTEM}\n\nAlgorithm:\n${algorithm}` }],
          model: "llama-3.3-70b-versatile",
          temperature: 0.1,
        });
        resultText = chatCompletion.choices[0]?.message?.content || "";
        console.log("✅ Success with Groq Llama 3.3");
      } catch (gErr) {
        console.error("⚠️ Groq fallback failed:", gErr.message);
      }
    }

    // 3. If still no result, handle error gracefully
    if (!resultText) {
      if (keyInvalid || !GEMINI_API_KEY) {
        return res.status(400).json({
          error: "Invalid or missing Gemini API key. Please get a free key from https://aistudio.google.com and set GEMINI_API_KEY in your Render dashboard under Environment.",
          fallbackData: MOCK_FLOWCHART,
        });
      }
      return res.status(500).json({
        error: `AI processing failed: ${lastError?.message || "No AI model available"}. Please try again.`,
        fallbackData: MOCK_FLOWCHART,
      });
    }

    const parsed = extractJSON(resultText);
    if (!parsed || !parsed.nodes || parsed.nodes.length === 0) {
      console.error("❌ [TEXT] AI returned invalid JSON:", resultText);
      return res.status(500).json({
        error: "AI failed to generate a valid data structure. Please try rephrasing your algorithm.",
        fallbackData: MOCK_FLOWCHART,
      });
    }

    console.log("✅ [TEXT] Successfully parsed flowchart. Nodes:", parsed.nodes?.length);
    res.json(parsed);
  } catch (err) {
    console.error("❌ [TEXT] Server Error:", err.message);
    res.status(500).json({
      error: "Internal Server Error: " + err.message,
      fallbackData: MOCK_FLOWCHART,
    });
  }
});

/* ================= IMAGE TO FLOWCHART ================= */

app.post("/api/flowchart-from-image", upload.single("image"), async (req, res) => {
  console.log("📥 [IMAGE] Received request. File:", req.file ? req.file.originalname : "NONE");
  try {
    if (!req.file) {
      console.log("❌ [IMAGE] No file provided");
      return res.status(400).json({ error: "Image file is required." });
    }

    const filePath = req.file.path;
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = req.file.mimetype || "image/png";

    let resultText = "";
    let lastError = null;
    let keyInvalid = false;

    // 1. Try Gemini Vision models
    if (genAI) {
      console.log("🤖 [IMAGE] Calling Google Gemini Vision...");
      for (const modelName of MODERN_GEMINI_MODELS) {
        try {
          console.log(`⏳ Trying model: ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent([
            FLOWCHART_PROMPT_SYSTEM,
            { inlineData: { data: base64Image, mimeType } },
          ]);
          resultText = result.response.text();
          console.log(`✅ Success with model: ${modelName}`);
          break;
        } catch (mErr) {
          console.error(`⚠️ Model ${modelName} failed:`, mErr.message);
          lastError = mErr;
          if (isInvalidKeyError(mErr)) {
            keyInvalid = true;
            console.error("🚫 Gemini API Key is invalid. Halting Gemini model retries.");
            break;
          }
        }
      }
    }

    // 2. Fallback to Groq Vision if Gemini failed or wasn't configured
    if (!resultText && groq) {
      try {
        console.log("🔄 Trying Groq Vision fallback...");
        const chatCompletion = await groq.chat.completions.create({
          model: "llama-3.2-11b-vision-preview",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: FLOWCHART_PROMPT_SYSTEM },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
              ],
            },
          ],
          temperature: 0.1,
        });
        resultText = chatCompletion.choices[0]?.message?.content || "";
        console.log("✅ Success with Groq Vision");
      } catch (gErr) {
        console.error("⚠️ Groq Vision failed:", gErr.message);
      }
    }

    // Cleanup uploaded temp file
    try {
      fs.unlinkSync(filePath);
    } catch (e) { }

    // 3. Handle errors or missing results
    if (!resultText) {
      if (keyInvalid || !GEMINI_API_KEY) {
        return res.status(400).json({
          error: "Invalid or missing Gemini API key. Please get a free API key at https://aistudio.google.com and set GEMINI_API_KEY in your Render dashboard (Environment tab).",
          fallbackData: MOCK_FLOWCHART,
        });
      }
      return res.status(500).json({
        error: `AI vision processing failed: ${lastError?.message || "No AI model available"}. Try a clearer photo.`,
        fallbackData: MOCK_FLOWCHART,
      });
    }

    const parsed = extractJSON(resultText);
    if (!parsed || !parsed.nodes || parsed.nodes.length === 0) {
      console.error("❌ [IMAGE] AI returned invalid JSON:", resultText);
      return res.status(500).json({
        error: "AI could not read the flowchart in your image. Try a clearer photo or enter algorithm as text.",
        fallbackData: MOCK_FLOWCHART,
      });
    }

    console.log("✅ [IMAGE] Successfully parsed flowchart. Nodes:", parsed.nodes?.length);
    res.json(parsed);
  } catch (err) {
    console.error("❌ [IMAGE] Server Error:", err.message);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) { }
    }
    res.status(500).json({
      error: "Image processing failed: " + err.message,
      fallbackData: MOCK_FLOWCHART,
    });
  }
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 AI Flowchart Server running on port ${PORT}`);
});
