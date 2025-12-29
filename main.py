from fastapi import FastAPI, Request
from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
import hyperliquid.constants as constants
import os
import math

app = FastAPI()

HL_PRIVATE_KEY = os.getenv("HL_PRIVATE_KEY")
HL_ACCOUNT = os.getenv("HL_ACCOUNT")

info = Info(constants.MAINNET_API_URL, skip_ws=True)
exchange = Exchange(
    HL_ACCOUNT,
    HL_PRIVATE_KEY,
    constants.MAINNET_API_URL
)

SYMBOL = "BTC-USDC"
USE_CAPITAL = 0.9  # 90%

def get_equity():
    user_state = info.user_state(HL_ACCOUNT)
    return float(user_state["marginSummary"]["accountValue"])

def get_price():
    mids = info.all_mids()
    return float(mids[SYMBOL])

def get_position_size():
    equity = get_equity()
    price = get_price()
    usd = equity * USE_CAPITAL
    size = usd / price
    return round(size, 4)

def has_open_position():
    state = info.user_state(HL_ACCOUNT)
    for pos in state["assetPositions"]:
        if pos["position"]["coin"] == "BTC":
            return float(pos["position"]["szi"]) != 0
    return False

def open_long():
    if has_open_position():
        return {"status": "already_in_position"}

    size = get_position_size()
    exchange.order(
        SYMBOL,
        is_buy=True,
        sz=size,
        limit_px=None,
        order_type="market",
        reduce_only=False
    )
    return {"status": "long_opened", "size": size}

def close_position():
    if not has_open_position():
        return {"status": "no_position"}

    exchange.order(
        SYMBOL,
        is_buy=False,
        sz=0,
        limit_px=None,
        order_type="market",
        reduce_only=True
    )
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
