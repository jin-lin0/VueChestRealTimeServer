// 贪吃蛇多人对战 - 游戏配置常量
const CONFIG = {
  // 棋盘
  BOARD_SIZE: 19,

  // Tick
  TICK_INTERVAL_MS: 300,

  // 生命值
  INITIAL_HEALTH: 100,
  HP_DRAIN_PER_TICK: 1,

  // 道具效果
  SUPPLY_HEAL: 30,
  SPIDER_DAMAGE: 20,

  // 道具刷新
  MIN_ITEMS_ON_MAP: 3,
  MAX_ITEMS_ON_MAP: 6,
  ITEM_SPAWN_INTERVAL_TICKS: 10, // 每 2 秒（10 tick）尝试刷一批

  // 蛇
  INITIAL_SNAKE_LENGTH: 3,
  /** 开局免伤 tick 数（不扣血） */
  GRACE_TICKS: 15,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,

  // 准备倒计时（秒）
  COUNTDOWN_SECONDS: 3,

  // 方向
  DIR: Object.freeze({
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
  }),

  // 道具类型
  ITEM_TYPE: Object.freeze({
    SUPPLY: 'supply',
    SPIDER: 'spider',
  }),
}

module.exports = CONFIG
