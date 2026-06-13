/**
 * VueChest RealTime Server - Cloudflare Worker 入口
 * 路由：/snake/lobby  → Lobby DO
 *       /snake/game/:roomId  → GameRoom DO
 *       /snake/create → 创建新房间
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

function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env, ctx) {
    // 预检请求直接返回
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 健康检查
    if (path === "/health") {
      return corsResponse(JSON.stringify({ status: "ok" }));
    }

    // ─── 房间列表 ───────────────────────────
    if (path === "/snake/lobby") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader === "websocket") {
        return handleLobbyWebSocket(request, env);
      }
      // HTTP 查询
      const lobbyId = env.LOBBY.idFromName("global");
      const stub = env.LOBBY.get(lobbyId);
      const resp = await stub.fetch(request);
      // 加上 CORS 头
      return new Response(resp.body, {
        ...resp,
        headers: { ...CORS_HEADERS, ...Object.fromEntries(resp.headers) },
      });
    }

    // ─── 创建新房间 ─────────────────────────
    if (path === "/snake/create") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return corsResponse(
          JSON.stringify({ error: "WebSocket required" }),
          400,
        );
      }
      return handleCreateGame(request, env);
    }

    // ─── 加入已有房间 ───────────────────────
    if (path.startsWith("/snake/game/")) {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader !== "websocket") {
        return corsResponse(
          JSON.stringify({ error: "WebSocket required" }),
          400,
        );
      }
      const roomId = path.slice("/snake/game/".length);
      if (!roomId) {
        return corsResponse(JSON.stringify({ error: "Missing room ID" }), 400);
      }
      return handleGameWebSocket(request, env, roomId);
    }

    // 其他
    return corsResponse("VueChest Realtime Server");
  },
};

// ─── WebSocket 处理 ───────────────────────────────

async function handleLobbyWebSocket(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  const lobbyId = env.LOBBY.idFromName("global");
  const stub = env.LOBBY.get(lobbyId);

  await stub.handleSession(server);

  return new Response(null, { status: 101, webSocket: client });
}

async function handleCreateGame(request, env) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  const url = new URL(request.url);
  const playerName = url.searchParams.get("name") || "匿名";
  const roomId = crypto.randomUUID().slice(0, 8);

  const roomDOId = env.GAME_ROOM.idFromName(roomId);
  const stub = env.GAME_ROOM.get(roomDOId);

  await stub.handleSession(server, playerName, true, roomId);

  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: { "X-Room-Id": roomId },
  });
}

async function handleGameWebSocket(request, env, roomId) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  const url = new URL(request.url);
  const playerName = url.searchParams.get("name") || "匿名";

  const roomDOId = env.GAME_ROOM.idFromName(roomId);
  const stub = env.GAME_ROOM.get(roomDOId);

  await stub.handleSession(server, playerName, false, roomId);

  return new Response(null, { status: 101, webSocket: client });
}
