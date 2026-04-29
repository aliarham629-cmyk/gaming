import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy init Gemini
let genAI: GoogleGenAI | null = null;
function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured on the server.");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Check if system key is available
  app.get("/api/config", (req, res) => {
    res.json({ 
      hasSystemKey: !!process.env.GEMINI_API_KEY,
      environment: process.env.NODE_ENV || "development"
    });
  });

  // Proxy Gemini Generation
  app.post("/api/generate", async (req, res) => {
    try {
      const { prompt, schema, keyword } = req.body;
      const ai = getGenAI();
      const model = ai.models.get("gemini-3-flash-preview");

      const result = await model.generateContent({
        contents: prompt.replace("${keyword}", keyword),
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      res.json({ text: result.text });
    } catch (error: any) {
      console.error("Gemini Proxy Error:", error);
      res.status(500).json({ error: error.message || "Generation failed" });
    }
  });

  app.post("/api/wp/test", (req, res) => {
    res.json({ status: "success", message: "WordPress connection check not fully implemented yet" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
