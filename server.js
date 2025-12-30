// server.js - Hyperliquid Long Bot
// Zakładając zainstalowane biblioteki: express, dotenv, hyperliquid
require('dotenv').config();
const express = require('express');
const { Hyperliquid } = require('hyperliquid');

const PORT = 10000;
const app = express();
app.use(express.json());

// Wczytanie danych z ENV
const HL_PRIVATE_KEY = process.env.HL_PRIVATE_KEY;
const HL_ACCOUNT = process.env.HL_ACCOUNT;

if (!HL_PRIVATE_KEY || !HL_ACCOUNT) {
  console.error('[Init] Brak HL_PRIVATE_KEY lub HL_ACCOUNT w zmiennych środowiskowych.');
  process.exit(1);
}

// Inicjalizacja klienta Hyperliquid SDK
const sdk = new Hyperliquid({
  privateKey: HL_PRIVATE_KEY,
  // Jeśli to konieczne, można dodać opcję testnet: true,
  walletAddress: HL_ACCOUNT,
  enableWs: false // wyłącz websocket (opcjonalne, jeśli nie używamy websocket)
});

console.log(`[Init] Serwer wystartowany na porcie ${PORT}. HL_ACCOUNT: ${HL_ACCOUNT}`);

app.post('/webhook', async (req, res) => {
  try {
    console.log('[Webhook] Odebrano żądanie POST /webhook:', req.body);
    const side = req.body.side;
    if (side !== 'long') {
      console.log('[Webhook] Pomijam, strona nie jest "long".');
      return res.status(400).send({ error: 'Nieobsługiwany side' });
    }

    // Pobranie stanu konta (saldo) z Hyperliquid
    console.log('[Info] Pobieranie stanu konta użytkownika...');
    const state = await sdk.info.perpetuals.getClearinghouseState(HL_ACCOUNT);
    // Używamy crossMarginSummary.accountValue jako przybliżone saldo w USD
    const balanceStr = state.crossMarginSummary.accountValue;
    const balance = parseFloat(balanceStr);
    console.log(`[Info] Saldo konta (USD): ${balance}`);

    // Pobranie aktualnej ceny rynkowej instrumentu
    console.log('[Info] Pobieranie aktualnej ceny rynkowej instrumentu...');
    const allMids = await sdk.info.getAllMids();
    // Ustaw tutaj interesujący nas instrument, np. 'BTC-PERP'
    const coin = 'BTC-PERP';
    let price;
    if (allMids.perpetuals && allMids.perpetuals[coin]) {
      price = parseFloat(allMids.perpetuals[coin]);
    } else if (allMids[coin]) {
      // starsze wersje SDK mogły zwracać allMids bez podziału na kategorie
      price = parseFloat(allMids[coin]);
    }
    if (!price) {
      console.error('[Error] Nie udało się pobrać ceny dla', coin);
      return res.status(500).send({ error: 'Nie można pobrać ceny instrumentu' });
    }
    console.log(`[Info] Aktualna cena ${coin}: ${price}`);

    // Wyliczenie wielkości pozycji (100% salda)
    // Uwaga: należy uwzględnić bieżącą ustawioną dźwignię konta, jeśli używana
    const leverage = 1; // przykładowa wartość; zakładamy brak modyfikacji w kodzie
    console.log(`[Info] Ustawiona dźwignia: ${leverage}x`);
    const size = ((balance * leverage) / price).toFixed(6);
    console.log(`[Calc] Wyliczona wielkość pozycji: ${size}`);

    // Przygotowanie i wysłanie zlecenia typu market (jako IOC)
    console.log(`[Order] Wysyłanie zlecenia typu market (long) dla ${coin}...`);
    // Limit price ustawiamy znacznie powyżej aktualnej ceny, aby zapewnić realizację
    const limitPx = price * 2;
    const orderResp = await sdk.exchange.placeOrder({
      coin: coin,
      is_buy: true,
      sz: size,
      limit_px: limitPx,
      order_type: { limit: { tif: 'Ioc' } },
      reduce_only: false
    });
    console.log('[Success] Zlecenie wysłane pomyślnie:', orderResp);
    return res.status(200).send({ result: 'order sent', data: orderResp });
  } catch (error) {
    console.error('[Error] Wystąpił błąd podczas przetwarzania webhooka:', error);
    return res.status(500).send({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Start] Bot nasłuchuje na porcie ${PORT}, gotowy do pracy!`);
});
