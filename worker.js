export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ===== Webhook from Telegram Bot =====
    if (url.pathname === "/webhook") {
      const update = await request.json();
      return await handleTelegramUpdate(update, env);
    }

    // ===== User Dashboard =====
    if (url.pathname === "/") {
      return new Response(USER_DASHBOARD_HTML(), {
        headers: { "content-type": "text/html" },
      });
    }

    // ===== Admin Panel =====
    if (url.pathname.startsWith("/admin")) {
      const auth = url.searchParams.get("password");
      if (auth !== "Premium01") {
        return new Response("❌ Unauthorized", { status: 401 });
      }
      await preloadDummyData(env);

      const users = await env.USERS_KV.get("users", { type: "json" }) || {};
      const alerts = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
      const signals = await env.SIGNALS_KV.get("signals", { type: "json" }) || [];
      const memes = await env.MEMECOINS_KV.get("memes", { type: "json" }) || [];
      const alpha = await env.SIGNALS_KV.get("alpha", { type: "json" }) || [];
      const events = await env.EVENTS_KV.get("events", { type: "json" }) || [];

      return new Response(ADMIN_HTML(users, alerts, signals, memes, alpha, events), {
        headers: { "content-type": "text/html" },
      });
    }

    // ===== Upgrade VIP =====
    if (url.pathname.startsWith("/upgrade-vip")) {
      const userId = url.searchParams.get("userId");
      if (!userId) return new Response("Missing userId", { status: 400 });
      let users = await env.USERS_KV.get("users", { type: "json" }) || {};
      if (!users[userId]) users[userId] = { vip: false };
      users[userId].vip = true;
      await env.USERS_KV.put("users", JSON.stringify(users));
      return new Response(`✅ ${userId} upgraded to VIP`, { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },

  // ===== CRON: Check alerts every 5 min =====
  async scheduled(event, env, ctx) {
    const alerts = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
    for (let key of Object.keys(alerts)) {
      const alert = alerts[key];
      try {
        const price = await fetch(`${env.COINGECKO_API}/simple/price?ids=${alert.coin}&vs_currencies=usd`)
          .then(r => r.json());
        const current = price[alert.coin].usd;
        if ((alert.above && current >= alert.targetPrice) ||
            (!alert.above && current <= alert.targetPrice)) {
          await sendTelegram(env, alert.userId, `🚨 Alert: ${alert.coin.toUpperCase()} is now ${current} USD (target ${alert.targetPrice})`);
        }
      } catch (e) {
        console.error("Price check error", e);
      }
    }
  }
};

// ===== Telegram Handlers =====
async function handleTelegramUpdate(update, env) {
  if (!update.message) return new Response("ok");

  const chatId = update.message.chat.id;
  const text = update.message.text || "";

  if (text.startsWith("/start")) {
    // Save user if not exists
    let users = await env.USERS_KV.get("users", { type: "json" }) || {};
    if (!users[chatId]) {
      users[chatId] = { vip: false, joined: Date.now() };
      await env.USERS_KV.put("users", JSON.stringify(users));
    }
    await sendTelegram(env, chatId, "👋 Welcome to Crypto Alerts Bot!\nUse /addalert BTC 50000 above to create your first alert.");
  }

  if (text.startsWith("/addalert")) {
    const parts = text.split(" ");
    if (parts.length < 4) {
      await sendTelegram(env, chatId, "❌ Usage: /addalert COIN PRICE above|below");
    } else {
      const [_, coin, price, dir] = parts;
      let alerts = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
      const id = `alert_${Date.now()}`;
      alerts[id] = {
        coin: coin.toLowerCase(),
        targetPrice: parseFloat(price),
        above: dir === "above",
        userId: chatId
      };
      await env.ALERTS_KV.put("alerts", JSON.stringify(alerts));
      await sendTelegram(env, chatId, `✅ Alert set for ${coin.toUpperCase()} ${dir} ${price} USD`);
    }
  }

  return new Response("ok");
}

async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// ===== Dashboard HTML (Mini App) =====
function USER_DASHBOARD_HTML() {
  return `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"><title>Crypto Alerts Bot</title></head>
  <body style="font-family:sans-serif;background:#0f172a;color:#eee;padding:20px">
    <h2>⚡ Crypto Alerts Dashboard</h2>
    <p>Manage your alerts directly in Telegram using commands:</p>
    <ul>
      <li><b>/addalert BTC 50000 above</b> → alerts when BTC goes above $50k</li>
      <li><b>/addalert ETH 1500 below</b> → alerts when ETH goes below $1500</li>
    </ul>
    <p>💎 Upgrade to VIP for unlimited alerts!</p>
  </body>
  </html>`;
}

// ===== Admin HTML =====
function ADMIN_HTML(users, alerts, signals, memes, alpha, events) {
  return `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8"><title>Admin Panel</title></head>
  <body style="background:#0f172a;color:#eee;font-family:sans-serif;padding:20px">
    <h1>⚡ Crypto Alerts Admin</h1>
    <h2>👤 Users</h2>
    ${Object.keys(users).map(u => `<div>${u} - ${users[u].vip ? "🌟 VIP" : "Free"}</div>`).join("")}
    <h2>🔔 Alerts</h2>
    ${Object.keys(alerts).map(a => `<div>${alerts[a].coin} → ${alerts[a].targetPrice} USD (${alerts[a].above ? "above" : "below"})</div>`).join("")}
    <h2>📊 Signals</h2>
    <ul>${signals.map(s => `<li>${s}</li>`).join("")}</ul>
    <h2>🚀 Memecoins</h2>
    <ul>${memes.map(m => `<li>${m}</li>`).join("")}</ul>
    <h2>🧠 Alpha Feed</h2>
    <ul>${alpha.map(a => `<li>${a}</li>`).join("")}</ul>
    <h2>📅 Events</h2>
    <ul>${events.map(e => `<li>${e}</li>`).join("")}</ul>
  </body></html>`;
}

// ===== Preload Dummy Data =====
async function preloadDummyData(env) {
  let users = await env.USERS_KV.get("users", { type: "json" });
  if (!users) {
    users = { "demoUser": { vip: false }, "vipUser": { vip: true } };
    await env.USERS_KV.put("users", JSON.stringify(users));
  }
  let alerts = await env.ALERTS_KV.get("alerts", { type: "json" });
  if (!alerts) {
    alerts = { "alert1": { coin: "btc", targetPrice: 50000, above: true, userId: "demoUser" } };
    await env.ALERTS_KV.put("alerts", JSON.stringify(alerts));
  }
  await env.SIGNALS_KV.put("signals", JSON.stringify(["BTC breakout", "ETH whales buying"]));
  await env.MEMECOINS_KV.put("memes", JSON.stringify(["DOGE trending", "PEPE hype"]));
  await env.SIGNALS_KV.put("alpha", JSON.stringify(["VC fund raising news", "Exchange listing rumor"]));
  await env.EVENTS_KV.put("events", JSON.stringify(["Airdrop Sep 15", "IDO Sep 20"]));
}
