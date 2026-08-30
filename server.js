const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Virundhu fast AI backend running." });
});

app.post("/verify", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ ok: false, status: "flagged", error: "Image required." });
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");

    // Hugging Face Vision API (Free & Fast - No Account ID needed)
    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large",
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: imageBuffer
      }
    );

    if (!hfResponse.ok) {
      console.error("HF Status:", hfResponse.status);
      return res.status(500).json({ ok: false, status: "flagged", error: "Vision API busy." });
    }

    const data = await hfResponse.json();
    const caption = (data[0]?.generated_text || "").toLowerCase();

    // Allowed human & document concepts
    const allowedKeywords = [
      "person", "man", "woman", "human", "face", "boy", "girl",
      "selfie", "portrait", "card", "document", "passport", "paper", "id"
    ];

    // Forbidden objects
    const forbiddenKeywords = [
      "flower", "rose", "plant", "tree", "animal", "dog", "cat",
      "car", "vehicle", "truck", "appliance", "building", "fruit", "food"
    ];

    const hasForbidden = forbiddenKeywords.some(word => caption.includes(word));
    const hasAllowed = allowedKeywords.some(word => caption.includes(word));

    const isVerified = hasAllowed && !hasForbidden;

    return res.json({
      ok: true,
      status: isVerified ? "verified" : "flagged",
      documentType: caption || "Image evaluated",
      note: isVerified ? "Human or ID recognized." : "Rejected non-human/non-ID subject."
    });

  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      ok: false,
      status: "flagged",
      error: "Verification failed. Please retry."
    });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));