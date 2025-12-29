import express from "express";
import axios from "axios";
import crypto from "crypto";

const app = express();
app.use(express.json());

// =======================
// ENV (USTAW NA RENDERZE)
// =======================
const HL_API = "https://api.hyperliquid.xyz";
const HL_ACCOUNT = process.env.HL_ACCOUNT;     // 0x...
const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY; // hex bez 0x
const TRADE_PERCENT = 0.9; // 90%
const SYMBOL = "BTC"; // BTC PERP

if (!HL_ACCOUNT || !HL_PRIVATE_KEY) {
  throw new Error("BRAK HL_ACCOUNT lub HL_PRIVATE_KEY w ENV");
}

// =======================
// SIGN
// =======================
function sign(payload) {
  return crypto
    .createHmac("sha256", Buffer.from(HL_PRIVATE_KEY, "hex"))
    .update(payload)
    .digest("hex");
}

async function hlPost(endpoint, body) {
  const payload = JSON.stringify(body);
  const sig = sign(payload);

  const res = await axios.post(`${HL_API}${endpoint}`, body, {
    headers: {
      "Content-Type": "application/json",
      "X-Signature": sig,
      "X-Wallet": HL_ACCOUNT,
    },
    timeout: 10_000,
  });

  return res.data;
}

// =======================
// BALANCE (ACCOUNT VALUE)
// =======================
async function getAccountValue() {
  const res = await axios.post(
    `${HL_API}/info`,
    { type: "userState", wallet: HL_ACCOUNT },
    { timeout: 10_000 }
  );
  return Number(res.data.marginSummary.accountValue);
}

// =======================
// ORDERS
// =======================
async function openLong90() {
  const accountValue = await getAccountValue();
  const notional = accountValue * TRADE_PERCENT;

  return hlPost("/exchange", {
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: true,
        reduceOnly: false,
        orderType: { market: {} },
        sz: notional,
      },
    ],
  });
}

async function closeAll() {
  return hlPost("/exchange", {
    type: "order",
    orders: [
      {
        asset: SYMBOL,
        isBuy: false,
        reduceOnly: true,
        orderType: { market: {} },
        sz: "ALL",
      },
    ],
  });
}

// =======================
// WEBHOOK
// =======================
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;

    if (side === "long") {
      const r = await openLong90();
      return res.json({ ok: true, action: "LONG_OPENED", r });
    }

    if (side === "short") {
      const r = await closeAll();
      return res.json({ ok: true, action: "CLOSED", r });
    }

    return res.status(400).json({ error: "invalid payload", expected: { side: "long|short" } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// =======================
// HEALTH
// =======================
app.get("/", (_, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("BOT LIVE on", PORT));
