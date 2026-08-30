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
You are helping a catering-staff marketplace perform a LIMITED document-quality
and plausibility check.

Analyze the uploaded ID image only for:
1. Whether it appears to be an ID/document.
2. Whether it is reasonably clear and readable.
3. Whether all/most document corners are visible and it is not badly cropped.
4. Whether there are obvious signs of a screenshot, severe blur, glare, or obvious editing.
5. What document type it appears to be, if reasonably clear.

IMPORTANT:
- Do NOT provide, repeat, extract, or store any person's ID number, address,
  date of birth, or other sensitive personal information.
- Do NOT claim that the document is legally authentic or that it was checked
  against a government database.
- Do NOT identify the person.
- Give a simple result: "verified" only when the image is clear enough and
  plausibly looks like an ID; otherwise "flagged".
- Include a short reason suitable for showing to the worker.

Return ONLY valid JSON in this exact shape:
{
  "status": "verified" or "flagged",
  "documentType": "string",
  "note": "short string"
}
`;

    // Try primary model, fallback to alternative models if high demand (503 error) occurs
    const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.5-flash"];
    let responseText = "";

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
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
        if (responseText) break; // Successfully got response
      } catch (err) {
        console.warn(`Model ${modelName} failed, trying next fallback...`, err.message);
      }
    }

    if (!responseText) {
      return res.status(503).json({
        ok: false,
        error: "AI service busy. Please try again in a few seconds."
      });
    }

    let text = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return res.status(502).json({
        ok: false,
        error: "Gemini returned an unexpected response."
      });
    }

    const status = result.status === "verified" ? "verified" : "flagged";

    return res.json({
      ok: true,
      status,
      documentType: String(result.documentType || "ID document"),
      note: String(result.note || "Document image checked.")
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      ok: false,
      error: "AI verification failed. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Virundhu backend running on port ${PORT}`);
});
