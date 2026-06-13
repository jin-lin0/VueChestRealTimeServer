import { CONFIG } from './config.js'
const { DIR } = CONFIG

const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' }

export class Snake {
  constructor(id, body, dir) {
    this.id = id
    this.body = body.map((p) => ({ ...p }))
    this.direction = dir
    this.nextDirection = dir
    this.health = CONFIG.INITIAL_HEALTH
    this.alive = true
    this.growCount = 0
  }

  get head() { return this.body[0] }
  get length() { return this.body.length }

  setDirection(dir) {
    if (OPPOSITE[dir] === this.direction) return
    this.nextDirection = dir
  }

  applyDirection() { this.direction = this.nextDirection }

  nextHead() {
    const d = DIR[this.direction]
    return { x: this.head.x + d.x, y: this.head.y + d.y }
  }

  move() {
    const nh = this.nextHead()
    this.body.unshift(nh)
    if (this.growCount > 0) {
      this.growCount--
    } else {
      this.body.pop()
    }
  }

  grow(amount = 1) { this.growCount += amount }
  heal(amount) { this.health = Math.min(200, this.health + amount) }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount)
    if (this.health <= 0) this.alive = false
  }

  drainHealth() {
    this.health = Math.max(0, this.health - CONFIG.HP_DRAIN_PER_TICK)
    if (this.health <= 0) this.alive = false
  }

  toSnapshot() {
    return {
      id: this.id,
      body: this.body.map((p) => ({ x: p.x, y: p.y })),
      direction: this.direction,
      health: this.health,
      alive: this.alive,
      length: this.body.length,
    }
  }
}
