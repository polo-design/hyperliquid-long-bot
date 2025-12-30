import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

/* ================== ENV ================== */
const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const HL_ACCOUNT = process.env.HL_ACCOUNT;

if (!HL_PRIVATE_KEY || !HL_ACCOUNT) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

if (!HL_PRIVATE_KEY.startsWith("0x")) {
  console.error("❌ HL_PRIVATE_KEY must start with 0x");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", HL_ACCOUNT);

/* ================== CONST ================== */
const PORT = process.env.PORT || 10000;
const HL_API = "https://api.hyperliquid.xyz/exchange";
const BTC_ASSET_ID = 0; // BTC-USDC PERP
const LEVERAGE = 10;

/* ================== HELPERS ================== */
function signPayload(payload) {
  const msg = JSON.stringify(payload);
  return (
    "0x" +
    crypto
      .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY.slice(2), "hex"))
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
      "HL-ACCOUNT": HL_ACCOUNT,
      "HL-SIGNATURE": signature,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log("📥 HL RESPONSE:", text);
  return text;
}

/* ================== WEBHOOK ================== */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid payload" });
    }

    console.log("📩 WEBHOOK:", side.toUpperCase());

    /* ---- SET LEVERAGE ---- */
    const leveragePayload = {
      type: "updateLeverage",
      asset: BTC_ASSET_ID,
      leverage: LEVERAGE,
      isCross: true,
    };

    console.log(`⚙️ SET LEVERAGE ${LEVERAGE}x`);
    await hlRequest(leveragePayload);

    /* ---- PLACE REAL ORDER (ALL IN) ---- */
    const orderPayload = {
      type: "order",
      orders: [
        {
          a: BTC_ASSET_ID,       // asset
          b: side === "long",    // buy = true / sell = false
          p: null,               // MARKET
          s: "ALL",              // 100% balance
          r: false,
          ioc: true,
        },
      ],
    };

    console.log("🚀 REAL ORDER:", side.toUpperCase());
    const result = await hlRequest(orderPayload);

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: "execution failed" });
  }
});

/* ================== START ================== */
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
