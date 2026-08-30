const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Virundhu ultra-fast Cloudflare backend running." });
});

app.post("/verify", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ ok: false, status: "flagged", error: "Image base64 required." });
    }

    // Convert Base64 string to raw binary byte buffer
    const imageBuffer = Buffer.from(imageBase64, "base64");

    // Cloudflare Account ID and API Token
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "YOUR_CLOUDFLARE_ACCOUNT_ID";
    const apiToken = process.env.CLOUDFLARE_API_TOKEN || "cf081adaee8e1d76bac483629efe000b";

    // Sub-200ms ResNet-50 Vision Classification Endpoint
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/microsoft/resnet-50`;

    const cfResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/octet-stream"
      },
      body: imageBuffer
    });

    if (!cfResponse.ok) {
      console.error("Cloudflare API error status:", cfResponse.status);
      return res.status(500).json({ ok: false, status: "flagged", error: "Cloudflare classification failed." });
    }

    const data = await cfResponse.json();
    const results = data.result || [];

    // Allowed human and document-related tags from ResNet-50 vision model
    const allowedCategories = [
      "person", "human", "face", "identity", "passport", "card",
      "document", "paper", "man", "woman", "boy", "girl", "portrait"
    ];

    // Forbidden non-human subjects
    const forbiddenCategories = [
      "flower", "rose", "plant", "tree", "animal", "dog", "cat",
      "car", "vehicle", "truck", "appliance", "building", "fruit", "food"
    ];

    let isVerified = false;
    let detectedLabel = "Unknown";

    for (const item of results) {
      const label = item.label.toLowerCase();
      
      // Stop if a forbidden object is detected with higher confidence
      if (forbiddenCategories.some(f => label.includes(f))) {
        detectedLabel = item.label;
        isVerified = false;
        break;
      }

      // Mark verified if a human or document concept is detected
      if (allowedCategories.some(a => label.includes(a))) {
        detectedLabel = item.label;
        isVerified = true;
        break;
      }
    }

    return res.json({
      ok: true,
      status: isVerified ? "verified" : "flagged",
      documentType: detectedLabel,
      note: isVerified ? "Human photo or ID recognized." : "Rejected non-human/non-ID photo."
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