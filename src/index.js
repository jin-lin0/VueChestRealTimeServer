/**
 * VueChest RealTime Server - Cloudflare Worker 入口
 */
import { Lobby } from "./Lobby.js";
import { GameRoom } from "./GameRoom.js";

export { Lobby };
export { GameRoom };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Client-Geo",
};

function corsJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/health") return corsJson({ status: "ok" });

    // ─── 大厅 ─────────────────────────────
    if (path === "/snake/lobby") {
      const upgrade = request.headers.get("Upgrade");
      if (upgrade === "websocket") {
        return handleLobbyWS(request, env);
      }
      // HTTP 查询
      const lobbyId = env.LOBBY.idFromName("global");
      const stub = env.LOBBY.get(lobbyId);
      const resp = await stub.fetch(request);
      const headers = { ...CORS_HEADERS };
      resp.headers.forEach((v, k) => { headers[k] = v; });
      return new Response(resp.body, { ...resp, headers });
    }

    // ─── 创建房间（WS）────────────────────
    if (path === "/snake/create") {
      return handleCreateWS(request, env);
    }

    // ─── 加入房间（WS）────────────────────
    if (path.startsWith("/snake/game/")) {
      const roomId = path.slice("/snake/game/".length);
      if (!roomId) return corsJson({ error: "no roomId" }, 400);
      return handleJoinWS(request, env, roomId);
    }

    return new Response("VueChest Realtime Server");
  },
};

/** 大厅 WS：Lobby DO 处理 */
async function handleLobbyWS(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  const id = env.LOBBY.idFromName("global");
  const stub = env.LOBBY.get(id);
  await stub.handleSession(server);

  return new Response(null, { status: 101, webSocket: client });
}

/** 创建房间 WS：Worker 生成 roomId，路由到 GameRoom DO */
async function handleCreateWS(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "匿名";
  const roomId = crypto.randomUUID().slice(0, 8);

  const id = env.GAME_ROOM.idFromName(roomId);
  const stub = env.GAME_ROOM.get(id);
  await stub.handleSession(server, name, roomId);

  return new Response(null, { status: 101, webSocket: client });
}

/** 加入房间 WS：路由到指定 GameRoom DO */
async function handleJoinWS(request, env, roomId) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "匿名";

  const id = env.GAME_ROOM.idFromName(roomId);
  const stub = env.GAME_ROOM.get(id);
  await stub.handleSession(server, name, roomId);

  return new Response(null, { status: 101, webSocket: client });
}
