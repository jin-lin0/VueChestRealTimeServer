/**
 * VueChest RealTime Server - Cloudflare Worker 入口
 * 路由：/snake/lobby  → Lobby DO
 *       /snake/game/:roomId  → GameRoom DO
 *       /snake/create → 创建新房间
 */
import { Lobby } from './Lobby.js'
import { GameRoom } from './GameRoom.js'

export { Lobby }
export { GameRoom }

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    // 健康检查
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ─── 房间列表 ───────────────────────────
    if (path === '/snake/lobby') {
      // 尝试 WebSocket 升级
      const upgradeHeader = request.headers.get('Upgrade')
      if (upgradeHeader === 'websocket') {
        return handleLobbyWebSocket(request, env)
      }
      // HTTP 查询
      const lobbyId = env.LOBBY.idFromName('global')
      const stub = env.LOBBY.get(lobbyId)
      return stub.fetch(request)
    }

    // ─── 创建新房间 ─────────────────────────
    if (path === '/snake/create') {
      const upgradeHeader = request.headers.get('Upgrade')
      if (upgradeHeader !== 'websocket') {
        return new Response('WebSocket required', { status: 400 })
      }
      return handleCreateGame(request, env)
    }

    // ─── 加入已有房间 ───────────────────────
    if (path.startsWith('/snake/game/')) {
      const upgradeHeader = request.headers.get('Upgrade')
      if (upgradeHeader !== 'websocket') {
        return new Response('WebSocket required', { status: 400 })
      }
      const roomId = path.slice('/snake/game/'.length)
      if (!roomId) {
        return new Response('Missing room ID', { status: 400 })
      }
      return handleGameWebSocket(request, env, roomId)
    }

    // 其他
    return new Response('VueChest Realtime Server', { status: 200 })
  },
}

/** 处理大厅 WebSocket（房间列表） */
async function handleLobbyWebSocket(request, env) {
  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair)

  const lobbyId = env.LOBBY.idFromName('global')
  const stub = env.LOBBY.get(lobbyId)

  // Lobby DO 处理此 WebSocket
  await stub.handleSession(server)

  return new Response(null, { status: 101, webSocket: client })
}

/** 创建新游戏房间 */
async function handleCreateGame(request, env) {
  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair)

  // 从 URL 参数获取玩家名
  const url = new URL(request.url)
  const playerName = url.searchParams.get('name') || '匿名'

  // 生成房间 ID
  const roomId = crypto.randomUUID().slice(0, 8)

  // 获取 GameRoom DO
  const roomDOId = env.GAME_ROOM.idFromName(roomId)
  const stub = env.GAME_ROOM.get(roomDOId)

  // 转发 WebSocket 给 DO
  await stub.handleSession(server, playerName, true, roomId)

  // 额外：通过 WebSocket 子系统发送 roomId（因为 DO 处理完后才能拿到）
  // DO 的 handleSession 会在内部广播 room_joined 消息

  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: {
      // 通过自定义 header 传递 roomId
      'X-Room-Id': roomId,
    },
  })
}

/** 加入已有游戏房间 */
async function handleGameWebSocket(request, env, roomId) {
  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair)

  const url = new URL(request.url)
  const playerName = url.searchParams.get('name') || '匿名'

  const roomDOId = env.GAME_ROOM.idFromName(roomId)
  const stub = env.GAME_ROOM.get(roomDOId)

  await stub.handleSession(server, playerName, false, roomId)

  return new Response(null, { status: 101, webSocket: client })
}
