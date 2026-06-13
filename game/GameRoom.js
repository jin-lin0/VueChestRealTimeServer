const CONFIG = require('./config')
const Snake = require('./Snake')
const Board = require('./Board')
const { DIR, ITEM_TYPE } = CONFIG

/**
 * 游戏房间
 * 管理玩家加入/离开、游戏 tick 循环、碰撞检测、状态广播
 */
class GameRoom {
  constructor(id) {
    this.id = id
    /** @type {{ ws: WebSocket, playerId: number, name: string, ready: boolean }[]} */
    this.clients = []
    /** @type {Snake[]} */
    this.snakes = []
    this.board = new Board()
    this.status = 'waiting' // waiting | countdown | playing | finished
    this.timer = null
    this.countdownTimer = null
    this.nextPlayerId = 1
    this.tickCount = 0
    this.winnerId = null
  }

  // ─── 玩家管理 ──────────────────────────────────

  addClient(ws, name) {
    if (this.clients.length >= CONFIG.MAX_PLAYERS) return null
    if (this.status !== 'waiting') return null

    const playerId = this.nextPlayerId++
    this.clients.push({ ws, playerId, name, ready: false })
    return playerId
  }

  removeClient(ws) {
    const idx = this.clients.findIndex((c) => c.ws === ws)
    if (idx === -1) return
    this.clients.splice(idx, 1)

    if (this.status === 'playing' || this.status === 'countdown') {
      this.stopGame()
    }
  }

  /** 玩家准备 */
  setReady(ws) {
    const client = this.clients.find((c) => c.ws === ws)
    if (!client) return
    client.ready = true

    // 检查是否所有人都准备好了
    if (
      this.clients.length >= CONFIG.MIN_PLAYERS &&
      this.clients.every((c) => c.ready)
    ) {
      this.startCountdown()
    }
  }

  /** 获取玩家名 */
  getPlayerName(playerId) {
    const c = this.clients.find((c) => c.playerId === playerId)
    return c ? c.name : `Player ${playerId}`
  }

  // ─── 游戏流程 ──────────────────────────────────

  startCountdown() {
    this.status = 'countdown'
    let count = CONFIG.COUNTDOWN_SECONDS
    this.broadcast({ type: 'countdown', count })

    this.countdownTimer = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(this.countdownTimer)
        this.countdownTimer = null
        this.startGame()
        return
      }
      this.broadcast({ type: 'countdown', count })
    }, 1000)
  }

  startGame() {
    this.status = 'playing'
    this.tickCount = 0
    this.board = new Board()
    this.snakes = []
    this.winnerId = null

    // 初始化蛇（从四角出发，身体向棋盘内延伸）
    const corners = [
      { x: 2, y: 2, dir: 'RIGHT' },          // 左上 → 右
      { x: 16, y: 16, dir: 'LEFT' },          // 右下 → 左
      { x: 2, y: 16, dir: 'RIGHT' },          // 左下 → 右
      { x: 16, y: 2, dir: 'LEFT' },           // 右上 → 左
    ]

    for (let i = 0; i < this.clients.length; i++) {
      const c = this.clients[i]
      const corner = corners[i]
      const body = []
      // 蛇身朝反方向排列（头在 corner，身往后延伸，确保不越界）
      const d = DIR[corner.dir]
      for (let j = 0; j < CONFIG.INITIAL_SNAKE_LENGTH; j++) {
        body.push({
          x: corner.x - d.x * j,
          y: corner.y - d.y * j,
        })
      }
      this.snakes.push(new Snake(c.playerId, body, corner.dir))
    }

    // 预刷一些道具
    for (let i = 0; i < CONFIG.MIN_ITEMS_ON_MAP; i++) {
      this.board.maybeSpawnItems(this.snakes)
    }

    this.broadcast({ type: 'game_start', tickInterval: CONFIG.TICK_INTERVAL_MS })
    this.broadcastState()

    this.timer = setInterval(() => this.tick(), CONFIG.TICK_INTERVAL_MS)
  }

  stopGame(reason = 'disconnected') {
    this.status = 'finished'
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
    this.broadcast({ type: 'game_stopped', reason })
  }

  // ─── 游戏核心逻辑 ──────────────────────────────

  tick() {
    this.tickCount++

    // 0. 输入缓冲生效
    for (const snake of this.snakes) {
      if (!snake.alive) continue
      snake.applyDirection()
    }

    // 1. 收集所有蛇的下一帧位置
    const nextPositions = new Map() // "x,y" -> snake[]
    for (const snake of this.snakes) {
      if (!snake.alive) continue
      const pos = snake.nextHead()
      const key = `${pos.x},${pos.y}`
      if (!nextPositions.has(key)) nextPositions.set(key, [])
      nextPositions.get(key).push(snake)
    }

    // 2. 碰撞检测
    for (const [key, snakesAtPos] of nextPositions) {
      if (snakesAtPos.length <= 1) continue

      // 头碰头：多蛇同一目标格
      // 按长度排序，最长的活
      const sorted = [...snakesAtPos].sort((a, b) => b.length - a.length)
      const longest = sorted[0]
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].length < longest.length) {
          sorted[i].alive = false
        } else {
          // 同归于尽
          sorted[i].alive = false
          longest.alive = false
        }
      }
    }

    // 3. 移动蛇（仅活着的）
    for (const snake of this.snakes) {
      if (!snake.alive) continue

      const nh = snake.nextHead()

      // 出界检测
      if (!this.board.inBounds(nh.x, nh.y)) {
        snake.alive = false
        continue
      }

      // 头碰身子（不包括自己的蛇头位置）
      let hitBody = false
      for (const other of this.snakes) {
        if (!other.alive || other === snake) continue
        for (let j = 0; j < other.body.length; j++) {
          if (other.body[j].x === nh.x && other.body[j].y === nh.y) {
            hitBody = true
            break
          }
        }
        if (hitBody) break
      }

      // 头碰自己的身子（从索引 1 开始，因为索引 0 是蛇头即将移动的位置，但移动后原蛇头会变身子）
      if (!hitBody) {
        for (let j = 0; j < snake.body.length - 1; j++) {
          // 排除蛇尾（因为蛇尾即将被移除）
          if (snake.growCount > 0 && j === snake.body.length - 1) continue
          if (snake.body[j].x === nh.x && snake.body[j].y === nh.y) {
            hitBody = true
            break
          }
        }
      }

      if (hitBody) {
        snake.alive = false
        continue
      }

      // 通过所有检测，执行移动
      snake.move()

      // 自然消耗（开局免伤期内不扣血）
      if (this.tickCount > CONFIG.GRACE_TICKS) {
        snake.drainHealth()
      }

      // 道具碰撞
      const item = this.board.checkItemCollision(nh)
      if (item) {
        if (item.type === ITEM_TYPE.SUPPLY) {
          snake.heal(CONFIG.SUPPLY_HEAL)
        } else {
          snake.takeDamage(CONFIG.SPIDER_DAMAGE)
        }
        snake.grow(1)
      }
    }

    // 4. 清理死亡的蛇（body 清空）
    const hasFood = this.snakes.some(s => s.alive)
    if (!hasFood) {
      // 都死了 → 平局
      this.endGame(null)
      return
    }

    // 5. 道具刷新
    this.board.maybeSpawnItems(this.snakes)

    // 6. 检查胜负
    const alive = this.snakes.filter((s) => s.alive)
    if (alive.length <= 1) {
      this.endGame(alive.length === 1 ? alive[0].id : null)
      return
    }

    // 7. 广播状态
    this.broadcastState()
  }

  endGame(winnerId) {
    this.status = 'finished'
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }

    this.winnerId = winnerId
    const stats = this.snakes.map((s) => ({
      playerId: s.id,
      name: this.getPlayerName(s.id),
      alive: s.alive,
      length: s.length,
      health: s.health,
    }))

    this.broadcast({
      type: 'game_over',
      winnerId,
      winnerName: winnerId ? this.getPlayerName(winnerId) : null,
      stats,
      tickCount: this.tickCount,
    })

    // 重置房间
    this.resetRoom()

    // 广播房间重置后的玩家状态（所有玩家未准备）
    this.broadcast({
      type: 'player_joined',
      players: this.clients.map((c) => ({
        playerId: c.playerId,
        name: c.name,
        ready: c.ready,
      })),
    })
  }

  resetRoom() {
    this.status = 'waiting'
    this.snakes = []
    this.board = new Board()
    this.tickCount = 0
    this.winnerId = null
    // 重置所有玩家为未准备状态
    for (const c of this.clients) {
      c.ready = false
    }
  }

  // ─── 消息广播 ──────────────────────────────────

  broadcast(data) {
    const msg = JSON.stringify(data)
    for (const c of this.clients) {
      try {
        c.ws.send(msg)
      } catch {
        // 忽略断开连接的 client
      }
    }
  }

  /** 向单个客户端发送 */
  sendTo(ws, data) {
    try {
      ws.send(JSON.stringify(data))
    } catch {
      // ignore
    }
  }

  /** 广播游戏状态快照 */
  broadcastState() {
    this.broadcast({
      type: 'game_state',
      tick: this.tickCount,
      snakes: this.snakes.map((s) => s.toSnapshot()),
      items: this.board.itemsSnapshot(),
    })
  }

  /** 获取房间信息（给客户端的列表用） */
  getInfo() {
    return {
      roomId: this.id,
      playerCount: this.clients.length,
      maxPlayers: CONFIG.MAX_PLAYERS,
      status: this.status,
      players: this.clients.map((c) => ({
        playerId: c.playerId,
        name: c.name,
        ready: c.ready,
      })),
    }
  }
}

module.exports = GameRoom
