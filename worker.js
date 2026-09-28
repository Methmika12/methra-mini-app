export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null,{status:204,headers:cors});
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {

      if (path === "/" && request.method === "POST") {
        const u = await request.json();
        const m = u.message;

        if (m?.text?.startsWith("/start")) {
          const id = String(m.from?.id || "");
          const name = m.from?.username || "";
          const ref = m.text.trim().split(/\s+/)[1] || "";

          if (id) {
            await createUser(env,id,name,ref);

            let msg = `🚀 Welcome to METHRA!

Mine • Earn • Grow

⛏️ Start mining and collect MTH points.

🎁 Daily Bonus: +50 MTH
👥 Referral Reward: +150 MTH
🎯 Community Task: +100 MTH`;

            if (ref && ref !== id) {
              msg = `🎉 Welcome to METHRA!

You joined through a referral link.

⛏️ Start mining and collect MTH points.

🎁 Daily Bonus: +50 MTH
👥 Referral Reward: +150 MTH
🎯 Community Task: +100 MTH`;
            }

            await tg(env,m.chat.id,msg,{
              inline_keyboard:[
                [{
                  text:"🚀 Open METHRA",
                  url:"https://methmika12.github.io/methra-mini-app/"
                }],
                [{
                  text:"📢 METHRA Community",
                  url:"https://t.me/METHRA_Community"
                }]
              ]
            });
          }
        }

        return json({ok:true},200,cors);
      }

      if (path === "/" && url.searchParams.has("user_id")) {
        const id = url.searchParams.get("user_id");

        if (!id)
          return json(
            {ok:false,error:"Missing user_id"},
            400,cors
          );

        const r = await fetch(
          "https://api.telegram.org/bot" +
          env.BOT_TOKEN +
          "/getChatMember?chat_id=@METHRA_Community&user_id=" +
          encodeURIComponent(id)
        );

        return json(await r.json(),200,cors);
      }

      if (path === "/user") {
        if (request.method !== "POST")
          return json(
            {ok:false,error:"POST required"},
            405,cors
          );

        const b = await request.json();
        const id = String(b.user_id || "");

        if (!id)
          return json(
            {ok:false,error:"Missing user_id"},
            400,cors
          );

        await createUser(
          env,
          id,
          String(b.username || ""),
          String(b.referral || "").trim()
        );

        return json({
          ok:true,
          user:await user(env,id),
          referral_count:await refs(env,id)
        },200,cors);
      }

      if (path === "/balance") {
        const id = url.searchParams.get("user_id");
        const u = await user(env,id);

        if (!u)
          return json(
            {ok:false,error:"User not found"},
            404,cors
          );

        return json({
          ok:true,
          balance:Number(u.balance || 0),
          user:u
        },200,cors);
      }

      if (path === "/referrals") {
        const id = url.searchParams.get("user_id");

        return json({
          ok:true,
          count:await refs(env,id)
        },200,cors);
      }

      if (path === "/mining/start") {
        if (request.method !== "POST")
          return json(
            {ok:false,error:"POST required"},
            405,cors
          );

        const b = await request.json();
        const id = String(b.user_id || "");
        const u = await user(env,id);

        if (!u)
          return json(
            {ok:false,error:"User not found"},
            404,cors
          );

        if (Number(u.mining_start || 0) > 0)
          return json(
            {ok:false,error:"Mining already started"},
            400,cors
          );

        const now = Date.now();

        await env.DB.prepare(
          "UPDATE users SET mining_start=?,mining_claimed=0 WHERE telegram_id=?"
        ).bind(now,id).run();

        return json({
          ok:true,
          mining_start:now,
          duration_hours:8,
          rate:1
        },200,cors);
      }

      if (path === "/mining/status") {
        const id = url.searchParams.get("user_id");
        const u = await user(env,id);

        if (!u)
          return json(
            {ok:false,error:"User not found"},
            404,cors
          );

        const start = Number(u.mining_start || 0);

        if (!start)
          return json({
            ok:true,
            running:false,
            completed:false,
            mined:0,
            remaining:0
          },200,cors);

        const duration = 8*60*60*1000;
        const elapsed = Date.now()-start;
        const completed = elapsed >= duration;

        return json({
          ok:true,
          running:!completed,
          completed,
          mined:Math.min(
            8,
            Math.max(0,elapsed/3600000)
          ),
          remaining:Math.max(
            0,
            duration-elapsed
          ),
          mining_start:start
        },200,cors);
      }

      if (path === "/mining/claim") {
        if (request.method !== "POST")
          return json(
            {ok:false,error:"POST required"},
            405,cors
          );

        const b = await request.json();
        const id = String(b.user_id || "");
        const u = await user(env,id);

        if (!u)
          return json(
            {ok:false,error:"User not found"},
            404,cors
          );

        if (!Number(u.mining_start || 0))
          return json(
            {ok:false,error:"Mining has not started"},
            400,cors
          );

        if (Number(u.mining_claimed || 0) === 1)
          return json(
            {ok:false,error:"Mining reward already claimed"},
            400,cors
          );

        if (
          Date.now()-Number(u.mining_start) <
          8*60*60*1000
        )
          return json(
            {ok:false,error:"Mining is not completed yet"},
            400,cors
          );

        await env.DB.prepare(
          "UPDATE users SET balance=balance+8,mining_claimed=1,mining_start=0 WHERE telegram_id=?"
        ).bind(id).run();

        const n = await user(env,id);

        return json({
          ok:true,
          reward:8,
          balance:Number(n.balance || 0)
        },200,cors);
      }

      if (path === "/daily/claim") {
        if (request.method !== "POST")
          return json(
            {ok:false,error:"POST required"},
            405,cors
          );

        const b = await request.json();
        const id = String(b.user_id || "");
        const u = await user(env,id);

        if (!u)
          return json(
            {ok:false,error:"User not found"},
            404,cors
          );

        const day =
          new Date().toISOString().slice(0,10);

        if (u.daily_claim === day)
          return json(
            {ok:false,error:"Daily bonus already claimed"},
            400,cors
          );

        await env.DB.prepare(
          "UPDATE users SET balance=balance+50,daily_claim=? WHERE telegram_id=?"
        ).bind(day,id).run();

        const n = await user(env,id);

        return json({
          ok:true,
          reward:50,
          balance:Number(n.balance || 0)
        },200,cors);
      }

      if (path === "/task/telegram/claim") {
        if (request.method !== "POST")
          return json(
            {ok:false,error:"POST required"},
            405,cors
          );

        const b = await request.json();
        const id = String(b.user_id || "");

        const r = await fetch(
          "https://api.telegram.org/bot" +
          env.BOT_TOKEN +
          "/getChatMember?chat_id=@METHRA_Community&user_id=" +
          encodeURIComponent(id)
        );

        const d = await r.json();
        const s = d.result?.status;

        if (
          !d.ok ||
          !d.result ||
          !["member","administrator","creator"].includes(s)
        )
          return json({
            ok:false,
            error:"Please join METHRA Community first"
          },400,cors);

        const old = await env.DB.prepare(
          "SELECT claimed FROM tasks WHERE telegram_id=? AND task='telegram_join'"
        ).bind(id).first();

        if (old?.claimed)
          return json({
            ok:false,
            error:"Telegram reward already claimed"
          },400,cors);

        await env.DB.prepare(
          "INSERT OR REPLACE INTO tasks(telegram_id,task,claimed,created_at) VALUES(?,'telegram_join',1,?)"
        ).bind(id,Date.now()).run();

        await env.DB.prepare(
          "UPDATE users SET balance=balance+100 WHERE telegram_id=?"
        ).bind(id).run();

        const n = await user(env,id);

        return json({
          ok:true,
          reward:100,
          balance:Number(n.balance || 0)
        },200,cors);
      }

      if (path === "/tasks") {
        const id = url.searchParams.get("user_id");

        const r = await env.DB.prepare(
          "SELECT task,claimed FROM tasks WHERE telegram_id=?"
        ).bind(id).all();

        return json({
          ok:true,
          tasks:r.results || []
        },200,cors);
      }

      if (path === "/withdraw") {
        if (request.method !== "POST")
          return json(
            {ok:false,error:"POST required"},
            405,cors
          );

        const b = await request.json();

        const id = String(b.user_id || "");
        const name = String(b.username || "");
        const amount = Number(b.amount || 0);
        const wallet = String(b.wallet || "").trim();

        if (!id || !wallet || !amount)
          return json(
            {ok:false,error:"Missing withdrawal information"},
            400,cors
          );

        if (amount < 2000)
          return json(
            {ok:false,error:"Minimum withdrawal is 2000 MTH"},
            400,cors
          );

        const u = await user(env,id);

        if (!u)
          return json(
            {ok:false,error:"User not found"},
            404,cors
          );

        if (Number(u.balance || 0) < amount)
          return json(
            {ok:false,error:"Insufficient MTH balance"},
            400,cors
          );

        const r = await env.DB.prepare(
          "INSERT INTO withdrawals(telegram_id,username,amount,wallet,status,created_at) VALUES(?,?,?,?,?,?)"
        ).bind(
          id,
          name,
          amount,
          wallet,
          "pending",
          Date.now()
        ).run();

        const rid =
          r.meta?.last_row_id || "";

        await tg(
          env,
          id,
`✅ Withdrawal Request Received

💰 Amount: ${amount} MTH
📌 Status: Pending Review

⏳ Estimated processing time:
Up to 48 hours.

Your request is waiting for manual review.

⚠️ MTH is currently a points/demo system.`
        );

        if (env.ADMIN_CHAT_ID) {
          await tg(
            env,
            env.ADMIN_CHAT_ID,
`💸 New Withdrawal Request

🆔 Request ID: ${rid}
👤 User: ${name ? "@"+name : "No username"}
🆔 Telegram ID: ${id}
💰 Amount: ${amount} MTH
📌 Status: Pending

⏳ Review target: Up to 48 hours`
          );
        }

        return json({
          ok:true,
          status:"pending",
          withdrawal_id:rid,
          message:
            "Withdrawal request submitted for review"
        },200,cors);
      }

      if (path === "/withdrawals") {
        const id = url.searchParams.get("user_id");

        const r = await env.DB.prepare(
          "SELECT id,amount,wallet,status,created_at FROM withdrawals WHERE telegram_id=? ORDER BY id DESC"
        ).bind(id).all();

        return json({
          ok:true,
          withdrawals:r.results || []
        },200,cors);
      }

      if (path === "/health") {
        return json({
          ok:true,
          service:"METHRA API",
          database:"connected",
          telegram_notifications:!!env.BOT_TOKEN,
          admin_notifications:!!env.ADMIN_CHAT_ID
        },200,cors);
      }

      return json(
        {ok:false,error:"Unknown endpoint"},
        404,
        cors
      );

    } catch (e) {
      console.error(e);

      return json(
        {ok:false,error:"Server error"},
        500,
        cors
      );
    }
  }
};


async function createUser(
  env,
  id,
  name,
  ref
) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users(telegram_id,username,balance,mining_start,mining_claimed,daily_claim,created_at) VALUES(?,?,0,0,0,'',?)"
  ).bind(
    id,
    name,
    Date.now()
  ).run();

  await env.DB.prepare(
    "UPDATE users SET username=? WHERE telegram_id=?"
  ).bind(name,id).run();

  if (ref && ref !== id) {

    const r = await env.DB.prepare(
      "SELECT telegram_id FROM users WHERE telegram_id=?"
    ).bind(ref).first();

    const x = await env.DB.prepare(
      "SELECT id FROM referrals WHERE referred_id=?"
    ).bind(id).first();

    if (r && !x) {

      await env.DB.prepare(
        "INSERT INTO referrals(referrer_id,referred_id,created_at) VALUES(?,?,?)"
      ).bind(
        ref,
        id,
        Date.now()
      ).run();

      await env.DB.prepare(
        "UPDATE users SET balance=balance+150 WHERE telegram_id=?"
      ).bind(ref).run();
    }
  }
}


async function user(env,id) {
  return env.DB.prepare(
    "SELECT telegram_id,username,balance,mining_start,mining_claimed,daily_claim FROM users WHERE telegram_id=?"
  ).bind(String(id)).first();
}


async function refs(env,id) {
  const r = await env.DB.prepare(
    "SELECT COUNT(*) count FROM referrals WHERE referrer_id=?"
  ).bind(String(id)).first();

  return Number(r?.count || 0);
}


async function tg(
  env,
  chat,
  text,
  markup=null
) {
  if (!env.BOT_TOKEN)
    return null;

  const body = {
    chat_id:String(chat),
    text
  };

  if (markup)
    body.reply_markup = markup;

  try {
    const r = await fetch(
      "https://api.telegram.org/bot" +
      env.BOT_TOKEN +
      "/sendMessage",
      {
        method:"POST",
        headers:{
          "Content-Type":
            "application/json"
        },
        body:JSON.stringify(body)
      }
    );

    return await r.json();

  } catch(e) {
    console.error(e);
    return null;
  }
}


function json(
  data,
  status,
  headers
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}