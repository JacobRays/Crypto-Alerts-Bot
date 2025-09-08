// worker.js
// === Crypto Alerts Worker ===
// Handles user storage (KV), admin panel, user dashboard, and API endpoints.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ========= CONFIG =========
    const ADMIN_PASS = "Premium01!";
    const BASE_URL = "https://crypto-alerts-worker.premiumrays01.workers.dev";

    // ========= ADMIN PANEL =========
    if (url.pathname === "/admin") {
      const password = url.searchParams.get("password");
      if (password !== ADMIN_PASS) {
        return new Response("Unauthorized", { status: 401 });
      }

      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admin Panel</title>
        <style>
          body { font-family: 'Segoe UI', Arial; background: #0d1117; color: #eee; padding: 20px; }
          h1 { color: gold; }
          input, button { padding: 10px; margin: 5px; border-radius: 6px; border: none; }
          button { background: gold; cursor: pointer; font-weight: bold; }
          button:hover { background: #e6b800; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #333; padding: 10px; text-align: center; }
          th { background: #222; }
          tr:nth-child(even) { background: #1a1a1a; }
          .vip { color: gold; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>⚡ Crypto Alerts Admin Panel</h1>

        <form id="addUserForm">
          <input type="text" id="userId" placeholder="Telegram User ID" required />
          <input type="text" id="username" placeholder="Username" />
          <button type="submit">Add User</button>
        </form>

        <button onclick="listUsers()">📋 Show Users</button>
        <div id="users"></div>

        <script>
          async function listUsers() {
            let res = await fetch("/api/users?password=${ADMIN_PASS}");
            let users = await res.json();
            let html = "<table><tr><th>ID</th><th>Username</th><th>Status</th><th>Action</th></tr>";
            for (let u of users) {
              html += "<tr>" +
                "<td>" + u.id + "</td>" +
                "<td>" + (u.username || '-') + "</td>" +
                "<td>" + (u.vip ? "<span class='vip'>VIP</span>" : "Free") + "</td>" +
                "<td><button onclick=\\"toggleVIP('" + u.id + "')\\">Toggle VIP</button></td>" +
              "</tr>";
            }
            html += "</table>";
            document.getElementById("users").innerHTML = html;
          }

          async function toggleVIP(id) {
            await fetch("/api/toggleVIP?password=${ADMIN_PASS}&id=" + id, { method: "POST" });
            listUsers();
          }

          document.getElementById("addUserForm").onsubmit = async (e) => {
            e.preventDefault();
            let userId = document.getElementById("userId").value;
            let username = document.getElementById("username").value;
            await fetch("/api/addUser?password=${ADMIN_PASS}", {
              method: "POST",
              body: JSON.stringify({ id: userId, username }),
            });
            alert("✅ User added");
            listUsers();
          };
        </script>
      </body>
      </html>`;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // ========= API: LIST USERS =========
    if (url.pathname === "/api/users") {
      if (url.searchParams.get("password") !== ADMIN_PASS) {
        return new Response("Unauthorized", { status: 401 });
      }
      const { keys } = await env.USER_DB.list();
      let users = [];
      for (let key of keys) {
        let data = await env.USER_DB.get(key.name);
        if (data) users.push(JSON.parse(data));
      }
      return Response.json(users);
    }

    // ========= API: ADD USER =========
    if (url.pathname === "/api/addUser" && request.method === "POST") {
      if (url.searchParams.get("password") !== ADMIN_PASS) {
        return new Response("Unauthorized", { status: 401 });
      }
      let body = await request.json();
      await env.USER_DB.put(body.id, JSON.stringify({
        id: body.id,
        username: body.username || "",
        vip: false,
        joinedAt: Date.now()
      }));
      return Response.json({ success: true });
    }

    // ========= API: TOGGLE VIP =========
    if (url.pathname === "/api/toggleVIP" && request.method === "POST") {
      if (url.searchParams.get("password") !== ADMIN_PASS) {
        return new Response("Unauthorized", { status: 401 });
      }
      const id = url.searchParams.get("id");
      let data = await env.USER_DB.get(id);
      if (!data) return Response.json({ error: "User not found" }, { status: 404 });
      let user = JSON.parse(data);
      user.vip = !user.vip;
      await env.USER_DB.put(id, JSON.stringify(user));
      return Response.json({ success: true, vip: user.vip });
    }

    // ========= API: GET USER =========
    if (url.pathname === "/api/user") {
      const id = url.searchParams.get("id");
      if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
      let data = await env.USER_DB.get(id);
      if (!data) return Response.json({ error: "User not found" }, { status: 404 });
      return Response.json(JSON.parse(data));
    }

    // ========= USER DASHBOARD =========
    if (url.pathname === "/app") {
      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Crypto Alerts Dashboard</title>
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg,#0d1117,#161b22); color: #eee; margin: 0; padding: 20px; text-align: center; }
          .card { background: #1f2937; padding: 20px; border-radius: 16px; margin: 20px auto; max-width: 400px; box-shadow: 0 0 15px rgba(255,215,0,0.2); }
          h1 { color: gold; }
          .vip { color: gold; font-weight: bold; }
          button { margin-top: 15px; padding: 12px 24px; background: gold; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; }
          button:hover { background: #e6b800; }
        </style>
      </head>
      <body>
        <h1>🚀 Crypto Alerts</h1>
        <div class="card">
          <h2 id="username">Loading...</h2>
          <p>Status: <span id="status">Checking...</span></p>
          <button id="upgradeBtn">Upgrade to VIP ⭐</button>
        </div>

        <script>
          const tg = window.Telegram.WebApp;
          tg.expand();

          const initDataUnsafe = tg.initDataUnsafe;
          const userId = initDataUnsafe?.user?.id || "123";

          fetch("/api/user?id=" + userId)
            .then(res => res.json())
            .then(user => {
              document.getElementById("username").innerText = "👤 " + (user.username || "Guest");
              document.getElementById("status").innerText = user.vip ? "⭐ VIP" : "Free";
              if (user.vip) {
                document.getElementById("upgradeBtn").style.display = "none";
              }
            });

          document.getElementById("upgradeBtn").onclick = () => {
            alert("🔒 VIP payment system coming soon!");
          };
        </script>
      </body>
      </html>`;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // ========= BOT START PAGE =========
    if (url.pathname === "/start") {
      const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Telegram Bot Launcher</title>
        <meta charset="UTF-8">
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
      </head>
      <body>
        <script>
          const tg = window.Telegram.WebApp;
          tg.openLink("${BASE_URL}/app");
        </script>
      </body>
      </html>`;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // ========= DEFAULT =========
    return new Response("Crypto Alerts Worker is running ✅");
  },
};
