import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameRoom } from '../worker/gameRoom.js';

function fakeWs() {
  return {
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
    close() {}
  };
}

function createRoom() {
  const room = new GameRoom({ id: 'dm-123', acceptWebSocket() {} }, {});
  return room;
}

function join(room, ws, name = 'Player') {
  room.handleMessage(ws, JSON.stringify({ type: 'join', name }));
}

function findWelcome(ws) {
  return ws.sent.find(m => m.type === 'welcome');
}

describe('GameRoom multiplayer simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a join with welcome, player_joined, and a running state tick', () => {
    const room = createRoom();
    const ws = fakeWs();

    join(room, ws, 'Alice');

    const welcome = findWelcome(ws);
    expect(welcome.type).toBe('welcome');
    expect(welcome.roomId).toBe('dm-123');
    expect(typeof welcome.playerId).toBe('string');
    expect(welcome.players).toHaveLength(1);
    expect(welcome.players[0].name).toBe('Alice');

    expect(ws.sent.some(m => m.type === 'player_joined')).toBe(true);

    room.tick();
    const state = ws.sent.find(m => m.type === 'state');
    expect(state.tick).toBe(1);
    expect(state.players).toHaveLength(1);
    expect(state.players[0].score).toBe(0);
  });

  it('moves a player authoritatively on input and clamps to the arena', () => {
    const room = createRoom();
    const ws = fakeWs();
    join(room, ws, 'Bob');
    const playerId = findWelcome(ws).playerId;

    room.tick();
    const initial = ws.sent.filter(m => m.type === 'state').pop().players.find(p => p.id === playerId);

    room.handleMessage(ws, JSON.stringify({
      type: 'input',
      keys: { up: true, down: false, left: false, right: true }
    }));
    for (let i = 0; i < 10; i++) room.tick();

    const state = ws.sent.filter(m => m.type === 'state').pop();
    const me = state.players.find(p => p.id === playerId);
    expect(me.y).toBeLessThan(initial.y);
    expect(me.x).toBeGreaterThan(initial.x);
    expect(me.x).toBeLessThanOrEqual(1);
    expect(me.y).toBeGreaterThanOrEqual(0);
  });

  it('resolves bullet hits, scores the killer, and respawns the victim', () => {
    const room = createRoom();
    const shooterWs = fakeWs();
    const victimWs = fakeWs();
    join(room, shooterWs, 'Shooter');
    join(room, victimWs, 'Victim');

    const shooterId = findWelcome(shooterWs).playerId;
    const victimId = findWelcome(victimWs).playerId;

    const shooter = room.players.get(shooterId);
    const victim = room.players.get(victimId);
    // Aim the shooter straight at the victim.
    shooter.x = 0.1;
    shooter.y = 0.1;
    victim.x = 0.2;
    victim.y = 0.1;

    room.handleMessage(shooterWs, JSON.stringify({ type: 'shoot', dx: 1, dy: 0 }));
    for (let i = 0; i < 30; i++) room.tick();

    const kill = shooterWs.sent.find(m => m.type === 'kill');
    expect(kill).toBeDefined();
    expect(kill.killerId).toBe(shooterId);
    expect(kill.victimId).toBe(victimId);
    expect(room.players.get(shooterId).score).toBe(1);
  });

  it('rejects joins when the room is full', () => {
    const room = createRoom();
    const sockets = [];
    for (let i = 0; i < 8; i++) {
      const ws = fakeWs();
      sockets.push(ws);
      join(room, ws, `P${i}`);
    }
    const overflow = fakeWs();
    join(room, overflow, 'Overflow');

    expect(overflow.sent.some(m => m.type === 'error' && /full/i.test(m.message))).toBe(true);
  });

  it('broadcasts state to every player and removes leavers', () => {
    const room = createRoom();
    const a = fakeWs();
    const b = fakeWs();
    join(room, a, 'A');
    join(room, b, 'B');

    room.tick();
    const stateA = a.sent.filter(m => m.type === 'state').pop();
    expect(stateA.players).toHaveLength(2);

    room.webSocketClose(a);
    expect(room.players.size).toBe(1);
    expect(b.sent.some(m => m.type === 'player_left')).toBe(true);

    room.tick();
    const stateB = b.sent.filter(m => m.type === 'state').pop();
    expect(stateB.players).toHaveLength(1);
  });

  it('ignores malformed, oversized, and unknown messages', () => {
    const room = createRoom();
    const ws = fakeWs();
    join(room, ws, 'A');
    ws.sent = [];

    room.handleMessage(ws, 'not json');
    room.handleMessage(ws, JSON.stringify({ type: 'unknown' }));
    room.handleMessage(ws, 'x'.repeat(5000));
    room.handleMessage(ws, JSON.stringify({ type: 'input', keys: { up: true } }));

    expect(ws.sent).toHaveLength(0);
  });
});
