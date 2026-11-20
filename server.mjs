import express from "express";
import dotenv from "dotenv";
import { load } from "cheerio";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(express.static(PUBLIC_DIR, { maxAge: "1h", etag: true }));

const cache = {
  estjt: { expiresAt: 0, data: null, error: null },
  tgju: { expiresAt: 0, data: null, error: null },
  alanchand: { expiresAt: 0, data: null, error: null }
};

const SOURCE_TTL = {
  estjt: 60_000,
  tgju: 60_000,
  alanchand: 5 * 60_000
};

const ASSETS = {
  xau: { label: "انس جهانی طلا", unit: "دلار / اونس", currency: "USD" },
  usd: { label: "دلار آزاد", unit: "تومان", currency: "IRT" },
  gold18: { label: "طلای ۱۸ عیار", unit: "تومان / گرم", currency: "IRT" },
  emami: { label: "سکه امامی", unit: "تومان", currency: "IRT" },
  half: { label: "نیم‌سکه", unit: "تومان", currency: "IRT" },
  quarter: { label: "ربع‌سکه", unit: "تومان", currency: "IRT" },
  silver999: { label: "نقره ۹۹۹", unit: "تومان / گرم", currency: "IRT" }
};

function latinDigits(value) {
  return String(value ?? "")
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ");
}

function cleanText(value) {
  return latinDigits(value).replace(/\s+/g, " ").trim();
}

function numberFrom(value) {
  if (value == null) return null;
  const n = Number(latinDigits(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GoldSignalPro/0.1; +https://example.invalid)",
        "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.7"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "GoldSignalPro/0.1",
        "Accept": "application/json",
        ...headers
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parseRows(html) {
  const $ = load(html);
  return $("tr").toArray().map(el => cleanText($(el).text(" "))).filter(Boolean);
}

function findPriceInRows(rows, labels) {
  const normalizedLabels = labels.map(cleanText);
  for (const row of rows) {
    const normalized = cleanText(row);
    const label = normalizedLabels.find(item => normalized.includes(item));
    if (!label) continue;
    const index = normalized.indexOf(label);
    const tail = normalized.slice(index + label.length);
    const values = tail.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    const price = values.map(numberFrom).find(v => v != null);
    if (price != null) {
      const pctMatch = tail.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
      return { price, changePct: pctMatch ? Number(pctMatch[1]) : null, row: normalized };
    }
  }
  return null;
}

function findPriceInText(html, labels) {
  const $ = load(html);
  const text = cleanText($("body").text());
  for (const rawLabel of labels) {
    const label = cleanText(rawLabel);
    const index = text.indexOf(label);
    if (index < 0) continue;
    const tail = text.slice(index + label.length, index + label.length + 180);
    const values = tail.match(/\d[\d,]*(?:\.\d+)?/g) || [];
    const price = values.map(numberFrom).find(v => v != null);
    if (price != null) {
      const pctMatch = tail.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
      return { price, changePct: pctMatch ? Number(pctMatch[1]) : null, row: tail };
    }
  }
  return null;
}

function makeRecord(provider, price, currency, changePct = null, extra = {}) {
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    provider,
    price,
    currency,
    changePct: Number.isFinite(changePct) ? changePct : null,
    fetchedAt: Date.now(),
    ...extra
  };
}

async function loadEstjt() {
  const html = await fetchText("https://www.estjt.ir/tv/");
  const $ = load(html);
  const text = cleanText($("body").text());
  const get = (label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(escaped + "\\s*\\$?\\s*([\\d,]+(?:\\.\\d+)?)", "i"));
    return match ? numberFrom(match[1]) : null;
  };

  const records = {
    xau: makeRecord("ESTJT", get("انس جهانی طلا"), "USD", null, { page: "تابلو طلا" }),
    gold18: makeRecord("ESTJT", get("طلای ۱۸ عیار"), "IRT", null, { page: "تابلو طلا" }),
    emami: makeRecord("ESTJT", get("سکه طرح جدید"), "IRT", null, { page: "تابلو طلا" }),
    half: makeRecord("ESTJT", get("نیم سکه"), "IRT", null, { page: "تابلو طلا" }),
    quarter: makeRecord("ESTJT", get("ربع سکه"), "IRT", null, { page: "تابلو طلا" })
  };

  const updated = text.match(/آخرین بروزرسانی قیمت\s*:\s*([^،]+?)(?:\s+اخبار ویژه|$)/i);
  return {
    records,
    status: "ok",
    fetchedAt: Date.now(),
    sourceUpdatedText: updated?.[1]?.trim() || null,
    note: "تابلو رسمی اتحادیه؛ دلار آزاد و گرم نقره ۹۹۹ در این تابلو ارائه نشده است."
  };
}

async function loadTgju() {
  const [homeHtml, coinHtml] = await Promise.all([
    fetchText("https://www.tgju.org/"),
    fetchText("https://www.tgju.org/coin")
  ]);

  const homeRows = parseRows(homeHtml);
  const coinRows = parseRows(coinHtml);

  const lookup = (html, rows, labels) =>
    findPriceInRows(rows, labels) || findPriceInText(html, labels);

  const raw = {
    xau: lookup(homeHtml, homeRows, ["انس طلا", "انس جهانی طلا"]),
    usd: lookup(homeHtml, homeRows, ["دلار آمریکا", "دلار آزاد", "دلار"]),
    gold18: lookup(homeHtml, homeRows, ["طلای 18 عیار / 750", "طلای ۱۸ عیار", "طلا ۱۸"]),
    emami: lookup(coinHtml, coinRows, ["سکه امامی", "سکه طرح جدید"]),
    half: lookup(coinHtml, coinRows, ["نیم سکه", "نیم‌سکه"]),
    quarter: lookup(coinHtml, coinRows, ["ربع سکه", "ربع‌سکه"]),
    silver999: lookup(homeHtml, homeRows, ["گرم نقره 999", "گرم نقره ۹۹۹"])
  };

  // TGJU reports local market prices in Rial; convert them to Toman.
  const records = {};
  for (const key of Object.keys(raw)) {
    const found = raw[key];
    if (!found) continue;
    const isGlobalOunce = key === "xau";
    const price = isGlobalOunce ? found.price : found.price / 10;
    records[key] = makeRecord(
      "TGJU",
      price,
      isGlobalOunce ? "USD" : "IRT",
      found.changePct,
      { rawUnit: isGlobalOunce ? "USD/oz" : "Rial", page: key === "emami" || key === "half" || key === "quarter" ? "بازار سکه" : "صفحه اصلی" }
    );
  }

  return {
    records,
    status: "ok",
    fetchedAt: Date.now(),
    note: "نرخ‌های ریالی TGJU برای نمایش به تومان بر ۱۰ تقسیم می‌شوند."
  };
}

function getAlanchandPrice(payload, symbol) {
  const rec = payload?.[symbol] ?? payload?.data?.[symbol] ?? null;
  if (rec == null) return null;
  if (typeof rec === "number" || typeof rec === "string") return numberFrom(rec);
  return numberFrom(rec.sell ?? rec.price ?? rec.last ?? rec.buy ?? rec.value);
}

function getAlanchandChange(payload, symbol) {
  const rec = payload?.[symbol] ?? payload?.data?.[symbol] ?? null;
  if (!rec || typeof rec !== "object") return null;
  const value = Number(latinDigits(rec.dayChange ?? rec.changePercent ?? rec.change_pct));
  return Number.isFinite(value) ? value : null;
}

async function loadAlanchand() {
  const token = process.env.ALANCHAND_TOKEN?.trim();
  if (!token) {
    return {
      records: {},
      status: "not_configured",
      fetchedAt: Date.now(),
      note: "برای فعال‌سازی منبع الان‌چند، ALANCHAND_TOKEN را در تنظیمات سرور وارد کنید."
    };
  }

  const headers = { Authorization: `Bearer ${token}` };
  const [currencies, golds] = await Promise.all([
    fetchJson("https://api.alanchand.com/?type=currencies&symbols=usd", headers),
    fetchJson("https://api.alanchand.com/?type=golds&symbols=18ayar,sekkeh,nim,rob,usd_xau", headers)
  ]);

  const map = {
    usd: [currencies, "usd", "IRT"],
    gold18: [golds, "18ayar", "IRT"],
    emami: [golds, "sekkeh", "IRT"],
    half: [golds, "nim", "IRT"],
    quarter: [golds, "rob", "IRT"],
    xau: [golds, "usd_xau", "USD"]
  };

  const records = {};
  for (const [key, [payload, symbol, currency]] of Object.entries(map)) {
    const price = getAlanchandPrice(payload, symbol);
    if (price != null) {
      records[key] = makeRecord(
        "Alanchand",
        price,
        currency,
        getAlanchandChange(payload, symbol),
        { symbol }
      );
    }
  }

  return {
    records,
    status: "ok",
    fetchedAt: Date.now(),
    note: "API الان‌چند طبق مستندات خودش برای طلا، ارز و سکه هر ۵ دقیقه به‌روزرسانی می‌شود."
  };
}

async function getProvider(name, loader) {
  const item = cache[name];
  if (item.data && Date.now() < item.expiresAt) return item.data;

  try {
    const data = await loader();
    item.data = data;
    item.error = null;
    item.expiresAt = Date.now() + SOURCE_TTL[name];
    return data;
  } catch (error) {
    item.error = error?.message || "خطای نامشخص";
    item.expiresAt = Date.now() + 15_000;
    if (item.data) {
      return {
        ...item.data,
        status: "stale",
        error: item.error,
        note: `${item.data.note || ""} آخرین داده ذخیره‌شده نمایش داده می‌شود.`
      };
    }
    return {
      records: {},
      status: "error",
      fetchedAt: Date.now(),
      error: item.error,
      note: "دریافت اطلاعات از این منبع ناموفق بود."
    };
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function combineAsset(key, providerData) {
  const records = providerData
    .map(p => p?.records?.[key])
    .filter(r => r && Number.isFinite(r.price) && r.price > 0);

  if (!records.length) {
    return { ...ASSETS[key], average: null, sourceCount: 0, sources: [], conflict: false, changePct: null };
  }

  const prices = records.map(r => r.price);
  const mid = median(prices);
  let accepted = records;

  // With three providers, ignore a clear outlier; preserve all quotes if only two disagree.
  if (records.length >= 3) {
    const filtered = records.filter(r => Math.abs((r.price - mid) / mid) <= 0.018);
    if (filtered.length >= 2) accepted = filtered;
  }

  const avg = accepted.reduce((sum, r) => sum + r.price, 0) / accepted.length;
  const spreadPct = (Math.max(...prices) - Math.min(...prices)) / mid * 100;
  const changes = accepted.map(r => r.changePct).filter(v => Number.isFinite(v));
  const changePct = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;

  return {
    ...ASSETS[key],
    average: avg,
    sourceCount: accepted.length,
    totalSources: records.length,
    sources: records.map(r => ({
      provider: r.provider,
      price: r.price,
      currency: r.currency,
      changePct: r.changePct,
      fetchedAt: r.fetchedAt,
      page: r.page || null,
      symbol: r.symbol || null
    })),
    conflict: spreadPct > 1.8,
    spreadPct,
    changePct
  };
}

app.get("/api/market", async (_req, res) => {
  const [estjt, tgju, alanchand] = await Promise.all([
    getProvider("estjt", loadEstjt),
    getProvider("tgju", loadTgju),
    getProvider("alanchand", loadAlanchand)
  ]);

  const providers = { ESTJT: estjt, TGJU: tgju, Alanchand: alanchand };
  const assets = {};
  for (const key of Object.keys(ASSETS)) {
    assets[key] = combineAsset(key, [estjt, tgju, alanchand]);
  }

  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    updatedAt: Date.now(),
    refreshMs: 30_000,
    assets,
    providers: Object.fromEntries(
      Object.entries(providers).map(([name, value]) => [name, {
        status: value.status,
        fetchedAt: value.fetchedAt,
        sourceUpdatedText: value.sourceUpdatedText || null,
        note: value.note || null,
        error: value.error || null
      }])
    ),
    disclaimer: "اطلاعات و سیگنال‌ها جنبه تحلیلی و اطلاع‌رسانی دارند و توصیه قطعی سرمایه‌گذاری نیستند."
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "Gold Signal Pro",
    intervalMs: 30_000,
    providers: Object.fromEntries(
      Object.entries(cache).map(([name, item]) => [name, {
        cached: Boolean(item.data),
        status: item.data?.status || "not_loaded",
        error: item.error || null,
        expiresAt: item.expiresAt || null
      }])
    )
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Gold Signal Pro running on http://localhost:${PORT}`);
});
