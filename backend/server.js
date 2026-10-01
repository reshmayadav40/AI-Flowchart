import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: './.env', override: true });

console.log("📝 Loaded Env Vars:", Object.keys(process.env).filter(k => k.includes("API_KEY") || k === "PORT"));

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "AI Flowchart API is online", status: "ok" });
});

app.get("/api/ping", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

const upload = multer({ dest: "uploads/" });

/* ================= AI CLIENTS SETUP ================= */

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

if (!groq && !genAI) {
  console.log("⚠️ No AI API keys found in process.env");
}

process.on('exit', (code) => {
  console.log(`🚫 Process exiting with code: ${code}`);
});

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
    { id: "5", type: "end", text: "End" }
  ],
  edges: [
    { from: "1", to: "2" },
    { from: "2", to: "3" },
    { from: "3", to: "4", label: "yes" },
    { from: "3", to: "5", label: "no" },
    { from: "4", to: "5" }
  ],
  variables: ["a", "b"]
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
    console.log("🤖 [TEXT] Calling AI...");

    if (genAI) {
      const modelsToTry = [
        "gemini-2.5-flash", "gemini-2.5-pro", 
        "gemini-flash-latest", "gemini-pro-latest", 
        "gemini-2.0-flash", 
        "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b", 
        "gemini-pro", "gemini-pro-vision"
      ];
      let success = false;
      let lastError = null;

      for (const modelName of modelsToTry) {
        try {
          console.log(`⏳ Trying model: ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });
          const prompt = `${FLOWCHART_PROMPT_SYSTEM}\n\nAlgorithm:\n${algorithm}`;
          const result = await model.generateContent(prompt);
          resultText = result.response.text();
          console.log(`✅ Success with model: ${modelName}`);
          success = true;
          break;
        } catch (mErr) {
          console.error(`⚠️ Model ${modelName} logic failed:`, mErr.message);
          lastError = mErr;
        }
      }

      if (!success) throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
    } else if (groq) {
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: `${FLOWCHART_PROMPT_SYSTEM}\n\nAlgorithm:\n${algorithm}` }],
        model: "llama3-70b-8192",
        temperature: 0.1,
      });
      resultText = chatCompletion.choices[0]?.message?.content || "";
    } else {
      throw new Error("No AI service available");
    }

    const parsed = extractJSON(resultText);
    if (!parsed) {
      console.error("❌ [TEXT] AI returned invalid JSON:", resultText);
      return res.status(500).json({ error: "AI failed to generate a valid data structure. Please try rephrasing your algorithm." });
    }

    console.log("✅ [TEXT] Successfully parsed flowchart. Nodes:", parsed.nodes?.length);
    res.json(parsed);
  } catch (err) {
    console.error("❌ [TEXT] Server Error:", err.message);
    res.status(500).json({ error: "Internal Server Error: " + err.message });
  }
});

/* ================= IMAGE TO FLOWCHART ================= */

app.post("/api/flowchart-from-image", upload.single("image"), async (req, res) => {
  console.log("📥 [IMAGE] Received request. File:", req.file ? req.file.originalname : "NONE");
  try {
    if (!req.file) {
      console.log("❌ [IMAGE] No file provided");
      return res.status(400).json({ error: "Image required" });
    }

    const filePath = req.file.path;
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = req.file.mimetype;

    let resultText = "";

    if (genAI) {
      const modelsToTry = [
        "gemini-2.5-flash", "gemini-2.5-pro", 
        "gemini-flash-latest", "gemini-pro-latest", 
        "gemini-2.0-flash", 
        "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b", 
        "gemini-pro-vision"
      ];
      let success = false;
      let lastError = null;

      for (const modelName of modelsToTry) {
        try {
          console.log(`⏳ Trying model: ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent([
            FLOWCHART_PROMPT_SYSTEM,
            { inlineData: { data: base64Image, mimeType } }
          ]);
          resultText = result.response.text();
          console.log(`✅ Success with model: ${modelName}`);
          success = true;
          break;
        } catch (mErr) {
          console.error(`⚠️ Model ${modelName} failed:`, mErr.message);
          lastError = mErr;
        }
      }

      if (!success) throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
    } else if (groq) {
      // Use Groq Vision if available
      const chatCompletion = await groq.chat.completions.create({
        model: "llama-3.2-11b-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: FLOWCHART_PROMPT_SYSTEM },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ],
          },
        ],
        temperature: 0.1,
      });
      resultText = chatCompletion.choices[0]?.message?.content || "";
    }

    // Cleanup file
    try { fs.unlinkSync(filePath); } catch (e) {}

    const parsed = extractJSON(resultText);
    if (!parsed) {
      console.error("❌ [IMAGE] AI returned invalid JSON:", resultText);
      return res.status(500).json({ error: "AI could not read the flowchart in your image. Try a clearer photo." });
    }

    console.log("✅ [IMAGE] Successfully parsed flowchart. Nodes:", parsed.nodes?.length);
    res.json(parsed);
  } catch (err) {
    console.error("❌ [IMAGE] Server Error:", err.message);
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    res.status(500).json({ error: "Image processing failed: " + err.message });
  }
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 AI Flowchart Server running on port ${PORT}`);
});
