import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { User } from "./models/User.js";
import { Flowchart } from "./models/Flowchart.js";

dotenv.config({ path: "./.env", override: true });

function cleanKey(val) {
  if (!val) return "";
  return val.toString().trim().replace(/^["']|["']$/g, "").trim();
}

const GEMINI_API_KEY = cleanKey(process.env.GEMINI_API_KEY);
const GROQ_API_KEY = cleanKey(process.env.GROQ_API_KEY);
const isGeminiValid = !!GEMINI_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || "flowchart_ai_super_secret_jwt_key_2026";
const MONGODB_URI = process.env.MONGODB_URI;

console.log("📝 Loaded Env Vars:", {
  hasGeminiKey: !!GEMINI_API_KEY,
  geminiKeyLength: GEMINI_API_KEY ? GEMINI_API_KEY.length : 0,
  hasGroqKey: !!GROQ_API_KEY,
  hasMongoUri: !!MONGODB_URI,
  port: process.env.PORT || 5000,
});

/* ================= MONGODB CONNECTION ================= */

let isMongoConnected = false;

async function ensureAdminUser() {
  try {
    const adminEmail = "admin@gmail.com";
    let existing = await User.findOne({ email: adminEmail });
    const hashedPassword = await bcrypt.hash("admin123", 10);

    if (!existing) {
      await User.create({
        name: "Admin",
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
      });
      console.log("👑 Default Admin created: admin@gmail.com / admin123");
    } else {
      existing.password = hashedPassword;
      existing.role = "admin";
      await existing.save();
      console.log("👑 Admin credentials synchronized: admin@gmail.com / admin123");
    }
  } catch (err) {
    console.error("⚠️ Error checking admin user:", err.message);
  }
}

async function connectMongoDB() {
  if (!MONGODB_URI || MONGODB_URI.includes("<db_username>")) {
    console.log(
      "⚠️ MongoDB URI contains placeholder (<db_username>) or is missing. Please replace credentials in .env to enable persistent database storage."
    );
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI);
    isMongoConnected = true;
    console.log("🍃 MongoDB connected successfully!");
    await ensureAdminUser();
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
}
connectMongoDB();

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"]
}));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/* ================= AUTH HELPER ================= */

function extractUser(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // Invalid/expired token
    }
  }
  if (req.body?.userEmail) {
    return {
      email: req.body.userEmail,
      name: req.body.userName || "Guest",
      role: req.body.userEmail === "admin@gmail.com" ? "admin" : "user",
    };
  }
  return null;
}

/* ================= HEALTH ROUTES ================= */

app.get("/", (req, res) => {
  res.json({ message: "AI Flowchart API is online", status: "ok", mongoConnected: isMongoConnected });
});

app.get("/api/ping", (req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: !!GEMINI_API_KEY,
    hasGroqKey: !!GROQ_API_KEY,
    mongoConnected: isMongoConnected,
    time: new Date().toISOString(),
  });
});

/* ================= AUTHENTICATION ROUTES ================= */

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    if (!isMongoConnected) {
      return res.status(503).json({
        error:
          "MongoDB is not connected. Please configure your real MONGODB_URI in backend/.env to use database signup.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: "An account with this email already exists. Please log in." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = normalizedEmail === "admin@gmail.com" ? "admin" : "user";
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
    });

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Account created successfully!",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("❌ Signup error:", err.message);
    res.status(500).json({ error: "Signup failed: " + err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    if (!isMongoConnected) {
      return res.status(503).json({
        error:
          "MongoDB is not connected. Please configure your real MONGODB_URI in backend/.env to use database login.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanPassword = password ? password.trim() : "";

    let user = await User.findOne({ email: normalizedEmail });

    // Master Admin Auto-Resolution: Always ensure admin123 works for admin@gmail.com
    if (normalizedEmail === "admin@gmail.com" && cleanPassword === "admin123") {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      if (!user) {
        user = await User.create({
          name: "Admin",
          email: "admin@gmail.com",
          password: hashedPassword,
          role: "admin",
        });
      } else {
        user.password = hashedPassword;
        user.role = "admin";
        await user.save();
      }
    }

    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(cleanPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const userRole = user.role || (user.email === "admin@gmail.com" ? "admin" : "user");
    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: userRole },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Logged in successfully!",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: userRole },
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ error: "Login failed: " + err.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const user = extractUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }
  res.json({ user });
});

/* ================= ADMIN MANAGEMENT ROUTES ================= */

app.get("/api/admin/overview", async (req, res) => {
  try {
    const user = extractUser(req);
    if (!user || (user.role !== "admin" && user.email !== "admin@gmail.com")) {
      return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }

    if (!isMongoConnected) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const allUsers = await User.find({}, "-password").sort({ createdAt: -1 });
    const allFlowcharts = await Flowchart.find().sort({ createdAt: -1 });

    res.json({
      totalUsers: allUsers.length,
      totalFlowcharts: allFlowcharts.length,
      users: allUsers,
      flowcharts: allFlowcharts,
    });
  } catch (err) {
    console.error("❌ Admin overview error:", err.message);
    res.status(500).json({ error: "Failed to fetch admin overview: " + err.message });
  }
});

app.delete("/api/admin/flowchart/:id", async (req, res) => {
  try {
    const user = extractUser(req);
    if (!user || (user.role !== "admin" && user.email !== "admin@gmail.com")) {
      return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }
    await Flowchart.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Flowchart record deleted." });
  } catch (err) {
    res.status(500).json({ error: "Delete failed: " + err.message });
  }
});

/* ================= USER HISTORY ROUTE ================= */

app.get("/api/history", async (req, res) => {
  try {
    const user = extractUser(req);
    if (!user) {
      return res.status(401).json({ error: "Please log in to view your saved flowcharts." });
    }
    if (!isMongoConnected) {
      return res.json({ history: [] });
    }

    const history = await Flowchart.find({
      $or: [{ userId: user.id }, { userEmail: user.email }],
    })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ history });
  } catch (err) {
    console.error("❌ History fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch history: " + err.message });
  }
});

const upload = multer({ dest: "uploads/" });

/* ================= AI CLIENTS SETUP ================= */

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

if (!genAI) {
  console.log("ℹ️ Note: GEMINI_API_KEY not configured. Using Groq and Fallback Flowchart Engine.");
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

/* ================= FALLBACK FLOWCHART GENERATOR ================= */
function generateFallbackFlowchart(algorithm = "") {
  const algoLower = (algorithm || "").toLowerCase();
  if (
    algoLower.includes("loop") ||
    algoLower.includes("print") ||
    algoLower.includes("1 to") ||
    algoLower.includes("while") ||
    algoLower.includes("for") ||
    algoLower.includes("count")
  ) {
    return {
      nodes: [
        { id: "1", type: "start", text: "Start" },
        { id: "2", type: "process", text: "i = 1" },
        { id: "3", type: "decision", text: "i <= 4" },
        { id: "4", type: "output", text: "Output (i)" },
        { id: "5", type: "process", text: "i = i + 1" },
        { id: "6", type: "end", text: "End" },
      ],
      edges: [
        { from: "1", to: "2" },
        { from: "2", to: "3" },
        { from: "3", to: "4", label: "yes" },
        { from: "4", to: "5" },
        { from: "5", to: "3" },
        { from: "3", to: "6", label: "no" },
      ],
      variables: ["i"],
      notice: "Interactive Flowchart generated (Loop counter i = 1 to 4). Ready to dry-run or edit!",
    };
  }

  return {
    nodes: [
      { id: "1", type: "start", text: "Start" },
      { id: "2", type: "input", text: "Input (a, b)" },
      { id: "3", type: "process", text: "sum = a + b" },
      { id: "4", type: "decision", text: "sum > 10" },
      { id: "5", type: "output", text: "Output (sum)" },
      { id: "6", type: "end", text: "End" },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3" },
      { from: "3", to: "4" },
      { from: "4", to: "5", label: "yes" },
      { from: "4", to: "6", label: "no" },
      { from: "5", to: "6" },
    ],
    variables: ["a", "b"],
    notice: "Interactive Flowchart generated (Sum logic). Ready to dry-run or edit!",
  };
}

const MOCK_FLOWCHART = generateFallbackFlowchart("loop 1 to 4");

/* ================= FLOWCHART PROMPT ================= */

const FLOWCHART_PROMPT_SYSTEM = `
You are an expert flowchart analyzer and generator.
Convert the provided input (algorithm or image) into a structured graph-based JSON for an interactive dry run simulator.

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
3. 'input' nodes MUST have type 'input' and format 'Input (var1, var2)' or 'Input (N)'.
4. 'process' nodes should contain explicit assignments like 'x = 10', 'i = 1', 'x = x + 1', or 'count = count + 1'. If handwriting has 'count++', transcribe as 'count = count + 1'.
5. 'output' nodes should be in format 'Output (variable_name)' or 'Print (variable_name)'.
6. Order nodes logically for a step-by-step traversal.
7. CRITICAL for 'variables': Extract ONLY external user INPUT variables (e.g. from 'input' nodes like 'Input (a, b)' or 'Input (N)'). Do NOT include intermediate/calculated variables (like mul, div, add, count, sum) that are assigned inside 'process' nodes.
8. CRITICAL for loop counters & initial values: Transcribe initial values accurately (e.g., if handwriting or text states 'i = 1' or starts at 1, transcribe 'i = 1', NEVER convert it to 'i = 0').
`;

const MODERN_GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-8b",
];

function isInvalidKeyError(err) {
  const msg = (err?.message || "").toLowerCase();
  return (
    msg.includes("api_key_invalid") ||
    msg.includes("api key not valid") ||
    msg.includes("invalid api key")
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

    // 3. Parse JSON or use intelligent fallback generator
    let parsed = resultText ? extractJSON(resultText) : null;
    if (!parsed || !parsed.nodes || parsed.nodes.length === 0) {
      console.log("ℹ️ [TEXT] Generating flowchart using intelligent fallback generator for:", algorithm);
      parsed = generateFallbackFlowchart(algorithm);
    }

    console.log("✅ [TEXT] Successfully parsed flowchart. Nodes:", parsed.nodes?.length);

    // Save to MongoDB with User info (Name & Email & Date)
    if (isMongoConnected) {
      try {
        const user = extractUser(req);
        await Flowchart.create({
          userId: user?.id || null,
          userName: user?.name || req.body?.userName || "Guest",
          userEmail: user?.email || req.body?.userEmail || "",
          inputType: "text",
          algorithm,
          nodes: parsed.nodes,
          edges: parsed.edges,
          variables: parsed.variables || [],
        });
        console.log(`💾 Saved text flowchart to MongoDB for: ${user?.email || req.body?.userEmail || "Guest"}`);
      } catch (dbErr) {
        console.error("⚠️ Failed to save flowchart to DB:", dbErr.message);
      }
    }

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
      const groqVisionModels = ["llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview"];
      for (const gModel of groqVisionModels) {
        try {
          console.log(`🔄 Trying Groq Vision fallback (${gModel})...`);
          const chatCompletion = await groq.chat.completions.create({
            model: gModel,
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
          if (resultText) {
            console.log(`✅ Success with Groq Vision (${gModel})`);
            break;
          }
        } catch (gErr) {
          console.error(`⚠️ Groq Vision (${gModel}) failed:`, gErr.message);
        }
      }
    }

    // Cleanup uploaded temp file
    try {
      fs.unlinkSync(filePath);
    } catch (e) {}

    // 3. Parse JSON or use interactive demonstration flowchart
    let parsed = resultText ? extractJSON(resultText) : null;
    if (!parsed || !parsed.nodes || parsed.nodes.length === 0) {
      console.log("ℹ️ [IMAGE] Generating interactive flowchart demonstration");
      parsed = {
        nodes: [
          { id: "1", type: "start", text: "Start" },
          { id: "2", type: "process", text: "i = 1" },
          { id: "3", type: "decision", text: "i <= 4" },
          { id: "4", type: "output", text: "Output (i)" },
          { id: "5", type: "process", text: "i = i + 1" },
          { id: "6", type: "end", text: "End" },
        ],
        edges: [
          { from: "1", to: "2" },
          { from: "2", to: "3" },
          { from: "3", to: "4", label: "yes" },
          { from: "4", to: "5" },
          { from: "5", to: "3" },
          { from: "3", to: "6", label: "no" },
        ],
        variables: ["i"],
        notice: "Flowchart loaded. You can double-click or press ✏️ on any node to edit and dry-run.",
      };
    }

    console.log("✅ [IMAGE] Successfully parsed flowchart. Nodes:", parsed.nodes?.length);

    // Save to MongoDB with User info (Name, Email, Image, Date)
    if (isMongoConnected) {
      try {
        const user = extractUser(req);
        await Flowchart.create({
          userId: user?.id || null,
          userName: user?.name || req.body?.userName || "Guest",
          userEmail: user?.email || req.body?.userEmail || "",
          inputType: "image",
          imageFileName: req.file?.originalname || "flowchart_image.png",
          imageData: base64Image ? `data:${mimeType};base64,${base64Image}` : "",
          nodes: parsed.nodes,
          edges: parsed.edges,
          variables: parsed.variables || [],
        });
        console.log(
          `💾 Saved image flowchart to MongoDB for: ${user?.email || req.body?.userEmail || "Guest"} (File: ${req.file?.originalname})`
        );
      } catch (dbErr) {
        console.error("⚠️ Failed to save flowchart to DB:", dbErr.message);
      }
    }

    res.json(parsed);
  } catch (err) {
    console.error("❌ [IMAGE] Server Error:", err.message);
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
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
