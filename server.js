import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(express.json());

const {
  HL_WALLET,
  HL_PRIVATE_KEY,
} = process.env;

if (!HL_WALLET || !HL_PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

const HL_API = "https://api.hyperliquid.xyz";

/* ===================== */
/* SIGNING               */
/* ===================== */
function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY, "hex"))
    .update(payload)
    .digest("hex");
}

/* ===================== */
/* API CALL              */
/* ===================== */
async function hlPost(body) {
  const nonce = Date.now();
  body.nonce = nonce;

  const payload = JSON.stringify(body);
  const signature = sign(payload);

  const res = await fetch(`${HL_API}/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Wallet": HL_WALLET,
      "X-Signature": signature,
    },
    body: payload,
  });

  const text = await res.text(); // ⬅️ KLUCZ

  // próbujemy JSON, ale NIE zakładamy że się uda
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

/* ===================== */
/* EXECUTION             */
/* ===================== */
async function openLong() {
  return hlPost({
    type: "order",
    orders: [
      {
        asset: "BTC",
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: 0.001, // TESTOWO — MAŁA ILOŚĆ
      },
    ],
  });
}

/* ===================== */
/* WEBHOOK               */
/* ===================== */
app.post("/webhook", async (req, res) => {
  const { side } = req.body;
  console.log("📩 WEBHOOK:", side);

  try {
    if (side === "long") {
      const result = await openLong();
      return res.json({ status: "long opened", result });
    }

    return res.status(422).json({ error: "invalid payload" });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    return res.status(500).json({
      error: "execution failed",
      reason: err.message,
    });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(10000, () => {
  console.log("🚀 BOT LIVE on 10000");
});
