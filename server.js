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
        status: "flagged",
        error: "imageBase64 and mimeType are required."
      });
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return res.status(400).json({
        ok: false,
        status: "flagged",
        error: "Only JPG, PNG and WebP images are supported."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        status: "flagged",
        error: "GEMINI_API_KEY is not configured on the server."
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Modern supported Gemini model endpoint
    const model = genAI.getGenerativeModel({
      model: "gemini-3.6-flash"
    });

    const prompt = `
You are an ID and Person verification classifier.

PERMITTED CATEGORIES (Set status to "verified"):
1. Personal ID Documents: Aadhaar, PAN card, Passport, Driving License, Voter ID, or any government ID document.
2. Human Photos: Clear face, portrait, selfie, or person photo.

FORBIDDEN CATEGORIES (Set status to "flagged"):
- Objects, flowers, plants, trees, animals, pets, vehicles, cars, bikes, electronics, home appliances, buildings, scenery, blank screens, or any non-human objects.

RULES:
- If the image contains ANY forbidden non-human object (e.g. flower, animal, car, appliance), set status to "flagged".
- ONLY set status to "verified" if the image clearly contains an ID document or a human face/portrait.
- Do NOT extract or output sensitive personal data like ID numbers or addresses.

Respond ONLY with JSON matching this exact structure:
{
  "status": "verified" or "flagged",
  "documentType": "string describing type (e.g. ID Document, Human Photo, Flower, Vehicle)",
  "note": "short reason"
}
`;

    let responseText = "";
    let attempts = 0;
    const maxAttempts = 3;

    // Retry loop to handle 503 high demand spikes automatically
    while (attempts < maxAttempts) {
      try {
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
        attempts++;
        console.warn(`Gemini API Attempt ${attempts} failed: ${err.message}`);
        if (attempts >= maxAttempts) throw err;
        // Wait 1.5 seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    let text = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        status: "flagged",
        error: "Could not evaluate image. Please try again."
      });
    }

    const isVerified = result.status === "verified";

    return res.json({
      ok: true,
      status: isVerified ? "verified" : "flagged",
      documentType: String(result.documentType || "Unknown"),
      note: String(result.note || "Validation complete.")
    });

  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      ok: false,
      status: "flagged",
      error: "Verification failed due to high AI load. Please try again in a moment."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Virundhu backend running on port ${PORT}`);
});