export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/webhook") {
      return handleTelegramWebhook(request, env);
    }
    if (url.pathname.startsWith("/admin")) {
      return handleAdminPanel(request, env, url);
    }
    if (url.pathname.startsWith("/app")) {
      return handleUserDashboard(request, env, request, url);
    }

    return new Response("Crypto Alerts Worker Running ✅", { status: 200 });
  },

  // CRON JOB every 5 minutes
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAlerts(env));
  },
};

// =============================
// TELEGRAM BOT HANDLER
// =============================
async function handleTelegramWebhook(request, env) {
  const body = await request.json();
  if (!body.message) return new Response("ok");

  const chatId = body.message.chat.id;
  const text = body.message.text || "";

  if (text.startsWith("/start")) {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "🚀 Open Dashboard",
            web_app: { url: `https://${env.WORKER_DOMAIN}/app?user=${chatId}` },
          },
        ],
      ],
    };

    await sendTelegramMessage(
      env.BOT_TOKEN,
      chatId,
      "Welcome to Crypto Alerts 🚀\nTap below to open your dashboard:",
      keyboard
    );

    await env.USER_DB.put(
      `user:${chatId}`,
      JSON.stringify({ chatId, joinedAt: Date.now(), vip: false })
    );

    return new Response("ok");
  }

  if (text.startsWith("/help")) {
    await sendTelegramMessage(
      env.BOT_TOKEN,
      chatId,
      "Available commands:\n/start – Open your dashboard\n/help – This menu"
    );
    return new Response("ok");
  }

  return new Response("ok");
}

async function sendTelegramMessage(botToken, chatId, text, replyMarkup = null) {
  const payload = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// =============================
// USER DASHBOARD (Mini App)
// =============================
async function handleUserDashboard(request, env, req, url) {
  const userId = url.searchParams.get("user");
  let userData = await env.USER_DB.get(`user:${userId}`);
  userData = userData ? JSON.parse(userData) : null;

  if (!userData) {
    return new Response("User not found. Please /start the bot first.", { status: 404 });
  }

  // Handle form submissions
  if (req.method === "POST") {
    const formData = await req.formData();
    const action = formData.get("action");

    if (action === "add") {
      const id = Date.now().toString();
      const symbol = formData.get("symbol").toLowerCase();
      const target = parseFloat(formData.get("target"));
      await env.USER_DB.put(
        `alert:${userId}:${id}`,
        JSON.stringify({ id, symbol, target, triggered: false })
      );
    } else if (action === "delete") {
      await env.USER_DB.delete(`alert:${userId}:${formData.get("id")}`);
    } else if (action === "edit") {
      const id = formData.get("id");
      const symbol = formData.get("symbol").toLowerCase();
      const target = parseFloat(formData.get("target"));
      await env.USER_DB.put(
        `alert:${userId}:${id}`,
        JSON.stringify({ id, symbol, target, triggered: false })
      );
    }

    return Response.redirect(`/app?user=${userId}`, 303);
  }

  // Fetch user alerts
  const list = await env.USER_DB.list({ prefix: `alert:${userId}:` });
  const alerts = [];
  for (const key of list.keys) {
    const data = await env.USER_DB.get(key.name);
    alerts.push(JSON.parse(data));
  }

  const vipStatus = userData.vip ? "🌟 VIP" : "Free User";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Crypto Alerts Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #0d1117; color: white; }
          .card { background: #161b22; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
          .btn { background: #238636; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; display: inline-block; margin: 5px 0; }
          input { padding: 8px; border-radius: 6px; border: none; margin: 5px; }
          form { margin-top: 10px; }
        </style>
      </head>
      <body>
        <h2>🚀 Crypto Alerts Dashboard</h2>
        <div class="card">
          <p><strong>User:</strong> ${userId}</p>
          <p><strong>Status:</strong> ${vipStatus}</p>
        </div>

        <div class="card">
          <h3>Your Alerts</h3>
          <ul>
            ${alerts
              .map(
                (a) => `
              <li>
                ${a.symbol.toUpperCase()} → ${a.target} ${
                  a.triggered ? "✅ (Triggered)" : ""
                }
                <form method="POST" style="display:inline;">
                  <input type="hidden" name="action" value="delete"/>
                  <input type="hidden" name="id" value="${a.id}"/>
                  <button class="btn" type="submit">🗑 Delete</button>
                </form>
                <form method="POST" style="display:inline;">
                  <input type="hidden" name="action" value="edit"/>
                  <input type="hidden" name="id" value="${a.id}"/>
                  <input type="text" name="symbol" value="${a.symbol}" required/>
                  <input type="number" step="any" name="target" value="${a.target}" required/>
                  <button class="btn" type="submit">✏ Update</button>
                </form>
              </li>`
              )
              .join("")}
          </ul>
        </div>

        <div class="card">
          <h3>Add New Alert</h3>
          <form method="POST">
            <input type="hidden" name="action" value="add"/>
            <input type="text" name="symbol" placeholder="btc/eth" required/>
            <input type="number" step="any" name="target" placeholder="Target Price" required/>
            <button class="btn" type="submit">➕ Add</button>
          </form>
        </div>
      </body>
    </html>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// =============================
// ADMIN PANEL
// =============================
async function handleAdminPanel(request, env, url) {
  const password = url.searchParams.get("password");
  if (password !== env.ADMIN_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  const list = await env.USER_DB.list({ prefix: "user:" });
  let usersHtml = "";

  for (const key of list.keys) {
    const data = await env.USER_DB.get(key.name);
    const user = JSON.parse(data);
    usersHtml += `<li>User ${user.chatId} - ${user.vip ? "🌟 VIP" : "Free"}</li>`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Admin Panel</title></head>
      <body style="font-family: Arial; padding: 20px;">
        <h2>🔑 Admin Panel</h2>
        <h3>Registered Users</h3>
        <ul>${usersHtml}</ul>
      </body>
    </html>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// =============================
// PRICE CHECKER (runs on cron)
// =============================
async function checkAlerts(env) {
  const list = await env.USER_DB.list({ prefix: "alert:" });
  if (!list.keys.length) return;

  // Collect all symbols
  const alerts = [];
  for (const key of list.keys) {
    const data = await env.USER_DB.get(key.name);
    if (data) alerts.push(JSON.parse(data));
  }

  const symbols = [...new Set(alerts.map((a) => a.symbol))].join(",");
  if (!symbols) return;

  // Fetch live prices from CoinGecko
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${symbols}&vs_currencies=usd`
  );
  const prices = await res.json();

  for (const alert of alerts) {
    if (alert.triggered) continue;
    const price = prices[alert.symbol]?.usd;
    if (!price) continue;

    if (price >= alert.target) {
      // Trigger alert
      const userId = alert.id.split(":")[0]; // we’ll fix below
      const userKeyParts = alert.id ? alert.id.split(":") : null;
      const user = userKeyParts ? userKeyParts[1] : null;

      await sendTelegramMessage(
        env.BOT_TOKEN,
        user || userId,
        `🚨 Alert Triggered!\n${alert.symbol.toUpperCase()} hit $${alert.target}\n(Current: $${price})`
      );

      alert.triggered = true;
      await env.USER_DB.put(
        `alert:${user}:${alert.id}`,
        JSON.stringify(alert)
      );
    }
  }
}
