/**
 * VueChest RealTime Server - Cloudflare Worker 入口
 * 使用 stub.fetch(request) 将请求转发给 DO 处理 WebSocket 升级
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
      const lobbyId = env.LOBBY.idFromName("global");
      const stub = env.LOBBY.get(lobbyId);
      const resp = await stub.fetch(request);
      // HTTP 响应加 CORS，WS 101 响应不用加
      if (resp.status !== 101) {
        const headers = { ...CORS_HEADERS };
        resp.headers.forEach((v, k) => { headers[k] = v; });
        return new Response(resp.body, { ...resp, headers });
      }
      return resp;
    }

    // ─── 创建房间 ─────────────────────────
    if (path === "/snake/create" || path.startsWith("/snake/game/")) {
      const roomId = path === "/snake/create"
        ? crypto.randomUUID().slice(0, 8)
        : path.slice("/snake/game/".length);
      if (!roomId) return corsJson({ error: "no roomId" }, 400);

      const id = env.GAME_ROOM.idFromName(roomId);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return new Response("VueChest Realtime Server");
  },
};
