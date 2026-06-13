const { WebSocketServer } = require('ws')
const GameRoom = require('./GameRoom')
const CONFIG = require('./config')

const rooms = new Map() // roomId -> GameRoom
let nextRoomId = 1

// 连接 → 房间映射
const clientRoomMap = new Map() // ws -> roomId

// 所有活跃连接（用于广播房间列表变化）
const connections = new Set()

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/snake' })

  wss.on('connection', (ws) => {
    connections.add(ws)
    console.log('[Snake WS] 新连接')

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        handleMessage(ws, msg)
      } catch (e) {
        sendTo(ws, { type: 'error', msg: '消息格式错误' })
      }
    })

    ws.on('close', () => {
      connections.delete(ws)
      handleDisconnect(ws)
    })

    ws.on('error', () => {
      connections.delete(ws)
      handleDisconnect(ws)
    })

    // 发送当前房间列表
    sendRoomList(ws)
  })

  console.log('[Snake WS] WebSocket 已挂载到 /snake')
}

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'list_rooms':
      sendRoomList(ws)
      break

    case 'create_room':
      handleCreateRoom(ws, msg.playerName)
      break

    case 'join_room':
      handleJoinRoom(ws, msg.roomId, msg.playerName)
      break

    case 'leave_room':
      handleLeaveRoom(ws)
      break

    case 'ready':
      handleReady(ws)
      break

    case 'input':
      handleInput(ws, msg.direction)
      break

    default:
      sendTo(ws, { type: 'error', msg: '未知消息类型: ' + msg.type })
  }
}

// ─── 房间列表推送 ──────────────────────────

/** 向单个客户端发送房间列表 */
function sendRoomList(ws) {
  sendTo(ws, { type: 'room_list', rooms: getRoomListData() })
}

/** 向所有连接广播房间列表 */
function broadcastRoomList() {
  const data = JSON.stringify({ type: 'room_list', rooms: getRoomListData() })
  for (const ws of connections) {
    try { ws.send(data) } catch { /* ignore */ }
  }
}

/** 获取房间列表数据（仅 waiting 状态的房间可见） */
function getRoomListData() {
  const list = []
  for (const [, room] of rooms) {
    if (room.status === 'waiting') {
      list.push(room.getInfo())
    }
  }
  return list
}

// ─── 消息处理 ──────────────────────────────

function handleCreateRoom(ws, playerName) {
  if (clientRoomMap.has(ws)) {
    sendTo(ws, { type: 'error', msg: '你已在房间中' })
    return
  }

  const name = (playerName || '匿名玩家').slice(0, 12)
  const roomId = String(nextRoomId++)
  const room = new GameRoom(roomId)
  room.addClient(ws, name)
  rooms.set(roomId, room)
  clientRoomMap.set(ws, roomId)

  sendTo(ws, { type: 'room_joined', room: room.getInfo() })
  broadcastRoomList() // 通知所有客户端房间列表已变化
  console.log(`[Snake WS] 创建房间 ${roomId}，玩家: ${name}`)
}

function handleJoinRoom(ws, roomId, playerName) {
  if (clientRoomMap.has(ws)) {
    sendTo(ws, { type: 'error', msg: '你已在房间中' })
    return
  }

  const room = rooms.get(roomId)
  if (!room) {
    sendTo(ws, { type: 'error', msg: '房间不存在' })
    return
  }
  if (room.status !== 'waiting') {
    sendTo(ws, { type: 'error', msg: '房间已开始游戏' })
    return
  }

  const name = (playerName || '匿名玩家').slice(0, 12)
  const playerId = room.addClient(ws, name)
  if (!playerId) {
    sendTo(ws, { type: 'error', msg: '房间已满' })
    return
  }

  clientRoomMap.set(ws, roomId)

  // 通知加入者
  sendTo(ws, { type: 'room_joined', room: room.getInfo() })

  // 通知房间其他玩家
  room.broadcast({
    type: 'player_joined',
    players: room.clients.map((c) => ({
      playerId: c.playerId,
      name: c.name,
      ready: c.ready,
    })),
  })

  broadcastRoomList() // 通知所有客户端房间列表已变化
  console.log(`[Snake WS] 玩家 ${name} 加入房间 ${roomId}`)
}

function handleLeaveRoom(ws) {
  const roomId = clientRoomMap.get(ws)
  if (!roomId) return

  const room = rooms.get(roomId)
  if (!room) {
    clientRoomMap.delete(ws)
    return
  }

  room.removeClient(ws)
  clientRoomMap.delete(ws)

  // 通知剩余玩家
  if (room.clients.length > 0) {
    room.broadcast({
      type: 'player_left',
      players: room.clients.map((c) => ({
        playerId: c.playerId,
        name: c.name,
        ready: c.ready,
      })),
    })
  } else {
    // 房间没人了，删除
    rooms.delete(roomId)
    console.log(`[Snake WS] 房间 ${roomId} 已删除（无人）`)
  }

  broadcastRoomList() // 通知所有客户端房间列表已变化
}

function handleReady(ws) {
  const roomId = clientRoomMap.get(ws)
  if (!roomId) return
  const room = rooms.get(roomId)
  if (!room) return
  room.setReady(ws)

  // 广播更新后的玩家状态
  room.broadcast({
    type: 'player_joined',
    players: room.clients.map((c) => ({
      playerId: c.playerId,
      name: c.name,
      ready: c.ready,
    })),
  })

  // 房间状态可能变为 countdown/playing，更新列表
  broadcastRoomList()
}

function handleInput(ws, direction) {
  const validDirs = ['UP', 'DOWN', 'LEFT', 'RIGHT']
  if (!validDirs.includes(direction)) return

  const roomId = clientRoomMap.get(ws)
  if (!roomId) return
  const room = rooms.get(roomId)
  if (!room) return

  const client = room.clients.find((c) => c.ws === ws)
  if (!client) return

  const snake = room.snakes.find((s) => s.id === client.playerId)
  if (!snake || !snake.alive) return

  snake.setDirection(direction)
}

function handleDisconnect(ws) {
  handleLeaveRoom(ws)
}

// ─── 工具 ──────────────────────────────

function sendTo(ws, data) {
  try {
    ws.send(JSON.stringify(data))
  } catch {
    // ignore
  }
}

module.exports = { setupWebSocket }
