import express from "express";

const app = express();
app.use(express.json()); // ← TO JEST KLUCZ 🔑

app.post("/webhook", (req, res) => {
  const { side } = req.body;

  if (side !== "long" && side !== "short") {
    return res.status(422).json({ error: "invalid payload" });
  }

  if (side === "long") {
    console.log("OPEN LONG 90%");
  }

  if (side === "short") {
    console.log("CLOSE POSITION 100%");
  }

  return res.json({ status: "ok", side });
});

app.get("/", (_, res) => res.json({ status: "alive" }));

app.listen(10000, () => {
  console.log("BOT LIVE on 10000");
});
