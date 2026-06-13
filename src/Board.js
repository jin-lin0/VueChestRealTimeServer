import { CONFIG } from './config.js'
const { ITEM_TYPE } = CONFIG

export class Board {
  constructor() {
    this.size = CONFIG.BOARD_SIZE
    this.items = []
    this.tickCount = 0
  }

  inBounds(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size
  }

  randomEmptyTile(snakes) {
    const occupied = new Set()
    for (const snake of snakes) {
      if (!snake.alive) continue
      for (const p of snake.body) occupied.add(`${p.x},${p.y}`)
    }
    for (const item of this.items) occupied.add(`${item.pos.x},${item.pos.y}`)

    const empty = []
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (!occupied.has(`${x},${y}`)) empty.push({ x, y })
      }
    }
    if (empty.length === 0) return null
    return empty[Math.floor(Math.random() * empty.length)]
  }

  maybeSpawnItems(snakes) {
    this.tickCount++
    if (this.tickCount % CONFIG.ITEM_SPAWN_INTERVAL_TICKS !== 0) return

    let target = CONFIG.MIN_ITEMS_ON_MAP
    if (Math.random() < 0.4) target = CONFIG.MAX_ITEMS_ON_MAP

    while (this.items.length < target) {
      const pos = this.randomEmptyTile(snakes)
      if (!pos) break
      const type = Math.random() < 0.55 ? ITEM_TYPE.SUPPLY : ITEM_TYPE.SPIDER
      this.items.push({ type, pos })
    }
  }

  checkItemCollision(head) {
    const idx = this.items.findIndex(
      (item) => item.pos.x === head.x && item.pos.y === head.y
    )
    if (idx === -1) return null
    const item = this.items[idx]
    this.items.splice(idx, 1)
    return item
  }

  itemsSnapshot() {
    return this.items.map((item) => ({
      type: item.type,
      x: item.pos.x,
      y: item.pos.y,
    }))
  }
}
