import { DurableObject } from "cloudflare:workers";

/**
 * Lobby Durable Object
 * 管理房间列表，支持 WebSocket 推送和 RPC 查询
 */
export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.wsClients = [];
  }

  // ─── 入口：fetch（处理 HTTP + WebSocket）───

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader === "websocket") {
      return this.handleWebSocket(request);
    }
    // HTTP 查询
    const rooms = await this.getRooms();
    return new Response(JSON.stringify({ type: "room_list", rooms }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async handleWebSocket(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.wsClients.push(server);

    // 发送当前房间列表
    this.sendRoomList(server);

    server.addEventListener("close", () => {
      const idx = this.wsClients.indexOf(server);
      if (idx !== -1) this.wsClients.splice(idx, 1);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── RPC ────────────────────────────────

  async updateRoom(roomId, data) {
    const rooms = (await this.ctx.storage.get("rooms")) || {};
    if (data.status === "deleted" || data.playerCount === 0) {
      delete rooms[roomId];
    } else {
      rooms[roomId] = data;
    }
    await this.ctx.storage.put("rooms", rooms);
    this.broadcastRoomList();
  }

  async getRooms() {
    const rooms = (await this.ctx.storage.get("rooms")) || {};
    const list = [];
    for (const [roomId, data] of Object.entries(rooms)) {
      if (data.status === "waiting") {
        list.push({ roomId, ...data });
      }
    }
    return list;
  }

  // ─── 工具 ──────────────────────────────

  sendRoomList(ws) {
    this.getRooms().then((rooms) => {
      this.sendTo(ws, { type: "room_list", rooms });
    });
  }

  broadcastRoomList() {
    this.getRooms().then((rooms) => {
      const data = JSON.stringify({ type: "room_list", rooms });
      for (const ws of this.wsClients) {
        try { ws.send(data); } catch { /* ignore */ }
      }
    });
  }

  sendTo(ws, data) {
    try { ws.send(JSON.stringify(data)); } catch { /* ignore */ }
  }
}
