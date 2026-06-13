import { DurableObject } from 'cloudflare:workers'

/**
 * Lobby Durable Object
 * 管理房间列表，支持 WebSocket 推送和 RPC 查询
 */
export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.ctx = ctx
    this.env = env
    this.wsClients = [] // 监听列表变化的 WebSocket
  }

  // ─── WebSocket 连接（实时推送）───────────

  async handleSession(webSocket) {
    webSocket.accept()
    this.wsClients.push(webSocket)

    // 发送当前房间列表
    this.sendRoomList(webSocket)

    webSocket.addEventListener('message', () => {
      // 客户端不需要发消息，列表由服务端推送
    })

    webSocket.addEventListener('close', () => {
      const idx = this.wsClients.indexOf(webSocket)
      if (idx !== -1) this.wsClients.splice(idx, 1)
    })
  }

  // ─── RPC（由 GameRoom DO / Worker 调用）───

  /** 添加或更新房间 */
  async updateRoom(roomId, data) {
    const rooms = (await this.ctx.storage.get('rooms')) || {}
    if (data.status === 'deleted' || data.playerCount === 0) {
      delete rooms[roomId]
    } else {
      rooms[roomId] = data
    }
    await this.ctx.storage.put('rooms', rooms)
    this.broadcastRoomList()
  }

  /** 获取所有等待中的房间 */
  async getRooms() {
    const rooms = (await this.ctx.storage.get('rooms')) || {}
    const list = []
    for (const [roomId, data] of Object.entries(rooms)) {
      if (data.status === 'waiting') {
        list.push({ roomId, ...data })
      }
    }
    return list
  }

  /** HTTP 接口（Worker 调用） */
  async fetch(request) {
    const rooms = await this.getRooms()
    return new Response(JSON.stringify({ type: 'room_list', rooms }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ─── 工具 ──────────────────────────────

  sendRoomList(ws) {
    this.getRooms().then((rooms) => {
      this.sendTo(ws, { type: 'room_list', rooms })
    })
  }

  broadcastRoomList() {
    this.getRooms().then((rooms) => {
      const data = JSON.stringify({ type: 'room_list', rooms })
      for (const ws of this.wsClients) {
        try { ws.send(data) } catch { /* ignore */ }
      }
    })
  }

  sendTo(ws, data) {
    try { ws.send(JSON.stringify(data)) } catch { /* ignore */ }
  }
}
