import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

/* =========================
   ENV
========================= */
const {
  HL_PRIVATE_KEY,
  HL_ACCOUNT,
  PORT = 10000,
} = process.env;

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

/* =========================
   CONSTANTS
========================= */
const HL_API = "https://api.hyperliquid.xyz/exchange";
const ASSET_ID = 0; // BTC-PERP
const LEVERAGE = 10;

/* =========================
   SIGN
========================= */
function sign(payload) {
  const msg = JSON.stringify(payload);
  const hash = crypto
    .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY.slice(2), "hex"))
    .update(msg)
    .digest("hex");
  return "0x" + hash;
}

/* =========================
   POST TO HL
========================= */
async function postHL(payload) {
  const sig = sign(payload);

  console.log("📤 HL PAYLOAD:", JSON.stringify(payload, null, 2));
  console.log("✍️ SIGNATURE:", sig);

  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: payload,
      signature: sig,
      account: HL_ACCOUNT,
    }),
  });

  const text = await res.text();
  console.log("📥 HL RESPONSE:", text);
  return text;
}

/* =========================
   WEBHOOK
========================= */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!["long", "short"].includes(side)) {
      return res.status(400).json({ error: "side must be long or short" });
    }

    console.log("📩 WEBHOOK:", side);

    /* ---- SET LEVERAGE ---- */
    console.log(`⚙️ SET LEVERAGE ${LEVERAGE}x`);
    await postHL({
      type: "updateLeverage",
      asset: ASSET_ID,
      leverage: LEVERAGE,
      isCross: true,
    });

    /* ---- MARKET ORDER ---- */
    console.log(`🚀 REAL ORDER: ${side.toUpperCase()}`);
    const orderResult = await postHL({
      type: "order",
      orders: [
        {
          a: ASSET_ID,
          b: side === "long", // true = buy / false = sell
          p: null,            // market
          s: "ALL",           // full size
          r: false,
          ioc: true,
        },
      ],
    });

    res.json({ success: true, result: orderResult });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
