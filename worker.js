export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ------------------------------
    // Setup Dummy Data (run once)
    // ------------------------------
    if (path === "/setup-dummy") {
      await env.USERS_KV.put("demo-user", JSON.stringify({ vip: false, upgradedAt: "Free" }));
      await env.ALERTS_KV.put("demo-user", JSON.stringify([
        { id: "1", coin: "bitcoin", type: "Above", target: 40000, sent: false }
      ]));
      await env.SIGNALS_KV.put("signals", JSON.stringify([{ channel: "BTC News", message: "$BTC pump incoming" }]));
      await env.MEMECOINS_KV.put("topCoins", JSON.stringify([{ symbol: "DOGE", price_change_percentage_24h: 12.5 }]));
      await env.ALPHA_KV.put("alphaFeed", JSON.stringify([{ trader: "TraderXYZ", insight: "$ETH bullish", watchlist: ["ETH","MATIC"] }]));
      await env.EVENTS_KV.put("events", JSON.stringify([{ event: "BTC Snapshot", date: "2025-09-10" }]));
      await env.WALLET_KV.put("crypto-wallets", JSON.stringify([
        { method: "BTC", address: "YOUR_BTC_ADDRESS" },
        { method: "TRC20 USDT", address: "YOUR_TRC20_USDT_ADDRESS" }
      ]));
      return new Response("✅ Dummy data added.");
    }

    // ------------------------------
    // Dashboard Data Endpoints
    // ------------------------------
    if (path === "/signals") {
      const data = await env.SIGNALS_KV.get("signals", { type: "json" }) || [];
      return jsonResponse(data);
    }
    if (path === "/memeradar") {
      const data = await env.MEMECOINS_KV.get("topCoins", { type: "json" }) || [];
      return jsonResponse(data);
    }
    if (path === "/alphafeed") {
      const data = await env.ALPHA_KV.get("alphaFeed", { type: "json" }) || [];
      return jsonResponse(data);
    }
    if (path === "/events") {
      const data = await env.EVENTS_KV.get("events", { type: "json" }) || [];
      return jsonResponse(data);
    }

    // ------------------------------
    // Alerts CRUD
    // ------------------------------
    if (path === "/alerts") {
      if (request.method === "GET") {
        const userId = url.searchParams.get("userId");
        const alerts = await env.ALERTS_KV.get(userId, { type: "json" }) || [];
        return jsonResponse(alerts);
      }
      if (request.method === "POST") {
        const body = await request.json();
        const { userId, coin, type, target } = body;

        let alerts = await env.ALERTS_KV.get(userId, { type: "json" }) || [];
        const newAlert = { id: crypto.randomUUID(), coin, type, target, sent: false };
        alerts.push(newAlert);
        await env.ALERTS_KV.put(userId, JSON.stringify(alerts));
        return jsonResponse({ success: true, alert: newAlert });
      }
      if (request.method === "DELETE") {
        const body = await request.json();
        const { userId, id } = body;
        let alerts = await env.ALERTS_KV.get(userId, { type: "json" }) || [];
        alerts = alerts.filter(a => a.id !== id);
        await env.ALERTS_KV.put(userId, JSON.stringify(alerts));
        return jsonResponse({ success: true });
      }
    }

    // ------------------------------
    // Admin Panel
    // ------------------------------
    if (path.startsWith("/admin")) {
      const password = url.searchParams.get("password");
      if (password !== "Premium01") return new Response("❌ Unauthorized", { status: 401 });

      const users = [];
      for await (const key of env.USERS_KV.list()) {
        try {
          const userRaw = await env.USERS_KV.get(key.name, { type: "json" });
          const user = userRaw || { vip: false, upgradedAt: 'Free' };
          const alerts = (await env.ALERTS_KV.get(key.name, { type: "json" })) || [];
          users.push({
            id: key.name,
            vip: user.vip || false,
            joinedAt: user.upgradedAt || 'Free',
            alertsCount: alerts.length
          });
        } catch (err) {
          console.error("KV fetch error", key.name, err);
        }
      }
      return jsonResponse({ users });
    }

    // ------------------------------
    // VIP Upgrade
    // ------------------------------
    if (path === "/upgrade-vip") {
      const userId = url.searchParams.get("userId");
      if (!userId) return new Response("❌ userId required", { status: 400 });

      await env.USERS_KV.put(userId, JSON.stringify({ vip: true, upgradedAt: new Date().toISOString() }));
      return new Response(`✅ User ${userId} upgraded to VIP`);
    }

    // ------------------------------
    // Cron Price Checker
    // ------------------------------
    if (request.method === "POST" && request.headers.get("cf-worker-cron")) {
      for await (const key of env.ALERTS_KV.list()) {
        const alerts = await env.ALERTS_KV.get(key.name, { type: "json" }) || [];
        for (let alert of alerts) {
          if (alert.sent) continue;
          const price = await fetchPrice(alert.coin, env);
          if ((alert.type === "Above" && price > alert.target) ||
              (alert.type === "Below" && price < alert.target)) {
            await sendTelegram(env, key.name, `🚨 ${alert.coin} is ${alert.type} ${alert.target}. Current: ${price}`);
            alert.sent = true;
          }
        }
        await env.ALERTS_KV.put(key.name, JSON.stringify(alerts));
      }
      return new Response("✅ Price check completed.");
    }

    // ------------------------------
    // Default
    // ------------------------------
    return new Response("Crypto Alerts Bot Worker running.");
  }
};

// ------------------------------
// Helpers
// ------------------------------
function jsonResponse(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
}

async function fetchPrice(coin, env) {
  try {
    const res = await fetch(`${env.COINGECKO_API}/simple/price?ids=${coin}&vs_currencies=usd`);
    const data = await res.json();
    return data[coin]?.usd || 0;
  } catch {
    return 0;
  }
}

async function sendTelegram(env, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (err) {
    console.error("Telegram send error", err);
  }
}
