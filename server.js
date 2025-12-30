import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const HL_ACCOUNT = process.env.HL_ACCOUNT;

if (!HL_PRIVATE_KEY || !HL_ACCOUNT) {
  console.error("❌ Missing ENV");
  process.exit(1);
}

if (!HL_PRIVATE_KEY.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY must start with 0x");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", HL_ACCOUNT);

const HL_ENDPOINT = "https://api.hyperliquid.xyz/exchange";

function sign(action, nonce) {
  const payload = JSON.stringify({ action, nonce });
  return (
    "0x" +
    crypto
      .createHash("sha256")
      .update(payload + HL_PRIVATE_KEY.slice(2))
      .digest("hex")
  );
}

async function send(action) {
  const nonce = Date.now();
  const signature = sign(action, nonce);

  const body = {
    action,
    nonce,
    signature,
  };

  console.log("📤 HL BODY:", JSON.stringify(body, null, 2));

  const res = await fetch(HL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log("📥 HL RESPONSE:", text);
  return text;
}

app.post("/webhook", async (req, res) => {
  try {
    const side = req.body.side;
    if (!side) return res.status(400).json({ error: "missing side" });

    console.log("📩 WEBHOOK:", side);

    // 1️⃣ SET LEVERAGE 10x CROSS
    await send({
      type: "updateLeverage",
      asset: 0,
      isCross: true,
      leverage: 10,
    });

    // 2️⃣ ORDER
    await send({
      type: "order",
      orders: [
        {
          asset: 0,
          isBuy: side === "long",
          size: "ALL",
          limitPx: null,
          reduceOnly: false,
          orderType: { market: {} },
        },
      ],
    });

    res.json({ success: true });
  } catch (e) {
    console.error("❌ ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log("🚀 BOT LIVE on", PORT);
});
