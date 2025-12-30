import express from "express";
import crypto from "crypto";
import https from "https";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const ACCOUNT = process.env.HL_ACCOUNT;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

if (!ACCOUNT || !PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", ACCOUNT);

/* =========================
   LOW-LEVEL HTTPS REQUEST
========================= */
function hlRequest(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);

    const req = https.request(
      {
        hostname: "api.hyperliquid.xyz",
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let out = "";
        res.on("data", (d) => (out += d));
        res.on("end", () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(out);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/* =========================
   SIGN PAYLOAD (HL STYLE)
========================= */
function signPayload(payload) {
  const msg = JSON.stringify(payload);
  const hash = crypto.createHash("sha256").update(msg).digest();

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(hash);
  sign.end();

  // HL expects secp256k1 raw signature → simulate via ECDSA
  const signature = crypto
    .createHmac("sha256", Buffer.from(PRIVATE_KEY, "hex"))
    .update(hash)
    .digest("hex");

  return signature;
}

/* =========================
   GET ACCOUNT STATE
========================= */
async function getAccountState() {
  return hlRequest("/info", {
    type: "accountState",
    user: ACCOUNT,
  });
}

/* =========================
   PLACE REAL ORDER
========================= */
async function placeOrder(side) {
  console.log("🚀 REAL ORDER:", side);

  const state = await getAccountState();

  const usdc =
    state?.marginSummary?.accountValue ??
    state?.crossMarginSummary?.accountValue;

  if (!usdc || usdc <= 5) {
    throw new Error("Balance too low");
  }

  console.log("💰 USDC:", usdc);

  const order = {
    a: ACCOUNT,
    b: {
      coin: "BTC",
      isBuy: side === "long",
      sz: usdc, // ALL IN
      limitPx: null, // MARKET
      reduceOnly: false,
    },
    t: Date.now(),
  };

  const sig = signPayload(order);

  const payload = {
    action: "placeOrder",
    order,
    signature: sig,
  };

  console.log("📤 SEND ORDER:", payload);

  return hlRequest("/exchange", payload);
}

/* =========================
   WEBHOOK
========================= */
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({ error: "invalid payload" });
    }

    const result = await placeOrder(side);

    console.log("✅ ORDER RESULT:", result);
    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ EXECUTION ERROR:", err);
    res.status(500).json({ error: "execution failed", details: String(err) });
  }
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`🚀 BOT LIVE on ${PORT}`);
});
