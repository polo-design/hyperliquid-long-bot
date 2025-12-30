import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const WALLET = process.env.HL_WALLET;
const PRIVATE_KEY = process.env.HL_PRIVATE_KEY;

if (!WALLET || !PRIVATE_KEY) {
  console.error("❌ Missing ENV variables");
  process.exit(1);
}

console.log("✅ ENV OK");
console.log("👛 ACCOUNT:", WALLET.replace("0x", ""));

// ===== HYPERLIQUID CONFIG =====
const API = "https://api.hyperliquid.xyz";
const SYMBOL = "BTC";
const LEVERAGE = 1;

// ===== SIGNER =====
function sign(msg) {
  const hash = crypto.createHash("sha256").update(JSON.stringify(msg)).digest();
  const sign = crypto.sign(null, hash, PRIVATE_KEY);
  return sign.toString("base64");
}

// ===== API CALL =====
async function hl(endpoint, body) {
  const res = await fetch(API + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t);
  }

  return res.json();
}

// ===== GET BALANCE =====
async function getUsdcBalance() {
  const data = await hl("/info", {
    type: "clearinghouseState",
    user: WALLET,
  });

  const bal = Number(data.marginSummary.accountValue);
  if (bal <= 0) throw new Error("No balance");
  return bal;
}

// ===== PLACE ORDER =====
async function openLong100() {
  const usdc = await getUsdcBalance();

  const meta = await hl("/info", { type: "meta" });
  const btc = meta.universe.find(x => x.name === SYMBOL);
  const price = Number(btc.markPx);

  const size = (usdc * LEVERAGE) / price;

  const order = {
    action: {
      type: "order",
      orders: [{
        a: btc.index,
        b: true,
        p: price,
        s: size,
        r: false,
        t: { limit: { tif: "IOC" } },
      }],
    },
    nonce: Date.now(),
  };

  const payload = {
    action: order.action,
    nonce: order.nonce,
    signature: sign(order),
    wallet: WALLET,
  };

  return hl("/exchange", payload);
}

// ===== WEBHOOK =====
app.post("/webhook", async (req, res) => {
  try {
    const { side } = req.body;
    console.log("📩 WEBHOOK:", side);

    if (side !== "long") {
      return res.status(400).json({ error: "only long supported" });
    }

    const out = await openLong100();
    res.json({ status: "ok", result: out });
  } catch (e) {
    console.error("❌ EXECUTION ERROR:", e.message);
    res.status(500).json({ error: "execution failed" });
  }
});

app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(10000, () => {
  console.log("🚀 BOT LIVE on 10000");
});
