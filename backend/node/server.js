require("dotenv").config();

const express = require("express");
const multer = require("multer");
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");
const twilio = require("twilio");

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false })); // IMPORTANT for Twilio

// =====================
// ENV CHECK (optional but useful)
// =====================
console.log("Twilio SID loaded:", !!process.env.TWILIO_ACCOUNT_SID);

// =====================
// PATHS
// =====================
const TEMP_DIR = path.join(__dirname, "..", "temp_audio");
const PYTHON_SCRIPT = path.join(__dirname, "..", "python", "inference.py");

// =====================
// ENSURE TEMP DIR EXISTS
// =====================
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// =====================
// MULTER SETUP
// =====================
const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// =====================
// HEALTH CHECK
// =====================
app.get("/", (req, res) => {
  res.send("Server alive");
});

// =====================
// STANDARD API PREDICT
// =====================
app.post("/predict", upload.single("audio"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No audio file" });
  }

  const uploadedPath = path.resolve(req.file.path);
  const wavPath = uploadedPath + ".wav";
  
  // Extract metadata from request body
  const ac = req.body.ac || "0";  // age 60+ (0 or 1)
  const nth = req.body.nth || "0";  // neurological history (0 or 1)
  const htn = req.body.htn || "0";  // hypertension (0 or 1)
  const updrs = req.body.updrs || "0";  // UPDRS score (0-108)

  console.log("📥 Received audio file:", req.file.originalname);
  console.log("📊 Metadata - ac:", ac, "nth:", nth, "htn:", htn, "updrs:", updrs);

  // Convert to WAV using ffmpeg (handles any audio format)
  execFile(
    "ffmpeg",
    ["-y", "-i", uploadedPath, "-ar", "16000", "-ac", "1", wavPath],
    { timeout: 10000 },
    (ffmpegErr) => {
      // Clean up original file
      fs.unlink(uploadedPath, () => {});

      if (ffmpegErr) {
        console.error("❌ ffmpeg conversion failed:", ffmpegErr);
        fs.unlink(wavPath, () => {});
        return res.status(500).json({ error: "Audio conversion failed", details: ffmpegErr.message });
      }

      console.log("✅ Audio converted to WAV");

      // Run Python inference
      execFile(
        "python3",
        [PYTHON_SCRIPT, wavPath, ac, nth, htn, updrs],
        { timeout: 20000 },
        (error, stdout, stderr) => {
          // Clean up WAV file
          fs.unlink(wavPath, () => {});

          if (error) {
            console.error("❌ Python error:", error);
            console.error("stderr:", stderr);
            return res.status(500).json({ error: "Inference failed", details: stderr });
          }

          try {
            const result = JSON.parse(stdout.trim());
            console.log("✅ Analysis result:", result);
            res.json(result);
          } catch (e) {
            console.error("❌ JSON parse error:", stdout);
            res.status(500).json({ error: "Invalid inference output", output: stdout });
          }
        }
      );
    }
  );
});

// =====================
// TWILIO REPLY HELPER
// =====================
function sendWhatsAppReply(res, message) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}

// =====================
// WHATSAPP WEBHOOK
// =====================

app.get("/whatsapp", (req, res) => {
  res.send("WhatsApp webhook reachable");
});

app.post("/whatsapp", async (req, res) => {
  try {
    console.log("📩 WhatsApp webhook hit");

    const numMedia = parseInt(req.body.NumMedia || "0");

    if (numMedia === 0) {
      return sendWhatsAppReply(
        res,
        "🎙️ Please send a *voice note* (5–10 seconds) for NeuroVoice screening."
      );
    }

    const mediaUrl = req.body.MediaUrl0;
    const mediaType = req.body.MediaContentType0;

    if (!mediaType || !mediaType.startsWith("audio")) {
      return sendWhatsAppReply(
        res,
        "❌ Only *voice notes* are supported. Please try again."
      );
    }

    // -----------------------
    // Download audio from Twilio
    // -----------------------
    const audioResponse = await axios.get(mediaUrl, {
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
      responseType: "arraybuffer",
    });

    const timestamp = Date.now();
    const oggPath = path.join(TEMP_DIR, `input_${timestamp}.ogg`);
    const wavPath = path.join(TEMP_DIR, `input_${timestamp}.wav`);

    fs.writeFileSync(oggPath, audioResponse.data);
    console.log("🎧 OGG audio saved:", oggPath);

    // -----------------------
    // Convert OGG → WAV (ffmpeg)
    // -----------------------
    execFile(
      "ffmpeg",
      ["-y", "-i", oggPath, wavPath],
      (ffmpegErr) => {
        fs.unlink(oggPath, () => {});

        if (ffmpegErr) {
          console.error("❌ ffmpeg conversion failed:", ffmpegErr);
          return sendWhatsAppReply(
            res,
            "⚠️ Audio conversion failed. Please resend the voice note."
          );
        }

        console.log("🎵 WAV audio ready:", wavPath);

        // -----------------------
        // Run Python inference on WAV
        // -----------------------
        execFile(
          "python3",
          [PYTHON_SCRIPT, wavPath],
          { timeout: 20000 },
          (error, stdout, stderr) => {
            fs.unlink(wavPath, () => {});

            if (stderr) {
              console.warn("⚠️ Python stderr:", stderr);
            }

            if (error) {
              console.error("❌ Python inference error:", error);
              return sendWhatsAppReply(
                res,
                "⚠️ Analysis failed. Please try again."
              );
            }

            let result;
            try {
              result = JSON.parse(stdout.trim());
            } catch (e) {
              console.error("❌ Invalid JSON from Python:", stdout);
              return sendWhatsAppReply(
                res,
                "⚠️ Could not process audio. Please retry."
              );
            }

            const reply = `
🧠 *NeuroVoice Screening Result*

📊 Risk Score: *${result.risk_score}*
⚠️ Risk Level: *${result.risk_level}*

_Not a medical diagnosis._
            `.trim();

            return sendWhatsAppReply(res, reply);
          }
        );
      }
    );
  } catch (err) {
    console.error("❌ WhatsApp webhook error:", err);
    return sendWhatsAppReply(
      res,
      "⚠️ Internal server error."
    );
  }
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`🚀 NeuroVoice backend running on port ${PORT}`);
});