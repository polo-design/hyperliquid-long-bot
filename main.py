import os
from fastapi import FastAPI, Request
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants

# ================= CONFIG =================
HL_ACCOUNT = os.environ["HL_ACCOUNT"]          # 0x...
HL_PRIVATE_KEY = os.environ["HL_PRIVATE_KEY"]  # private key
SYMBOL = "BTC"
USE_BALANCE_PCT = 0.9  # 90%
# ==========================================

exchange = Exchange(
    HL_ACCOUNT,
    HL_PRIVATE_KEY,
    constants.MAINNET_API_URL
)

app = FastAPI()

def get_available_usdc():
    state = exchange.user_state()
    return float(state["marginSummary"]["accountValue"])

def has_open_position():
    positions = exchange.user_state()["assetPositions"]
    for p in positions:
        if p["position"]["coin"] == SYMBOL and float(p["position"]["szi"]) != 0:
            return True
    return False

def close_position():
    positions = exchange.user_state()["assetPositions"]
    for p in positions:
        pos = p["position"]
        if pos["coin"] == SYMBOL and float(pos["szi"]) != 0:
            size = abs(float(pos["szi"]))
            exchange.market_close(SYMBOL, size)
            return True
    return False

def open_long():
    if has_open_position():
        return "already_in_position"

    balance = get_available_usdc()
    usd_to_use = balance * USE_BALANCE_PCT

    price = float(exchange.all_mids()[SYMBOL])
    size = round(usd_to_use / price, 6)

    exchange.market_open(SYMBOL, True, size)
    return "long_opened"

@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()
    action = data.get("action")

    if action == "LONG":
        result = open_long()
        return {"status": result}

    if action == "CLOSE":
        closed = close_position()
        return {"status": "closed" if closed else "no_position"}

    return {"error": "unknown action"}
