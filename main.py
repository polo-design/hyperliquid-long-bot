import os
import time
import hmac
import hashlib
import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

# ======================
# CONFIG
# ======================
HL_API_URL = "https://api.hyperliquid.xyz"

HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]  # hex, BEZ 0x
HL_ACCOUNT = os.environ["HL_ACCOUNT"]          # 0x...

TRADE_PERCENT = 0.9        # 90% kapitału
BTC_ASSET_ID = 0           # BTC perps = 0

app = FastAPI()

# ======================
# SIGNING
# ======================
def sign(payload: str) -> str:
    return hmac.new(
        bytes.fromhex(HL_PRIVATE_KEY),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

def post(endpoint: str, body: dict):
    body["nonce"] = int(time.time() * 1000)
    payload = str(body)

    headers = {
        "Content-Type": "application/json",
        "X-Signature": sign(payload),
        "X-Wallet": HL_ACCOUNT
    }

    r = requests.post(
        HL_API_URL + endpoint,
        json=body,
        headers=headers,
        timeout=10
    )

    if r.status_code != 200:
        raise Exception(r.text)

    return r.json()

# ======================
# DATA
# ======================
def get_account_value():
    r = requests.post(
        HL_API_URL + "/info",
        json={"type": "userState", "wallet": HL_ACCOUNT},
        timeout=10
    ).json()

    return float(r["marginSummary"]["accountValue"])

def get_btc_price():
    r = requests.post(
        HL_API_URL + "/info",
        json={"type": "allMids"},
        timeout=10
    ).json()

    return float(r["BTC"])

# ======================
# TRADING
# ======================
def open_long():
    balance = get_account_value()
    price = get_btc_price()

    usd_notional = balance * TRADE_PERCENT
    btc_size = round(usd_notional / price, 6)

    body = {
        "type": "order",
        "orders": [{
            "asset": BTC_ASSET_ID,
            "isBuy": True,
            "reduceOnly": False,
            "orderType": {"market": {}},
            "sz": btc_size
        }]
    }

    return post("/exchange", body)

def close_all():
    body = {
        "type": "order",
        "orders": [{
            "asset": BTC_ASSET_ID,
            "isBuy": False,
            "reduceOnly": True,
            "orderType": {"market": {}},
            "sz": 999999
        }]
    }

    return post("/exchange", body)

# ======================
# WEBHOOK
# ======================
@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()
    side = data.get("side")

    try:
        if side == "long":
            return JSONResponse({
                "status": "LONG OPENED",
                "result": open_long()
            })

        if side == "short":
            return JSONResponse({
                "status": "POSITION CLOSED",
                "result": close_all()
            })

        return JSONResponse({"error": "invalid payload"}, status_code=400)

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/")
def health():
    return {"status": "ok"}
