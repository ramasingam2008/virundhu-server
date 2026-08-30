const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Virundhu AI backend running." });
});

app.post("/verify", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ ok: false, status: "flagged", error: "Image required." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, status: "flagged", error: "Missing API Key." });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Fast model with speed constraints
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 50, // Ultra-fast response cutoff
        temperature: 0.0
      }
    });

    const prompt = `
Is this image a human photo, human face, or personal ID document?
- "verified" if human face/photo OR ID document/proof.
- "flagged" if flowers, animals, vehicles, trees, fruits, objects, or appliances.

Ignore blur, quality, or cropping.
Output exact JSON: {"status": "verified" or "flagged"}
`;

    const response = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: imageBase64
        }
      }
    ]);

    const result = JSON.parse(response.response.text().trim());
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
      error: "Verification error. Please retry."
    });
  }
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));