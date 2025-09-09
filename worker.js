export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const userId = url.searchParams.get("userId") || "demoUser";

      // ---------- Admin Panel ----------
      if (url.pathname.startsWith("/admin")) {
        const auth = url.searchParams.get("password");
        if (auth !== env.ADMIN_PASSWORD) return new Response("❌ Unauthorized", { status: 401 });

        await preloadDummyData(env);

        const users = await getKV(env.USERS_KV, "users", {});
        const alerts = await getKV(env.ALERTS_KV, "alerts", {});
        const signals = await getKV(env.SIGNALS_KV, "signals", []);
        const memes = await getKV(env.MEMECOINS_KV, "memes", []);
        const alpha = await getKV(env.ALPHA_KV, "alpha", []);
        const events = await getKV(env.EVENTS_KV, "events", []);
        const wallets = await getKV(env.WALLET_KV, "wallets", {});
        const icons = await getKV(env.WALLET_KV, "icons", {});

        return new Response(JSON.stringify({
          type: "admin",
          users, alerts, signals, memes, alpha, events, wallets, icons
        }), { headers: { "content-type": "application/json" } });
      }

      // ---------- VIP Upgrade ----------
      if (url.pathname.startsWith("/upgrade-vip")) {
        const upgradeUserId = url.searchParams.get("userId");
        if (!upgradeUserId) return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400 });

        let users = await getKV(env.USERS_KV, "users", {});
        if (!users[upgradeUserId]) users[upgradeUserId] = { vip: false, joined: Date.now() };
        users[upgradeUserId].vip = true;
        await env.USERS_KV.put("users", JSON.stringify(users));

        return new Response(JSON.stringify({ success: true, message: `${upgradeUserId} upgraded to VIP (simulated)` }),
          { headers: { "content-type": "application/json" } });
      }

      // ---------- Telegram Mini App Dashboard ----------
      if (url.pathname === "/") {
        await preloadDummyData(env);

        const users = await getKV(env.USERS_KV, "users", {});
        const user = users[userId] || { vip: false };
        const alertsObj = await getKV(env.ALERTS_KV, "alerts", {});
        const alerts = Object.values(alertsObj).filter(a => a.userId === userId);
        const signals = await getKV(env.SIGNALS_KV, "signals", []);
        const memes = await getKV(env.MEMECOINS_KV, "memes", []);
        const alpha = await getKV(env.ALPHA_KV, "alpha", []);
        const events = await getKV(env.EVENTS_KV, "events", []);

        const dashboard = {
          type: "dashboard",
          user: { id: userId, vip: user.vip },
          sections: [
            {
              title: "📈 My Alerts",
              vipRequired: false,
              cards: alerts.length ? alerts.map(a => ({ title: a.coin.toUpperCase(), subtitle: `$${a.targetPrice}` }))
                                   : [{ title: "No alerts yet" }],
              vipButton: !user.vip ? [
                { text: "💎 Upgrade to VIP via PayPal", url: "https://paypal.me/premiumrays01" },
                { text: "💰 Upgrade to VIP via Crypto", url: "/upgrade-vip?userId=" + userId }
              ] : null
            },
            { title: "📊 Signals", cards: signals.map(s => ({ title: s.title, subtitle: s.description })) },
            { title: "🐶 MemeCoin Hype", cards: memes.map(m => ({ title: m.title, subtitle: `Hype: ${m.hype}` })) },
            { title: "🧠 Alpha Feed", cards: alpha.map(a => ({ title: a.title, subtitle: a.description })) },
            { title: "📅 Upcoming Events & Airdrops", cards: events.map(e => ({ title: e.title, subtitle: e.date })) }
          ]
        };

        return new Response(JSON.stringify(dashboard), { headers: { "content-type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });

    } catch (err) {
      console.error("Worker fetch error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
    }
  },

  // ---------- Cron for Price Checks ----------
  async scheduled(event, env, ctx) {
    try {
      const alertsObj = await getKV(env.ALERTS_KV, "alerts", {});
      for (const key of Object.keys(alertsObj)) {
        const alert = alertsObj[key];
        try {
          const priceData = await fetch(`${env.COINGECKO_API}/simple/price?ids=${alert.coin}&vs_currencies=usd`).then(r => r.json());
          if (priceData[alert.coin]?.usd != null) {
            const current = priceData[alert.coin].usd;
            if ((alert.above && current >= alert.targetPrice) || (!alert.above && current <= alert.targetPrice)) {
              await sendTelegram(env, alert.userId, `🚨 ${alert.coin.toUpperCase()} reached $${current} (target ${alert.targetPrice})`);
            }
          }
        } catch(e) { console.error("Price check fetch error", e); }
      }
    } catch(e) { console.error("Scheduled price check error", e); }
  }
};

// -------------------- Helpers --------------------
async function getKV(kv, key, fallback) {
  try {
    const val = await kv.get(key, { type: "json" });
    return val || fallback;
  } catch(e) {
    console.error(`KV get error for ${key}`, e);
    return fallback;
  }
}

async function sendTelegram(env, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch(e) { console.error("Telegram send error", e); }
}

// ----------------- Preload Dummy Data -----------------
async function preloadDummyData(env) {
  // USERS
  let users = await getKV(env.USERS_KV, "users", {});
  if (!Object.keys(users).length) {
    users["demoUser"] = { vip: false, joined: Date.now() };
    await env.USERS_KV.put("users", JSON.stringify(users));
  }

  // ALERTS
  let alerts = await getKV(env.ALERTS_KV, "alerts", {});
  if (!Object.keys(alerts).length) {
    alerts["demoAlert"] = { coin: "bitcoin", targetPrice: 50000, above: true, userId: "demoUser" };
    await env.ALERTS_KV.put("alerts", JSON.stringify(alerts));
  }

  // SIGNALS
  let signals = await getKV(env.SIGNALS_KV, "signals", []);
  if (!signals.length) await env.SIGNALS_KV.put("signals", JSON.stringify([{ title: "$BTC Breakout", description: "High signal from TG channel" }]));

  // MEMECOINS
  let memes = await getKV(env.MEMECOINS_KV, "memes", []);
  if (!memes.length) await env.MEMECOINS_KV.put("memes", JSON.stringify([{ title: "$DOGE Pump", hype: 95 }]));

  // ALPHA
  let alpha = await getKV(env.ALPHA_KV, "alpha", []);
  if (!alpha.length) await env.ALPHA_KV.put("alpha", JSON.stringify([{ title: "TraderXYZ: $ETH Moves Up", description: "Short-term alpha" }]));

  // EVENTS
  let events = await getKV(env.EVENTS_KV, "events", []);
  if (!events.length) await env.EVENTS_KV.put("events", JSON.stringify([{ title: "Airdrop $XYZ", date: "2025-09-15" }]));

  // WALLETS
  let wallets = await getKV(env.WALLET_KV, "wallets", {});
  if (!Object.keys(wallets).length) {
    wallets["BTC"] = "your_btc_wallet_here";
    wallets["USDT"] = "your_trc20_usdt_here";
    await env.WALLET_KV.put("wallets", JSON.stringify(wallets));
  }

  // ICONS
  let icons = await getKV(env.WALLET_KV, "icons", {});
  if (!Object.keys(icons).length) {
    icons["alerts"] = "📈";
    icons["memes"] = "🐶";
    icons["alpha"] = "🧠";
    icons["events"] = "📅";
    await env.WALLET_KV.put("icons", JSON.stringify(icons));
  }
}
