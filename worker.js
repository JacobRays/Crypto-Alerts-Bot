const ADMIN_PASSWORD = "Premium01"; // <-- set a strong password here

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ========== ADMIN DASHBOARD ==========
    if (url.pathname.startsWith("/admin")) {
      const auth = url.searchParams.get("password");
      if (auth !== ADMIN_PASSWORD) {
        return new Response("❌ Unauthorized", { status: 401 });
      }

      // Toggle VIP request
      if (url.pathname === "/admin/toggle" && request.method === "POST") {
        const userId = url.searchParams.get("id");
        if (!userId) return new Response("❌ No user ID", { status: 400 });

        const existing = await env.USER_DB.get(`user:${userId}`);
        if (!existing) return new Response("❌ User not found", { status: 404 });

        let data = JSON.parse(existing);
        data.vip = !data.vip; // toggle
        await env.USER_DB.put(`user:${userId}`, JSON.stringify(data));

        return new Response("✅ VIP toggled");
      }

      // Main dashboard
      const list = await env.USER_DB.list();
      let rows = "";

      for (const key of list.keys) {
        const userData = await env.USER_DB.get(key.name);
        const user = JSON.parse(userData || "{}");
        rows += `
          <tr>
            <td>${key.name.replace("user:", "")}</td>
            <td>${user.username || "unknown"}</td>
            <td>${user.vip ? "⭐ VIP" : "Free"}</td>
            <td>
              <form method="POST" action="/admin/toggle?id=${key.name.replace("user:", "")}&password=${ADMIN_PASSWORD}">
                <button type="submit">${user.vip ? "Remove VIP" : "Make VIP"}</button>
              </form>
            </td>
          </tr>`;
      }

      const html = `
        <html>
          <head>
            <title>Admin Dashboard</title>
            <style>
              body { font-family: Arial, sans-serif; background:#111; color:#fff; }
              h1 { color: gold; }
              table { width:100%; border-collapse: collapse; margin-top:20px; }
              th, td { border: 1px solid #444; padding: 8px; text-align:center; }
              th { background: #222; color: gold; }
              button { padding: 6px 12px; border:none; background:gold; color:black; cursor:pointer; }
              button:hover { background:#e6b800; }
            </style>
          </head>
          <body>
            <h1>Crypto Alerts Admin</h1>
            <p>Logged in with password ✅</p>
            <table>
              <tr><th>User ID</th><th>Username</th><th>Status</th><th>Action</th></tr>
              ${rows}
            </table>
          </body>
        </html>
      `;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // ========== USER REGISTRATION ==========
    if (request.method === "POST") {
      let update;
      try {
        update = await request.json();
      } catch (e) {
        return new Response("Invalid JSON", { status: 400 });
      }

      // If WebApp registration
      if (update.userId) {
        await env.USER_DB.put(`user:${update.userId}`, JSON.stringify({
          vip: false,
          joinedAt: Date.now(),
          username: update.username || "unknown"
        }));
        return new Response("✅ User saved to KV!");
      }

      // If Telegram Bot update
      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text?.trim();
        const allowedUserId = 7352016327; // <-- Replace with YOUR Telegram ID

        if (text === "/start") {
          await sendMessage(env, chatId, "🚀 Welcome to Crypto Alerts Bot!\n\nTap below to open the mini app:", {
            keyboard: [[{ text: "📲 Open Mini App", web_app: { url: "https://crypto-alerts-bot.pages.dev" } }]],
            resize_keyboard: true
          });
        }

        if (text?.startsWith("/broadcast")) {
          if (msg.from.id !== allowedUserId) {
            await sendMessage(env, chatId, "❌ You are not allowed to broadcast.");
            return new Response("ok", { status: 200 });
          }
          const broadcastText = text.replace("/broadcast", "").trim();
          if (!broadcastText) {
            await sendMessage(env, chatId, "⚠️ Please provide a message.");
            return new Response("ok", { status: 200 });
          }
          await sendMessage(env, "@crypto_sniper_alerts", broadcastText);
          await sendMessage(env, chatId, "✅ Broadcast sent to channel.");
        }
      }

      return new Response("ok", { status: 200 });
    }

    // GET request: check user in KV
    if (request.method === "GET") {
      const url = new URL(request.url);
      const userId = url.searchParams.get("id");
      if (!userId) return new Response("❌ No ID provided", { status: 400 });

      const userData = await env.USER_DB.get(`user:${userId}`);
      return new Response(userData || "❌ User not found");
    }

    return new Response("Crypto Alerts Worker is running ✅");
  },
};

// === HELPERS ===
async function sendMessage(env, chatId, text, replyMarkup = null) {
  const payload = { chat_id: chatId, text, parse_mode: "HTML" };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

async function sendPhoto(env, chatId, photoUrl, caption = "") {
  const payload = { chat_id: chatId, photo: photoUrl, caption, parse_mode: "HTML" };
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}
