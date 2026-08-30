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

    const prompt = `
Analyze the uploaded image with STRICT compliance to these instructions:

PERMITTED CATEGORIES (Set status to "verified"):
1. Personal ID Documents: Aadhaar, PAN card, Passport, Driving License, Voter ID, or any government photo ID.
2. Human Photos: A person's face, portrait, selfie, or full-body photo of a human being.

FORBIDDEN CATEGORIES (Set status to "flagged"):
- Objects, flowers, plants, trees, animals, pets, vehicles, cars, bikes, electronics, home appliances, buildings, bridges, scenery, blank screens, or non-human items.

RULES:
- If the image contains ANY forbidden object (e.g., flower, animal, car, appliance), set "status" to "flagged".
- ONLY set "status" to "verified" if the image clearly shows an ID proof or a human photo.
- Do NOT extract or return sensitive personal data like ID numbers or full addresses.

Return ONLY valid JSON in this exact structure:
{
  "status": "verified" or "flagged",
  "documentType": "ID Proof / Human Photo / Rejected Object",
  "note": "Short reason explaining acceptance or rejection"
}
`;

    // Valid production models array
    const modelsToTry = [
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro-latest",
      "gemini-2.5-flash"
    ];

    let responseText = "";

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { 
            maxOutputTokens: 150,
            temperature: 0.1
          } 
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
        if (responseText) break;
      } catch (err) {
        console.warn(`Model ${modelName} failed:`, err.message);
      }
    }

    if (!responseText) {
      return res.status(503).json({
        ok: false,
        error: "AI verification busy. Please try again in a few seconds."
      });
    }

    let text = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "Unreadable AI output. Please re-upload image."
      });
    }

    const status = result.status === "verified" ? "verified" : "flagged";

    return res.json({
      ok: true,
      status,
      documentType: String(result.documentType || "Unknown"),
      note: String(result.note || "Validation complete.")
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      ok: false,
      error: "Verification request failed. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Virundhu backend running on port ${PORT}`);
});
