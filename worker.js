const TELEGRAM_TOKEN = "8209980143:AAEqYImLz5sniYx5cNCk0-yKX8wmiS9s9-g";
const MAX_FREE_ALERTS = 2;
const ADMIN_PASSWORD = "Premium01";
const TG_CHANNEL_IDS = "YOUR_CHANNEL_ID"; // comma-separated, numeric or @username

// ----------------------------
// Helper: Send Telegram notification
// ----------------------------
async function sendTelegramNotification(env, userId, message) {
  const chat_id = userId; // if user has Telegram ID, else map to your bot logic
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text: message })
  });
}

// ----------------------------
// Alerts CRUD & VIP logic
// ----------------------------
async function handleAlerts(request, env) {
  const userId = request.headers.get("x-user-id") || "demo-user";
  const user = await env.USERS_KV.get(userId, { type: "json" }) || { vip: false };
  let alerts = (await env.ALERTS_KV.get(userId, { type: "json" })) || [];

  if(request.method==="POST"){
    const data = await request.json();
    if(!user.vip && alerts.length >= MAX_FREE_ALERTS){
      return new Response(JSON.stringify({error:"Upgrade to VIP for unlimited alerts!"}), {status:403});
    }
    alerts.push({ id: crypto.randomUUID(), sent:false, ...data });
    await env.ALERTS_KV.put(userId, JSON.stringify(alerts));
    return new Response(JSON.stringify({success:true}), {status:200});
  }

  if(request.method==="GET"){
    return new Response(JSON.stringify(alerts), {headers:{"Content-Type":"application/json"}});
  }

  return new Response("Method not allowed",{status:405});
}

// ----------------------------
// Data Endpoints
// ----------------------------
async function handleDataRequests(request, env){
  const url = new URL(request.url);

  if(url.pathname.startsWith("/signals")){
    const signals = (await env.SIGNALS_KV.get("signals",{type:"json"}))||[];
    return new Response(JSON.stringify({signals}), {headers:{"Content-Type":"application/json"}});
  }

  if(url.pathname.startsWith("/memeradar")){
    const memecoins = (await env.MEMECOINS_KV.get("topCoins",{type:"json"}))||[];
    return new Response(JSON.stringify({topCoins:memecoins}), {headers:{"Content-Type":"application/json"}});
  }

  if(url.pathname.startsWith("/alphafeed")){
    const alphaFeed = (await env.ALPHA_KV.get("alphaFeed",{type:"json"}))||[];
    return new Response(JSON.stringify({alphaFeed}), {headers:{"Content-Type":"application/json"}});
  }

  if(url.pathname.startsWith("/events")){
    const events = (await env.EVENTS_KV.get("events",{type:"json"}))||[];
    return new Response(JSON.stringify({events}), {headers:{"Content-Type":"application/json"}});
  }

  if(url.pathname.startsWith("/user")){
    const userId = url.searchParams.get("id") || "demo-user";
    const user = await env.USERS_KV.get(userId, {type:"json"}) || { vip:false };
    return new Response(JSON.stringify(user), {headers:{"Content-Type":"application/json"}});
  }

  return new Response("Not Found",{status:404});
}

// ----------------------------
// VIP Upgrade Endpoint (manual/admin)
// ----------------------------
async function handleVIPUpgrade(request, env){
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const secret = url.searchParams.get("password");

  if(!userId || secret !== ADMIN_PASSWORD){
    return new Response(JSON.stringify({error:"Unauthorized"}),{status:401});
  }

  await env.USERS_KV.put(userId, JSON.stringify({vip:true, upgradedAt:new Date().toISOString()}));
  return new Response(JSON.stringify({success:true,message:`User ${userId} upgraded to VIP`}), {status:200});
}

// ----------------------------
// Admin Panel Endpoint
// ----------------------------
async function handleAdmin(request, env){
  const url = new URL(request.url);
  const secret = url.searchParams.get("password");
  if(secret!==ADMIN_PASSWORD) return new Response("❌ Unauthorized",{status:401});

  const users = [];
  for await(const key of env.USERS_KV.list()){
    const user = await env.USERS_KV.get(key.name, {type:"json"});
    if(user){
      const alerts = (await env.ALERTS_KV.get(key.name,{type:"json"}))||[];
      users.push({
        id:key.name,
        vip:user.vip||false,
        joinedAt:user.upgradedAt||'Free',
        alertsCount:alerts.length
      });
    }
  }

  const tableRows = users.map(u=>`
    <tr>
      <td>${u.id}</td>
      <td>${u.vip?'VIP':'Free'}</td>
      <td>${u.joinedAt}</td>
      <td>${u.alertsCount}</td>
      <td>
        <a href="/upgrade-vip?userId=${u.id}&password=${ADMIN_PASSWORD}" style="color:green;">Upgrade VIP</a>
      </td>
    </tr>`).join('');

  const html = `
  <html>
    <head><title>Admin Panel - Crypto Alerts Bot</title>
    <style>body{font-family:sans-serif;background:#0f111a;color:#fff;padding:20px;}
    table{border-collapse:collapse;width:100%;}
    th,td{padding:10px;border:1px solid #444;text-align:left;}
    th{background:#1f2233;}
    a{color:#4ec5ff;text-decoration:none;}
    </style></head>
    <body>
      <h1>Crypto Alerts Bot Admin Panel</h1>
      <table>
        <thead>
          <tr><th>User ID</th><th>Status</th><th>Joined/Upgraded</th><th>Alerts</th><th>Actions</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </body>
  </html>`;
  return new Response(html,{headers:{"Content-Type":"text/html"}});
}

// ----------------------------
// Worker Fetch Handler
// ----------------------------
export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);

    if(url.pathname.startsWith("/alert")) return handleAlerts(request, env);
    if(url.pathname.startsWith("/signals") || url.pathname.startsWith("/memeradar") || url.pathname.startsWith("/alphafeed") || url.pathname.startsWith("/events") || url.pathname.startsWith("/user")){
      return handleDataRequests(request, env);
    }
    if(url.pathname.startsWith("/upgrade-vip")) return handleVIPUpgrade(request, env);
    if(url.pathname.startsWith("/admin")) return handleAdmin(request, env);

    return new Response("Crypto Alerts Bot Worker Running!",{status:200});
  }
};

// ----------------------------
// Scheduled Price-Check Loop (runs every 5 minutes via Worker Cron Trigger)
// ----------------------------
export async function scheduled(event, env, ctx){
  console.log("Crypto Alerts Bot: Running price-check loop...");

  for await(const key of env.USERS_KV.list()){
    const userId = key.name;
    const user = await env.USERS_KV.get(userId,{type:"json"});
    if(!user) continue;

    let alerts = (await env.ALERTS_KV.get(userId,{type:"json"})) || [];
    for(const alert of alerts){
      if(alert.sent) continue;

      try{
        const coinId = alert.coin.toLowerCase();
        const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
        const data = await resp.json();
        const price = data[coinId]?.usd;
        if(!price) continue;

        let trigger=false;
        if(alert.type.toLowerCase()==="above" && price>=parseFloat(alert.target)) trigger=true;
        if(alert.type.toLowerCase()==="below" && price<=parseFloat(alert.target)) trigger=true;

        if(trigger){
          await sendTelegramNotification(env, userId, `🚨 Price Alert: ${alert.coin.toUpperCase()} is ${alert.type} $${alert.target}. Current: $${price}`);
          alert.sent=true;
        }
      } catch(err){ console.error("Price-check error:",err);}
    }
    await env.ALERTS_KV.put(userId, JSON.stringify(alerts));
  }
}
