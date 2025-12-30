import express from "express";

const app = express();
app.use(express.json());

/* =========================
   ENV
========================= */
const HL_ACCOUNT = process.env.HL_ACCOUNT;        // 0x...
const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY; // hex

if (!HL_ACCOUNT || !HL_PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

/* =========================
   CONFIG
========================= */
const HL_API = "https://api.hyperliquid.xyz";
const ASSET = "BTC-USD";          // ⚠️ ważne
const TEST_SIZE = 0.01;            // testowy size (BTC)

/* =========================
   HELPERS
========================= */
async function hlPost(body) {
  const res = await fetch(`${HL_API}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text(); // ← KLUCZ
  return { status: res.status, text };
}

/* =========================
   TRADING
========================= */
async function openLong() {
  const body = {
    type: "order",
    orders: [
      {
        asset: ASSET,
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: TEST_SIZE,
      },
    ],
    wallet: HL_ACCOUNT,
  };

  return await hlPost(body);
}

async function closePosition() {
  const body = {
    type: "order",
    orders: [
      {
        asset: ASSET,
        isBuy: false,
        reduceOnly: true,
        orderType: { market: {} },
        sz: TEST_SIZE,
      },
    ],
    wallet: HL_ACCOUNT,
  };

  return await hlPost(body);
}

/* =========================
   WEBHOOK
========================= */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    console.log("📩 WEBHOOK:", side);

    if (side !== "long" && side !== "short") {
      return res.status(422).json({ error: "invalid payload" });
    }

    const result =
      side === "long" ? await openLong() : await closePosition();

    console.log("🔁 HL RESPONSE:", result.text);

    if (result.status !== 200) {
      return res.status(500).json({
        error: "execution failed",
        hl_response: result.text,
      });
    }

    return res.json({ status: "sent", side });
  } catch (err) {
    console.error("❌ EXEC ERROR:", err.message);
    return res.status(500).json({ error: "internal error" });
  }
});

/* =========================
   HEALTH
========================= */
app.get("/", (_, res) => res.json({ status: "alive" }));

/* =========================
   START
========================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
