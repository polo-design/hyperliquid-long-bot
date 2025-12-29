from fastapi import FastAPI, Request
from hyperliquid import Hyperliquid
import os

app = FastAPI()

HL_PRIVATE_KEY = os.getenv("HL_PRIVATE_KEY")
HL_ACCOUNT = os.getenv("HL_ACCOUNT")

hl = Hyperliquid(
    private_key=HL_PRIVATE_KEY,
    account_address=HL_ACCOUNT
)

SYMBOL = "BTC-USDC"
USE_CAPITAL = 0.9  # 90%

def get_equity():
    state = hl.user_state()
    return float(state["marginSummary"]["accountValue"])

def get_price():
    mids = hl.all_mids()
    return float(mids[SYMBOL])

def has_open_position():
    state = hl.user_state()
    for pos in state["assetPositions"]:
        if pos["position"]["coin"] == "BTC":
            return float(pos["position"]["szi"]) != 0
    return False

def get_position_size():
    equity = get_equity()
    price = get_price()
    usd = equity * USE_CAPITAL
    size = usd / price
    return round(size, 4)

def open_long():
    if has_open_position():
        return {"status": "already_in_position"}

    size = get_position_size()

    hl.market_open(
        coin="BTC",
        is_buy=True,
        size=size
    )

    return {"status": "long_opened", "size": size}

def close_position():
    if not has_open_position():
        return {"status": "no_position"}

    hl.market_close("BTC")
    return {"status": "position_closed"}

@app.post("/webhook")
async def webhook(req: Request):
    data = await req.json()
    side = data.get("side")

    if side == "long":
        return open_long()

    if side == "close":
        return close_position()

    return {"status": "ignored"}
