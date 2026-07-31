/**
 * GameRoom - authoritative online multiplayer server for COREZ games.
 *
 * One Durable Object per room. Clients connect via WebSocket at
 * /api/game/ws/<roomId>, join with a display name, and send input; the room
 * simulates movement and bullets on a normalized 0..1 arena at 20 Hz and
 * broadcasts the state to everyone. No cloudflare:workers imports so the
 * simulation is unit-testable in Node.
 */

const ARENA_MAX_PLAYERS = 8;
const TICK_MS = 50;
const PLAYER_SPEED = 0.22;
const PLAYER_RADIUS = 0.03;
const BULLET_SPEED = 0.65;
const BULLET_RADIUS = 0.012;
const MAX_BULLETS = 50;
const MAX_MESSAGE_BYTES = 4096;
const COLORS = ['#22d3ee', '#f472b6', '#4ade80', '#facc15', '#a78bfa', '#fb923c', '#f87171', '#34d399'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.players = new Map(); // playerId -> { id, ws, name, x, y, color, score, keys }
    this.bullets = [];
    this.tickCount = 0;
    this.tickTimer = null;
  }

  // ---- WebSocket lifecycle -------------------------------------------------

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    this.handleMessage(ws, message);
  }

  webSocketClose(ws) {
    const player = this.findPlayerByWs(ws);
    if (player) {
      this.players.delete(player.id);
      this.broadcast({ type: 'player_left', playerId: player.id, name: player.name });
    }
    this.stopTickIfIdle();
  }

  // ---- Message handling ----------------------------------------------------

  handleMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'join':
        this.handleJoin(ws, data);
        break;
      case 'input':
        this.handleInput(ws, data);
        break;
      case 'shoot':
        this.handleShoot(ws, data);
        break;
      default:
        break;
    }
  }

  handleJoin(ws, data) {
    if (this.players.size >= ARENA_MAX_PLAYERS) {
      this.send(ws, { type: 'error', message: 'Room is full.' });
      return;
    }
    const playerId = this.generateId();
    const spawn = this.randomSpawn();
    const player = {
      id: playerId,
      ws,
      name: String(data.name || 'Player').slice(0, 20),
      x: spawn.x,
      y: spawn.y,
      color: COLORS[this.players.size % COLORS.length],
      score: 0,
      keys: { up: false, down: false, left: false, right: false }
    };
    this.players.set(playerId, player);
    this.send(ws, {
      type: 'welcome',
      playerId,
      roomId: String(this.state.id),
      players: this.publicPlayers()
    });
    this.broadcast({ type: 'player_joined', player: this.publicPlayer(player) });
    this.startTick();
  }

  handleInput(ws, data) {
    const player = this.findPlayerByWs(ws);
    if (!player || !data.keys || typeof data.keys !== 'object') return;
    player.keys = {
      up: data.keys.up === true,
      down: data.keys.down === true,
      left: data.keys.left === true,
      right: data.keys.right === true
    };
  }

  handleShoot(ws, data) {
    const player = this.findPlayerByWs(ws);
    if (!player || this.bullets.length >= MAX_BULLETS) return;
    const dx = Number(data.dx);
    const dy = Number(data.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    this.bullets.push({
      x: player.x,
      y: player.y,
      dx: dx / length,
      dy: dy / length,
      ownerId: player.id
    });
  }

  // ---- Simulation ----------------------------------------------------------

  tick() {
    this.tickCount += 1;
    const step = TICK_MS / 1000;

    for (const player of this.players.values()) {
      const dx = (player.keys.right ? 1 : 0) - (player.keys.left ? 1 : 0);
      const dy = (player.keys.down ? 1 : 0) - (player.keys.up ? 1 : 0);
      if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy);
        player.x = clamp(player.x + (dx / length) * PLAYER_SPEED * step, PLAYER_RADIUS, 1 - PLAYER_RADIUS);
        player.y = clamp(player.y + (dy / length) * PLAYER_SPEED * step, PLAYER_RADIUS, 1 - PLAYER_RADIUS);
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.x += bullet.dx * BULLET_SPEED * step;
      bullet.y += bullet.dy * BULLET_SPEED * step;
      let dead = bullet.x < 0 || bullet.x > 1 || bullet.y < 0 || bullet.y > 1;
      if (!dead) {
        for (const player of this.players.values()) {
          if (player.id === bullet.ownerId) continue;
          if (Math.hypot(player.x - bullet.x, player.y - bullet.y) < PLAYER_RADIUS + BULLET_RADIUS) {
            const killer = this.players.get(bullet.ownerId);
            if (killer) killer.score += 1;
            this.broadcast({
              type: 'kill',
              killerId: bullet.ownerId,
              victimId: player.id,
              killerName: killer ? killer.name : '',
              victimName: player.name
            });
            const spawn = this.randomSpawn();
            player.x = spawn.x;
            player.y = spawn.y;
            dead = true;
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }

    this.broadcast({
      type: 'state',
      tick: this.tickCount,
      players: this.publicPlayers(),
      bullets: this.publicBullets()
    });
  }

  // ---- Helpers -------------------------------------------------------------

  startTick() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  stopTickIfIdle() {
    if (this.players.size === 0 && this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  findPlayerByWs(ws) {
    for (const player of this.players.values()) {
      if (player.ws === ws) return player;
    }
    return null;
  }

  publicPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      x: Math.round(player.x * 1000) / 1000,
      y: Math.round(player.y * 1000) / 1000,
      color: player.color,
      score: player.score
    };
  }

  publicPlayers() {
    return [...this.players.values()].map(player => this.publicPlayer(player));
  }

  publicBullets() {
    return this.bullets.map(bullet => ({
      x: Math.round(bullet.x * 1000) / 1000,
      y: Math.round(bullet.y * 1000) / 1000,
      ownerId: bullet.ownerId
    }));
  }

  randomSpawn() {
    return {
      x: 0.12 + Math.random() * 0.76,
      y: 0.12 + Math.random() * 0.76
    };
  }

  generateId() {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  send(ws, payload) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Socket is gone; cleanup happens on webSocketClose.
    }
  }

  broadcast(payload) {
    for (const player of this.players.values()) {
      this.send(player.ws, payload);
    }
  }
}
