const CONFIG = require('./config')
const { DIR } = CONFIG

const OPPOSITE = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

/**
 * 蛇
 * 属性：id, body(头在[0]), direction, nextDirection, health, alive, growCount
 */
class Snake {
  constructor(id, body, dir) {
    this.id = id
    // body[0] = 蛇头
    this.body = body.map((p) => ({ ...p }))
    this.direction = dir
    this.nextDirection = dir
    this.health = CONFIG.INITIAL_HEALTH
    this.alive = true
    this.growCount = 0 // 累积待增长格数
  }

  /** 获取蛇头位置 */
  get head() {
    return this.body[0]
  }

  /** 蛇身长度 */
  get length() {
    return this.body.length
  }

  /** 缓冲方向输入（禁止 180° 掉头） */
  setDirection(dir) {
    if (OPPOSITE[dir] === this.direction) return
    this.nextDirection = dir
  }

  /** 将缓冲方向写入当前方向 */
  applyDirection() {
    this.direction = this.nextDirection
  }

  /** 计算下一帧蛇头位置 */
  nextHead() {
    const d = DIR[this.direction]
    return { x: this.head.x + d.x, y: this.head.y + d.y }
  }

  /** 前进一步 */
  move() {
    const nh = this.nextHead()
    this.body.unshift(nh)
    if (this.growCount > 0) {
      this.growCount--
    } else {
      this.body.pop()
    }
  }

  /** 增加长度 */
  grow(amount = 1) {
    this.growCount += amount
  }

  /** 恢复生命（上限 200） */
  heal(amount) {
    this.health = Math.min(200, this.health + amount)
  }

  /** 减少生命 */
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount)
    if (this.health <= 0) this.alive = false
  }

  /** 每 tick 自然消耗 */
  drainHealth() {
    this.health = Math.max(0, this.health - CONFIG.HP_DRAIN_PER_TICK)
    if (this.health <= 0) this.alive = false
  }

  /** 序列化（发客户端） */
  toSnapshot() {
    return {
      id: this.id,
      body: this.body.map((p) => ({ x: p.x, y: p.y })),
      direction: this.direction,
      health: this.health,
      alive: this.alive,
      length: this.length,
    }
  }
}

module.exports = Snake
