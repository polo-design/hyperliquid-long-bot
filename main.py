import os
import time
import hmac
import hashlib
import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

# =========================
# ENV (USTAW NA RENDERZE)
# =========================
HL_API_URL = "https://api.hyperliquid.xyz"
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]   # hex string
HL_WALLET = os.environ["HL_WALLET"]             # 0x...
TRADE_PERCENT = 0.9                             # 90%

SYMBOL = "BTC"
IS_PERP = True

# =========================
# HELPERS
# =========================
def sign(payload: str) -> str:
    return hmac.new(
        bytes.fromhex(HL_PRIVATE_KEY),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

def post(endpoint: str, body: dict):
    body["nonce"] = int(time.time() * 1000)
    payload = str(body)
    sig = sign(payload)

    headers = {
        "Content-Type": "application/json",
        "X-Signature": sig,
        "X-Wallet": HL_WALLET
    }

    r = requests.post(
        HL_API_URL + endpoint,
        json=body,
        headers=headers,
        timeout=10
    )
    return r.json()

# =========================
# BALANCE
# =========================
def get_usdc_balance():
    r = requests.post(
        HL_API_URL + "/info",
        json={"type": "userState", "wallet": HL_WALLET},
        timeout=10
    ).json()

    return float(r["marginSummary"]["accountValue"])

# =========================
# ORDERS
# =========================
def open_long():
    balance = get_usdc_balance()
    notional = balance * TRADE_PERCENT

    body = {
        "type": "order",
        "orders": [{
            "asset": SYMBOL,
            "isBuy": True,
            "reduceOnly": False,
            "orderType": {"market": {}},
            "sz": notional,
        }]
    }

    return post("/exchange", body)

def close_position():
    body = {
        "type": "order",
        "orders": [{
            "asset": SYMBOL,
            "isBuy": False,
            "reduceOnly": True,
            "orderType": {"market": {}},
            "sz": "ALL"
        }]
    }

    return post("/exchange", body)

# =========================
# WEBHOOK
# =========================
@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()

    side = data.get("side")

    if side == "long":
        result = open_long()
        return JSONResponse({"status": "LONG OPENED", "result": result})

    if side == "short":
        result = close_position()
        return JSONResponse({"status": "POSITION CLOSED", "result": result})

    return JSONResponse({"error": "invalid payload"}, status_code=400)


@app.get("/")
def health():
    return {"status": "ok"}
