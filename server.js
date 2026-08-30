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
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });

    const prompt = `
You are a strict binary classifier. Look at the image and check ONLY:
1. Does it contain a human photo, face, person, or a valid ID document/proof?
2. Does it contain anything else (like flowers, animals, vehicles, trees, fruits, electronics, home appliances, buildings, scenery, objects)?

IMPORTANT INSTRUCTIONS:
- IGNORE image quality, blur, brightness, or cropping completely. Do not reject photos just because they are blurry, dark, or cropped.
- If it contains a human photo, face, or an ID document, set status to "verified".
- If it contains flowers, animals, vehicles, trees, fruits, or any other non-human objects, set status to "flagged".

Return ONLY valid JSON in this exact structure:
{
  "status": "verified" or "flagged",
  "documentType": "Human Photo / ID Document / Other Object",
  "note": "Checked"
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
        status: "flagged",
        error: "Could not evaluate image."
      });
    }

    const status = result.status === "verified" ? "verified" : "flagged";

    return res.json({
      ok: true,
      status,
      documentType: String(result.documentType || "Unknown"),
      note: String(result.note || "Checked.")
    });

  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      ok: false,
      status: "flagged",
      error: "Verification failed. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Virundhu backend running on port ${PORT}`);
});