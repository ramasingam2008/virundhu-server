const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Virundhu AI backend running." });
});

app.post("/verify", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ ok: false, status: "flagged", error: "No image payload provided." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, status: "flagged", error: "Missing API Key configuration." });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Active production endpoint
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Check if this image is a human photo/face OR an ID document.
- If YES (human photo or ID card/document), output {"status": "verified"}
- If NO (flowers, animals, vehicles, trees, fruits, electronics, objects), output {"status": "flagged"}

Ignore image quality, blur, brightness, or cropping.
Return ONLY raw JSON in this exact shape: {"status": "verified" or "flagged"}`
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const responseText = response.text || "";
    const cleanJson = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    
    let result;
    try {
      result = JSON.parse(cleanJson);
    } catch {
      return res.status(502).json({ ok: false, status: "flagged", error: "Evaluation read error." });
    }

    const isVerified = result.status === "verified";

    return res.json({
      ok: true,
      status: isVerified ? "verified" : "flagged",
      note: isVerified ? "Accepted" : "Rejected non-human/non-ID photo"
    });

  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      ok: false,
      status: "flagged",
      error: "Verification failed. Retry in a moment."
    });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));