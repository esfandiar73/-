import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 8080;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "public")));

const assets = [
  ["انس جهانی", "XAUUSD", "USD/oz"],
  ["دلار آزاد", "USD", "تومان"],
  ["طلای ۱۸ عیار", "GOLD18", "تومان/گرم"],
  ["سکه امامی", "EMAMI", "تومان"],
  ["نیم‌سکه", "HALF", "تومان"],
  ["ربع‌سکه", "QUARTER", "تومان"],
  ["نقره ۹۹۹", "SILVER", "تومان/گرم"]
];

// Intentionally return no invented prices. Connect verified provider feeds here.
app.get("/api/prices", (_req, res) => {
  res.json({
    updatedAt: null,
    live: false,
    message: "اتصال منابع قیمت هنوز پیکربندی نشده است.",
    sources: [
      { name: "TGJU", status: "در انتظار اتصال" },
      { name: "ESTJT", status: "در انتظار اتصال" },
      { name: "الان‌چند", status: "در انتظار توکن/API" }
    ],
    assets: assets.map(([name, symbol, unit]) => ({
      name, symbol, unit, price: null, change: null
    }))
  });
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Gold Signal Pro running on port ${PORT}`));