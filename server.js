const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Virundhu AI verification backend is running."
  });
});

app.post("/verify", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({
        ok: false,
        error: "imageBase64 and mimeType are required."
      });
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return res.status(400).json({
        ok: false,
        error: "Only JPG, PNG and WebP images are supported."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Lenient prompt to quickly pass almost any ID image
    const prompt = `
Perform an extremely fast and relaxed check on this image.

RULES:
1. If the image resembles an ID card, document, license, or photo ID in ANY way, classify it as "verified".
2. Be VERY forgiving: Accept photos even if they are blurry, tilted, slightly dark, or cropped.
3. Only mark as "flagged" if the image is completely unrelated (e.g. a picture of a cat or blank screen).

Return ONLY valid JSON in this exact format:
{
  "status": "verified" or "flagged",
  "documentType": "ID document",
  "note": "Document verified."
}
`;

    // Multiple models fallback list
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-2.0-flash",
      "gemini-2.5-flash"
    ];

    let responseText = "";

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { maxOutputTokens: 100 } // Fast response setting
        });

        const response = await model.generateContent([
          prompt,
          {
            inlineData: {
              mimeType,
              data: imageBase64
            }
          }
        ]);

        responseText = response.response.text() || "";
        if (responseText) break; // Break loop if response is received
      } catch (err) {
        console.warn(`Model ${modelName} failed, trying next fallback...`, err.message);
      }
    }

    // Auto-pass safety net if all models are busy
    if (!responseText) {
      return res.json({
        ok: true,
        status: "verified",
        documentType: "ID document",
        note: "Automatically approved."
      });
    }

    let text = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { status: "verified" };
    }

    const status = result.status === "flagged" ? "flagged" : "verified";

    return res.json({
      ok: true,
      status,
      documentType: String(result.documentType || "ID document"),
      note: String(result.note || "Document checked.")
    });
  } catch (error) {
    console.error("Verification error:", error);
    // Instant fallback pass so users are never blocked by API issues
    return res.json({
      ok: true,
      status: "verified",
      documentType: "ID document",
      note: "Accepted automatically."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Virundhu backend running on port ${PORT}`);
});
