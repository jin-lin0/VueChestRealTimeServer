const CONFIG = require('./config')
const { DIR, ITEM_TYPE } = CONFIG

/**
 * 棋盘（19×19）
 * 管理道具生成、蛇的位置映射、碰撞检测
 */
class Board {
  constructor() {
    this.size = CONFIG.BOARD_SIZE
    /** @type {{ type: string, pos: { x: number, y: number } }[]} */
    this.items = []
    this.tickCount = 0
  }

  /** 坐标是否在棋盘内 */
  inBounds(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size
  }

  /** 获取随机空位 */
  randomEmptyTile(snakes) {
    // 收集所有被占据的格子
    const occupied = new Set()
    for (const snake of snakes) {
      if (!snake.alive) continue
      for (const p of snake.body) {
        occupied.add(`${p.x},${p.y}`)
      }
    }
    for (const item of this.items) {
      occupied.add(`${item.pos.x},${item.pos.y}`)
    }

    // 找空位
    const empty = []
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (!occupied.has(`${x},${y}`)) {
          empty.push({ x, y })
        }
      }
    }

    if (empty.length === 0) return null
    return empty[Math.floor(Math.random() * empty.length)]
  }

  /** 尝试刷新道具 */
  maybeSpawnItems(snakes) {
    this.tickCount++

    // 每隔 ITEM_SPAWN_INTERVAL_TICKS tick 尝试一次
    if (this.tickCount % CONFIG.ITEM_SPAWN_INTERVAL_TICKS !== 0) return

    // 目标数量范围
    let target = CONFIG.MIN_ITEMS_ON_MAP
    if (Math.random() < 0.4) target = CONFIG.MAX_ITEMS_ON_MAP

    while (this.items.length < target) {
      const pos = this.randomEmptyTile(snakes)
      if (!pos) break

      // 随机类型（55% 补给，45% 毒蜘蛛）
      const type = Math.random() < 0.55 ? ITEM_TYPE.SUPPLY : ITEM_TYPE.SPIDER
      this.items.push({ type, pos })
    }
  }

  /** 检测蛇头是否踩到道具，返回命中的道具 */
  checkItemCollision(head) {
    const idx = this.items.findIndex(
      (item) => item.pos.x === head.x && item.pos.y === head.y
    )
    if (idx === -1) return null
    const item = this.items[idx]
    this.items.splice(idx, 1)
    return item
  }

  /** 序列化道具 */
  itemsSnapshot() {
    return this.items.map((item) => ({
      type: item.type,
      x: item.pos.x,
      y: item.pos.y,
    }))
  }
}

module.exports = Board
