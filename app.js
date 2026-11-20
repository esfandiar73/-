const $ = (id) => document.getElementById(id);
const priceRoot = $("prices");
const fmt = new Intl.NumberFormat("fa-IR");
function render(data) {
  $("connection").textContent = data.live ? "داده زنده" : "بدون اتصال زنده";
  $("statusTitle").textContent = data.live ? "منابع قیمت متصل‌اند" : "در انتظار اتصال منابع";
  $("statusText").textContent = data.message || "";
  $("lastUpdate").textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("fa-IR") : "هنوز بروزرسانی نشده";
  $("sourceInfo").textContent = "منابع: " + (data.sources || []).map(s => `${s.name} (${s.status})`).join("، ");
  priceRoot.innerHTML = "";
  for (const item of data.assets || []) {
    const card = document.createElement("article");
    card.className = "price";
    const value = item.price == null ? "—" : fmt.format(item.price);
    card.innerHTML = `<div class="price-top"><h3>${item.name}</h3><span class="symbol">${item.symbol}</span></div><div class="value">${value} <span class="unit">${item.unit}</span></div>`;
    priceRoot.appendChild(card);
  }
}
async function refresh() {
  try {
    const response = await fetch("/api/prices", {cache:"no-store"});
    if (!response.ok) throw new Error("bad response");
    render(await response.json());
  } catch {
    $("connection").textContent = "خطا در ارتباط با سرور";
    $("statusTitle").textContent = "سرور در دسترس نیست";
    $("statusText").textContent = "اتصال سرور را بررسی کنید و دوباره تلاش کنید.";
  }
}
refresh();
setInterval(refresh, 30000);
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(()=>{}));