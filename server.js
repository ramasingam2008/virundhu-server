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
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const prompt = `
Analyze the uploaded image with STRICT compliance:

PERMITTED CATEGORIES (Set status to "verified"):
1. Personal ID Documents: Aadhaar, PAN card, Passport, Driving License, Voter ID, or any government photo ID.
2. Human Photos: A clear person's face, portrait, selfie, or profile photo of a human being.

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

    const response = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: imageBase64
        }
      }
    ]);

    const responseText = response.response.text() || "";
    let text = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "AI produced an unreadable evaluation. Please re-upload."
      });
    }

    const status = result.status === "verified" ? "verified" : "flagged";

    return res.json({
      ok: true,
      status,
      documentType: String(result.documentType || "Unknown"),
      note: String(result.note || "Image validation complete.")
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      ok: false,
      error: "Verification failed. Please upload a clear photo of an ID or human."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Virundhu backend running on port ${PORT}`);
});
