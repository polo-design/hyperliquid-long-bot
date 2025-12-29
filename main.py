import os
import time
import json
import hmac
import hashlib
import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# =========================
# APP
# =========================
app = FastAPI()

# =========================
# ENV (USTAW NA RENDERZE)
# =========================
HL_API_URL = "https://api.hyperliquid.xyz"

HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]   # hex, BEZ 0x
HL_WALLET      = os.environ["HL_WALLET"]        # 0x...
TRADE_PERCENT  = 0.9                            # 90%

SYMBOL = "BTC-PERP"

# =========================
# LOW LEVEL
# =========================
def _sign(payload: str) -> str:
    return hmac.new(
        bytes.fromhex(HL_PRIVATE_KEY),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

def _post(endpoint: str, body: dict):
    body["nonce"] = int(time.time() * 1000)

    payload = json.dumps(body, separators=(",", ":"), sort_keys=True)
    sig = _sign(payload)

    headers = {
        "Content-Type": "application/json",
        "X-Signature": sig,
        "X-Wallet": HL_WALLET
    }

    r = requests.post(
        HL_API_URL + endpoint,
        data=payload,
        headers=headers,
        timeout=10
    )

    if r.status_code != 200:
        raise Exception(r.text)

    return r.json()

# =========================
# INFO
# =========================
def get_account_value() -> float:
    r = requests.post(
        HL_API_URL + "/info",
        json={"type": "userState", "wallet": HL_WALLET},
        timeout=10
    ).json()

    return float(r["marginSummary"]["accountValue"])

def get_mark_price() -> float:
    r = requests.post(
        HL_API_URL + "/info",
        json={"type": "allMids"},
        timeout=10
    ).json()

    return float(r["BTC"])

def has_open_position() -> bool:
    r = requests.post(
        HL_API_URL + "/info",
        json={"type": "userState", "wallet": HL_WALLET},
        timeout=10
    ).json()

    for p in r["assetPositions"]:
        if p["position"]["coin"] == "BTC":
            sz = float(p["position"]["szi"])
            if sz != 0:
                return True
    return False

# =========================
# TRADING
# =========================
def open_long():
    if has_open_position():
        return {"info": "position already open"}

    balance = get_account_value()
    price   = get_mark_price()

    notional = balance * TRADE_PERCENT
    size = round(notional / price, 4)

    body = {
        "type": "order",
        "orders": [{
            "asset": SYMBOL,
            "isBuy": True,
            "reduceOnly": False,
            "orderType": {"market": {}},
            "sz": size
        }]
    }

    return _post("/exchange", body)

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

    return _post("/exchange", body)

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
