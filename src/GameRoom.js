import { DurableObject } from "cloudflare:workers";
import { CONFIG } from "./config.js";
import { Snake } from "./Snake.js";
import { Board } from "./Board.js";

/**
 * GameRoom Durable Object
 * 每个游戏房间一个 DO 实例
 */
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.roomId = null;
    this.status = "waiting";
    this.players = [];
    this.snakes = [];
    this.board = new Board();
    this.nextPlayerId = 1;
    this.tickCount = 0;
    this.winnerId = null;
    this.countdownRemaining = 0;
    this.countdownTimer = null;
  }

  /** 入口：fetch（处理 WebSocket 升级 + 游戏逻辑） */
  async fetch(request) {
    // 创建 WebSocket 对
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const url = new URL(request.url);
    const playerName = url.searchParams.get("name") || "匿名";

    // 从 URL 提取 roomId
    const path = url.pathname;
    this.roomId = path.startsWith("/snake/game/")
      ? path.slice("/snake/game/".length)
      : crypto.randomUUID().slice(0, 8);

    const playerId = this.nextPlayerId++;
    this.players.push({ ws: server, playerId, name: playerName, ready: false });

    // 通知新玩家
    this.sendTo(server, {
      type: "room_joined",
      room: this.getRoomInfo(),
    });

    // 广播给房间里其他人
    this.broadcast({
      type: "player_joined",
      players: this.getPlayerList(),
    });

    this.notifyLobby();

    // 监听消息
    server.addEventListener("message", (event) => {
      try {
        this.handleMessage(server, JSON.parse(event.data));
      } catch { /* ignore */ }
    });

    server.addEventListener("close", () => {
      this.handleDisconnect(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── 消息处理 ────────────────────────────

  handleMessage(ws, msg) {
    const client = this.players.find((p) => p.ws === ws);
    if (!client) return;

    switch (msg.type) {
      case "ready":
        client.ready = true;
        this.broadcast({ type: "player_joined", players: this.getPlayerList() });
        this.checkStart();
        break;

      case "input":
        if (this.status !== "playing") return;
        const snake = this.snakes.find((s) => s.id === client.playerId);
        if (!snake || !snake.alive) return;
        if (["UP", "DOWN", "LEFT", "RIGHT"].includes(msg.direction)) {
          snake.setDirection(msg.direction);
        }
        break;

      case "leave_room":
        this.removePlayer(ws);
        break;
    }
  }

  handleDisconnect(ws) {
    this.removePlayer(ws);
  }

  removePlayer(ws) {
    const idx = this.players.findIndex((p) => p.ws === ws);
    if (idx === -1) return;
    this.players.splice(idx, 1);

    if (this.players.length > 0) {
      this.broadcast({ type: "player_left", players: this.getPlayerList() });
    }

    if (this.status === "playing" || this.status === "countdown") {
      this.endGame(null);
    }

    this.notifyLobby();
  }

  // ─── 游戏流程 ────────────────────────────

  checkStart() {
    if (
      this.players.length >= CONFIG.MIN_PLAYERS &&
      this.players.every((p) => p.ready)
    ) {
      this.startCountdown();
    }
  }

  startCountdown() {
    this.status = "countdown";
    this.countdownRemaining = CONFIG.COUNTDOWN_SECONDS;
    this.broadcast({ type: "countdown", count: this.countdownRemaining });

    this.countdownTimer = setInterval(() => {
      this.countdownRemaining--;
      if (this.countdownRemaining <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.startGame();
        return;
      }
      this.broadcast({ type: "countdown", count: this.countdownRemaining });
    }, 1000);
  }

  startGame() {
    this.status = "playing";
    this.tickCount = 0;
    this.board = new Board();
    this.snakes = [];
    this.winnerId = null;

    const corners = [
      { x: 2, y: 2, dir: "RIGHT" },
      { x: 16, y: 16, dir: "LEFT" },
      { x: 2, y: 16, dir: "RIGHT" },
      { x: 16, y: 2, dir: "LEFT" },
    ];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const corner = corners[i];
      const body = [];
      const d = CONFIG.DIR[corner.dir];
      for (let j = 0; j < CONFIG.INITIAL_SNAKE_LENGTH; j++) {
        body.push({ x: corner.x - d.x * j, y: corner.y - d.y * j });
      }
      this.snakes.push(new Snake(p.playerId, body, corner.dir));
    }

    for (let i = 0; i < CONFIG.MIN_ITEMS_ON_MAP; i++) {
      this.board.maybeSpawnItems(this.snakes);
    }

    this.notifyLobby();
    this.broadcast({ type: "game_start", tickInterval: CONFIG.TICK_INTERVAL_MS });
    this.broadcastState();
    this.ctx.storage.setAlarm(Date.now() + CONFIG.TICK_INTERVAL_MS);
  }

  async alarm() {
    if (this.status !== "playing") return;
    this.tick();
    if (this.status === "playing") {
      this.ctx.storage.setAlarm(Date.now() + CONFIG.TICK_INTERVAL_MS);
    }
  }

  tick() {
    this.tickCount++;

    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      snake.applyDirection();
    }

    const nextPositions = new Map();
    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      const pos = snake.nextHead();
      const key = `${pos.x},${pos.y}`;
      if (!nextPositions.has(key)) nextPositions.set(key, []);
      nextPositions.get(key).push(snake);
    }

    for (const [, snakesAtPos] of nextPositions) {
      if (snakesAtPos.length <= 1) continue;
      const sorted = [...snakesAtPos].sort((a, b) => b.body.length - a.body.length);
      const longest = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        sorted[i].alive = false;
        if (sorted[i].body.length >= longest.body.length) {
          longest.alive = false;
        }
      }
    }

    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      const nh = snake.nextHead();
      if (!this.board.inBounds(nh.x, nh.y)) { snake.alive = false; continue; }

      let hit = false;
      for (const other of this.snakes) {
        if (!other.alive || other === snake) continue;
        for (let j = 0; j < other.body.length; j++) {
          if (other.body[j].x === nh.x && other.body[j].y === nh.y) { hit = true; break; }
        }
        if (hit) break;
      }

      if (!hit) {
        for (let j = 0; j < snake.body.length - 1; j++) {
          if (snake.growCount > 0 && j === snake.body.length - 1) continue;
          if (snake.body[j].x === nh.x && snake.body[j].y === nh.y) { hit = true; break; }
        }
      }

      if (hit) { snake.alive = false; continue; }

      snake.move();
      if (this.tickCount > CONFIG.GRACE_TICKS) snake.drainHealth();

      const item = this.board.checkItemCollision(nh);
      if (item) {
        if (item.type === CONFIG.ITEM_TYPE.SUPPLY) snake.heal(CONFIG.SUPPLY_HEAL);
        else snake.takeDamage(CONFIG.SPIDER_DAMAGE);
        snake.grow(1);
      }
    }

    const alive = this.snakes.filter((s) => s.alive);
    if (alive.length === 0) { this.endGame(null); return; }

    this.board.maybeSpawnItems(this.snakes);

    if (alive.length <= 1) {
      this.endGame(alive.length === 1 ? alive[0].id : null);
      return;
    }

    this.broadcastState();
  }

  endGame(winnerId) {
    this.status = "finished";
    this.winnerId = winnerId;
    clearInterval(this.countdownTimer);
    this.countdownTimer = null;

    const stats = this.snakes.map((s) => ({
      playerId: s.id,
      name: this.getPlayerName(s.id),
      alive: s.alive,
      length: s.body.length,
      health: s.health,
    }));

    this.broadcast({ type: "game_over", winnerId, winnerName: winnerId ? this.getPlayerName(winnerId) : null, stats, tickCount: this.tickCount });
    this.resetRoom();
  }

  resetRoom() {
    this.status = "waiting";
    this.snakes = [];
    this.board = new Board();
    this.tickCount = 0;
    this.winnerId = null;
    for (const p of this.players) p.ready = false;

    this.broadcast({ type: "player_joined", players: this.getPlayerList() });
    this.notifyLobby();
  }

  // ─── 工具 ──────────────────────────────

  getPlayerName(playerId) {
    const p = this.players.find((p) => p.playerId === playerId);
    return p ? p.name : `Player ${playerId}`;
  }

  getPlayerList() {
    return this.players.map((p) => ({ playerId: p.playerId, name: p.name, ready: p.ready }));
  }

  getRoomInfo() {
    return { roomId: this.roomId || "unknown", playerCount: this.players.length, maxPlayers: CONFIG.MAX_PLAYERS, status: this.status, players: this.getPlayerList() };
  }

  broadcastState() {
    this.broadcast({ type: "game_state", tick: this.tickCount, snakes: this.snakes.map((s) => s.toSnapshot()), items: this.board.itemsSnapshot() });
  }

  sendTo(ws, data) {
    try { ws.send(JSON.stringify(data)); } catch { /* ignore */ }
  }

  broadcast(data) {
    const msg = JSON.stringify(data);
    for (const p of this.players) {
      try { p.ws.send(msg); } catch { /* ignore */ }
    }
  }

  async notifyLobby() {
    try {
      const lobbyId = this.env.LOBBY.idFromName("global");
      const stub = this.env.LOBBY.get(lobbyId);
      if (this.roomId) {
        await stub.updateRoom(this.roomId, {
          status: this.status,
          playerCount: this.players.length,
          maxPlayers: CONFIG.MAX_PLAYERS,
          players: this.getPlayerList(),
        });
      }
    } catch { /* ignore */ }
  }
}
