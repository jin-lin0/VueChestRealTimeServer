// 贪吃蛇多人对战 - 游戏配置常量
export const CONFIG = {
  BOARD_SIZE: 19,
  TICK_INTERVAL_MS: 300,
  INITIAL_HEALTH: 100,
  HP_DRAIN_PER_TICK: 1,
  SUPPLY_HEAL: 30,
  SPIDER_DAMAGE: 20,
  MIN_ITEMS_ON_MAP: 3,
  MAX_ITEMS_ON_MAP: 6,
  ITEM_SPAWN_INTERVAL_TICKS: 10,
  INITIAL_SNAKE_LENGTH: 3,
  GRACE_TICKS: 15,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  COUNTDOWN_SECONDS: 3,
  DIR: Object.freeze({
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
  }),
  ITEM_TYPE: Object.freeze({
    SUPPLY: 'supply',
    SPIDER: 'spider',
  }),
}
