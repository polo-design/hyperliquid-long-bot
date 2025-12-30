import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* ===================== CONFIG ===================== */

const PORT = process.env.PORT || 10000;
const HL_API = "https://api.hyperliquid.xyz/exchange";

const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const ACCOUNT = process.env.HL_ACCOUNT;

if (!PRIVATE_KEY || !ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

if (!PRIVATE_KEY.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY must start with 0x");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

/* ===================== HELPERS ===================== */

function signPayload(payload) {
  const msg = JSON.stringify(payload);
  return (
    "0x" +
    crypto
      .createHmac("sha256", Buffer.from(PRIVATE_KEY.slice(2), "hex"))
      .update(msg)
      .digest("hex")
  );
}

async function hlRequest(payload) {
  const signature = signPayload(payload);

  console.log("📤 HL PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("✍️ SIGNATURE:", signature);

  const res = await fetch(HL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "HX-ACCOUNT": ACCOUNT,
      "HX-SIGNATURE": signature,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log("📥 HL RESPONSE:", text);

  return text;
}

/* ===================== WEBHOOK ===================== */

app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    console.log("📩 WEBHOOK:", side);

    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid side" });
    }

    const isBuy = side === "long";

    /* ====== 1️⃣ SET LEVERAGE 10x ====== */
    console.log("⚙️ SET LEVERAGE 10x");

    await hlRequest({
      type: "updateLeverage",
      asset: 0,        // BTC
      leverage: 10,
      isCross: true,
    });

    /* ====== 2️⃣ PLACE REAL MARKET ORDER ====== */
    console.log(`🚀 REAL ORDER: ${side.toUpperCase()}`);

    // ⚠️ NAJWAŻNIEJSZE:
    // p = 0  → MARKET
    // s = LICZBA (np. 0.001 BTC)
    // żadnych null, żadnych "ALL"

    const ORDER_SIZE_BTC = 0.001; // 🔴 ZMIENIASZ TYLKO TO

    const result = await hlRequest({
      type: "order",
      orders: [
        {
          a: 0,                 // BTC
          b: isBuy,             // true = long, false = short
          p: 0,                 // MARKET
          s: ORDER_SIZE_BTC,    // LICZBA
          r: false,
          ioc: true,
        },
      ],
    });

    return res.json({
      success: true,
      side,
      size: ORDER_SIZE_BTC,
      result,
    });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/* ===================== START ===================== */

app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
