import assert from 'node:assert/strict';
import AuthoritativeBattleRoom from '../match-simulator/src/AuthoritativeBattleRoom';
import MatchRoomService from '../services/matchmaking/src/MatchRoomService';
import MatchResultService from '../services/matches/src/MatchResultService';
import MemoryStorage from '../storage/MemoryStorage';
import { getAuthoritativeCombatProfile, validateAuthoritativeCombatProfiles } from '../match-simulator/src/CombatProfile';

await testMatchRoomLifecycle();
await testAuthoritativeBattleValidation();
await testAuthoritativeDuckxelCombatFlow();
await testIdempotentProgression();
await testLocalClanAndFriendlyFlow();
testDuckxelCombatProfiles();
console.log('[multiplayer-smoke] all checks passed');

async function testMatchRoomLifecycle() {
    const rooms = new MatchRoomService();
    const created = rooms.createRoom({
        queueType: 'custom_1v1',
        region: 'ap-northeast',
        maxPlayers: 2,
        ownerPlayerId: 'player-a',
    }, 1_000);
    assert.equal(created.state, 'queued');
    const running = rooms.joinRoom({ roomId: created.roomId, playerId: 'player-b' }, 1_100);
    assert.equal(running.state, 'running');
    assert.deepEqual(running.playerIds, ['player-a', 'player-b']);
}

function testDuckxelCombatProfiles() {
    const unitKeys = [
        'duckxel_sword_man',
        'duckxel_barbarian',
        'spear_goblin',
        'skeleton_swordsman',
        'royal_giant',
        'hog_rider',
        'duckxel_muradin',
    ];
    assert.deepEqual(validateAuthoritativeCombatProfiles(unitKeys), []);
    assert.equal(getAuthoritativeCombatProfile('spear_goblin')?.spawnCount, 3);
    assert.equal(getAuthoritativeCombatProfile('royal_giant')?.targetPolicy, 'building-only');
    assert.equal(getAuthoritativeCombatProfile('hog_rider')?.movementRoute, 'river-jump');
    assert.equal(getAuthoritativeCombatProfile('duckxel_muradin')?.activeSkill, 'earthbreaker');
}

async function testAuthoritativeDuckxelCombatFlow() {
    const skillRoom = new AuthoritativeBattleRoom('room-active-skill-flow');
    skillRoom.join({ playerId: 'blue-skill', team: 'blue', deck: ['duckxel_muradin'] });
    skillRoom.join({ playerId: 'red-target', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(skillRoom.enqueue({
        type: 'spawn', playerId: 'blue-skill', seq: 1, unitKey: 'duckxel_muradin', x: 86, y: 360, handIndex: 0,
    }).accepted, true);
    assert.equal(skillRoom.enqueue({
        type: 'spawn', playerId: 'red-target', seq: 1, unitKey: 'duckxel_sword_man', x: 86, y: 300, handIndex: 0,
    }).accepted, true);
    for (let index = 0; index < 16; index += 1) skillRoom.step();
    const skillUnit = skillRoom.snapshot().units.find(unit => unit.ownerId === 'blue-skill');
    const targetBefore = skillRoom.snapshot().units.find(unit => unit.ownerId === 'red-target');
    assert(skillUnit && targetBefore);
    assert.deepEqual(skillRoom.enqueue({
        type: 'cast_active_skill', playerId: 'red-target', seq: 2, unitId: skillUnit.id, skillKey: 'earthbreaker',
    }), { accepted: false, reason: 'unit_not_owned' });
    assert.equal(skillRoom.enqueue({
        type: 'cast_active_skill', playerId: 'blue-skill', seq: 2, unitId: skillUnit.id, skillKey: 'earthbreaker',
    }).accepted, true);
    const castSnapshot = skillRoom.snapshot().units.find(unit => unit.id === skillUnit.id);
    assert.equal(castSnapshot?.activeSkillPhase, 'casting');
    assert.equal(castSnapshot?.activeSkillCastSerial, 1);
    assert.equal(skillRoom.enqueue({
        type: 'cast_active_skill', playerId: 'blue-skill', seq: 3, unitId: skillUnit.id, skillKey: 'earthbreaker',
    }).accepted, false);
    let sawSkillElevation = false;
    let sawForwardTravel = false;
    let targetAfter = skillRoom.snapshot().units.find(unit => unit.ownerId === 'red-target');
    for (let index = 0; index < 40 && targetAfter && targetAfter.hp >= targetBefore.hp; index += 1) {
        const snapshot = skillRoom.step();
        const caster = snapshot.units.find(unit => unit.id === skillUnit.id);
        sawSkillElevation ||= Boolean(caster && caster.elevation > 0);
        sawForwardTravel ||= Boolean(caster && Math.hypot(caster.x - skillUnit.x, caster.y - skillUnit.y) > 12);
        targetAfter = snapshot.units.find(unit => unit.ownerId === 'red-target');
    }
    assert.equal(sawSkillElevation, true, 'earthbreaker must expose an authoritative airborne arc');
    assert.equal(sawForwardTravel, true, 'earthbreaker must move the caster toward its landing point');
    assert(targetAfter && targetAfter.hp < targetBefore.hp, 'earthbreaker must apply its first authoritative area hit');
    const hpAfterFirstWave = targetAfter.hp;
    for (let index = 0; index < 35 && targetAfter && targetAfter.hp >= hpAfterFirstWave; index += 1) {
        const snapshot = skillRoom.step();
        targetAfter = snapshot.units.find(unit => unit.ownerId === 'red-target');
    }
    assert(targetAfter && targetAfter.hp < hpAfterFirstWave, 'earthbreaker must apply its delayed second authoritative area hit');

    const rangedRoom = new AuthoritativeBattleRoom('room-ranged-flow');
    rangedRoom.join({ playerId: 'blue-ranged', team: 'blue', deck: ['spear_goblin'] });
    rangedRoom.join({ playerId: 'red-melee', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(rangedRoom.enqueue({
        type: 'spawn', playerId: 'blue-ranged', seq: 1, unitKey: 'spear_goblin', x: 86, y: 360, handIndex: 0,
    }).accepted, true);
    assert.equal(rangedRoom.enqueue({
        type: 'spawn', playerId: 'red-melee', seq: 1, unitKey: 'duckxel_sword_man', x: 86, y: 300, handIndex: 0,
    }).accepted, true);
    const firstTick = rangedRoom.step();
    assert(firstTick.units.every((unit) => unit.state === 'spawning'));
    for (let index = 0; index < 14; index += 1) rangedRoom.step();
    assert(rangedRoom.snapshot().units.every((unit) => unit.hp === unit.maxHp), 'deploy delay must prevent immediate damage');

    let sawProjectile = false;
    let redWasDamaged = false;
    for (let index = 0; index < 180; index += 1) {
        const snapshot = rangedRoom.step();
        sawProjectile ||= snapshot.projectiles.some((projectile) => projectile.projectileKey.includes('spear'));
        redWasDamaged ||= snapshot.units.some((unit) => unit.ownerId === 'red-melee' && unit.hp < unit.maxHp);
    }
    assert.equal(sawProjectile, true, 'spear goblin should create a server projectile');
    assert.equal(redWasDamaged, true, 'projectile impact should apply authoritative damage');

    const buildingRoom = new AuthoritativeBattleRoom('room-building-flow');
    buildingRoom.join({ playerId: 'blue-giant', team: 'blue', deck: ['royal_giant'] });
    buildingRoom.join({ playerId: 'red-unit', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(buildingRoom.enqueue({
        type: 'spawn', playerId: 'blue-giant', seq: 1, unitKey: 'royal_giant', x: 86, y: 360, handIndex: 0,
    }).accepted, false, 'royal giant costs more than starting elixir');
    for (let index = 0; index < 90; index += 1) buildingRoom.step();
    assert.equal(buildingRoom.enqueue({
        type: 'spawn', playerId: 'blue-giant', seq: 2, unitKey: 'royal_giant', x: 86, y: 360, handIndex: 0,
    }).accepted, true);
    assert.equal(buildingRoom.enqueue({
        type: 'spawn', playerId: 'red-unit', seq: 1, unitKey: 'duckxel_sword_man', x: 86, y: 300, handIndex: 0,
    }).accepted, true);
    let giantTarget = '';
    for (let index = 0; index < 30; index += 1) {
        const snapshot = buildingRoom.step();
        giantTarget = snapshot.units.find((unit) => unit.unitKey === 'royal_giant')?.targetId ?? giantTarget;
    }
    assert.equal(giantTarget, 'red:princess:left', 'building-only units must ignore nearby enemy units');

    const jumpRoom = new AuthoritativeBattleRoom('room-jump-flow');
    jumpRoom.join({ playerId: 'blue-hog', team: 'blue', deck: ['hog_rider'] });
    jumpRoom.join({ playerId: 'red-hog-target', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(jumpRoom.enqueue({
        type: 'spawn', playerId: 'blue-hog', seq: 1, unitKey: 'hog_rider', x: 180, y: 360, handIndex: 0,
    }).accepted, true);
    let sawJump = false;
    let crossedOutsideBridge = false;
    for (let index = 0; index < 100; index += 1) {
        const snapshot = jumpRoom.step();
        const hog = snapshot.units.find((unit) => unit.unitKey === 'hog_rider');
        if (!hog) continue;
        sawJump ||= hog.state === 'jumping' && hog.elevation > 0;
        crossedOutsideBridge ||= hog.y < 288 && Math.abs(hog.x - 86) > 34 && Math.abs(hog.x - 266) > 34;
    }
    assert.equal(sawJump, true, 'hog rider should enter a server-authoritative jump state');
    assert.equal(crossedOutsideBridge, true, 'hog rider should cross the river outside a bridge');

    const collisionRoom = new AuthoritativeBattleRoom('room-collision-flow');
    collisionRoom.join({ playerId: 'blue-swarm', team: 'blue', deck: ['skeleton_swordsman'] });
    collisionRoom.join({ playerId: 'red-idle', team: 'red', deck: ['royal_giant'] });
    assert.equal(collisionRoom.enqueue({
        type: 'spawn', playerId: 'blue-swarm', seq: 1, unitKey: 'skeleton_swordsman', x: 180, y: 520, handIndex: 0,
    }).accepted, true);
    assert.equal(collisionRoom.enqueue({
        type: 'spawn', playerId: 'blue-swarm', seq: 2, unitKey: 'skeleton_swordsman', x: 180, y: 520, handIndex: 0,
    }).accepted, true);
    for (let index = 0; index < 24; index += 1) collisionRoom.step();
    const swarm = collisionRoom.snapshot().units.filter((unit) => unit.ownerId === 'blue-swarm');
    const uniquePositions = new Set(swarm.map((unit) => `${unit.x.toFixed(2)}:${unit.y.toFixed(2)}`));
    assert.equal(swarm.length, 26);
    assert(uniquePositions.size > 20, 'collision solver must separate overlapping swarm members');
    assert(swarm.every((unit) => !(unit.y >= 288 && unit.y <= 352)), 'ground collision must not push units into the river');
}

async function testAuthoritativeBattleValidation() {
    const room = new AuthoritativeBattleRoom('room-smoke');
    room.join({ playerId: 'player-a', team: 'blue', deck: ['duckxel_sword_man'] });
    const started = room.join({ playerId: 'player-b', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(started.state, 'running');

    const accepted = room.enqueue({
        type: 'spawn',
        playerId: 'player-a',
        seq: 1,
        unitKey: 'duckxel_sword_man',
        x: 180,
        y: 500,
        handIndex: 0,
    });
    assert.equal(accepted.accepted, true);
    assert.equal(room.enqueue({
        type: 'spawn',
        playerId: 'player-a',
        seq: 1,
        unitKey: 'duckxel_sword_man',
        x: 180,
        y: 500,
        handIndex: 0,
    }).accepted, false);
    const snapshot = room.step();
    assert.equal(snapshot.units.length, 1);
    assert(snapshot.blueElixir < 5);
    assert.equal(snapshot.towers.length, 6);
    assert.deepEqual(snapshot.players.find((player) => player.playerId === 'player-a')?.hand, ['duckxel_sword_man']);

    const invalidPosition = room.enqueue({
        type: 'spawn',
        playerId: 'player-b',
        seq: 1,
        unitKey: 'duckxel_sword_man',
        x: 180,
        y: 500,
        handIndex: 0,
    });
    assert.deepEqual(invalidPosition, { accepted: false, reason: 'invalid_spawn_position' });

    room.disconnect('player-b');
    const rejoined = room.join({ playerId: 'player-b', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(rejoined.players.find((player) => player.playerId === 'player-b')?.connected, true);

    const forfeitRoom = new AuthoritativeBattleRoom('room-forfeit');
    forfeitRoom.join({ playerId: 'player-a', team: 'blue', deck: ['duckxel_sword_man'] });
    forfeitRoom.join({ playerId: 'player-b', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(forfeitRoom.enqueue({ type: 'forfeit', playerId: 'player-b', seq: 1 }).accepted, true);
    const forfeited = forfeitRoom.snapshot();
    assert.equal(forfeited.state, 'finished');
    assert.equal(forfeited.winner, 'blue');
}

async function testIdempotentProgression() {
    const storage = new MemoryStorage();
    const service = new MatchResultService({ storage });
    const request = {
        matchId: 'm_smoke_match_001',
        queueType: 'custom_1v1' as const,
        startedAtUtc: '2026-07-16T00:00:00.000Z',
        endedAtUtc: '2026-07-16T00:03:00.000Z',
        winnerTeamId: 'blue' as const,
        teams: [
            { teamId: 'blue' as const, playerIds: ['player-a'], crowns: 2, kingTowerHp: 1200 },
            { teamId: 'red' as const, playerIds: ['player-b'], crowns: 1, kingTowerHp: 0 },
        ],
        initialStateHash: 'initial-state',
        rngSeed: 7,
        inputCount: 12,
        eventsDigestSha256: 'a'.repeat(64),
        replayKey: 'replays/smoke.json',
        serverBuild: 'test',
    };
    await service.submitResult(request, Date.parse(request.endedAtUtc));
    await service.submitResult(request, Date.parse(request.endedAtUtc) + 1);

    const winner = await storage.getPlayerProgression('player-a');
    const loser = await storage.getPlayerProgression('player-b');
    assert.equal(winner?.wins, 1);
    assert.equal(winner?.trophies, 30);
    assert.equal(loser?.losses, 1);
    assert.equal(loser?.trophies, 0);
}

async function testLocalClanAndFriendlyFlow() {
    const values = new Map<string, string>();
    const localStorage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() { return values.size; },
    };
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            localStorage,
            addEventListener: () => undefined,
        },
    });
    Object.defineProperty(globalThis, 'BroadcastChannel', {
        configurable: true,
        value: undefined,
    });

    const local = await import('../../src/app/localMultiplayer');
    const profileA = {
        id: '11111111-1111-4111-8111-111111111111',
        name: '테스터A',
        level: 1,
        trophies: 0,
        gold: 0,
        gems: 0,
        wins: 0,
        losses: 0,
        avatarUnit: 'stone_cold',
        selectedDeck: ['duckxel_sword_man'],
    };
    const profileB = { ...profileA, id: '22222222-2222-4222-8222-222222222222', name: '테스터B' };
    const profileC = { ...profileA, id: '33333333-3333-4333-8333-333333333333', name: '테스터C' };
    const profileD = { ...profileA, id: '44444444-4444-4444-8444-444444444444', name: '테스터D' };
    assert.equal(local.upsertLocalProfile(profileA).ok, true);
    assert.equal(local.upsertLocalProfile(profileB).ok, true);
    assert.equal(local.upsertLocalProfile(profileC).ok, true);
    assert.equal(local.upsertLocalProfile(profileD).ok, true);
    const clanResult = local.createLocalClan(profileA, '테스트 클랜');
    assert.equal(clanResult.ok, true);
    if (!clanResult.ok) return;
    const inviteResult = local.createLocalInvite(clanResult.data, profileA, profileB.name);
    assert.equal(inviteResult.ok, true);
    if (!inviteResult.ok) return;
    assert.equal(local.createLocalInvite(clanResult.data, profileA, profileB.name).ok, false);
    assert.equal(local.createLocalInvite(clanResult.data, profileA, profileA.name).ok, false);

    const canceledInvite = local.createLocalInvite(clanResult.data, profileA, profileC.name);
    assert.equal(canceledInvite.ok, true);
    if (!canceledInvite.ok) return;
    assert.equal(local.cancelLocalInvite(canceledInvite.data.id, profileA.id).ok, true);
    const canceledState = local.loadLocalClanState(profileC);
    assert.equal(canceledState.ok && canceledState.data.invites.length, 0);

    const declinedInvite = local.createLocalInvite(clanResult.data, profileA, profileD.name);
    assert.equal(declinedInvite.ok, true);
    if (!declinedInvite.ok) return;
    assert.equal(local.declineLocalInvite(declinedInvite.data.id, profileD.id).ok, true);
    const declinedState = local.loadLocalClanState(profileD);
    assert.equal(declinedState.ok && declinedState.data.invites.length, 0);
    const invitedState = local.loadLocalClanState(profileB);
    assert.equal(invitedState.ok && invitedState.data.invites.length, 1);
    assert.equal(local.acceptLocalInvite(inviteResult.data.id, profileB.id).ok, true);
    const joinedState = local.loadLocalClanState(profileB);
    assert.equal(joinedState.ok && joinedState.data.members.length, 2);
    if (!joinedState.ok) return;
    const opponent = joinedState.data.members.find((member) => member.id === profileB.id);
    assert(opponent);
    const roomResult = local.createLocalFriendlyRoom(clanResult.data, profileA, opponent);
    assert.equal(roomResult.ok, true);
    if (!roomResult.ok) return;
    assert.equal(local.updateLocalFriendlyRoom(roomResult.data.id, profileB.id, 'accepted').ok, true);
    const accepted = local.loadLocalClanState(profileA);
    assert.equal(accepted.ok && accepted.data.friendlyRoom?.status, 'accepted');
    assert.equal(local.sendLocalClanMessage(clanResult.data, profileB, '안녕하세요').ok, true);
    const chatted = local.loadLocalClanState(profileA);
    assert.equal(chatted.ok && chatted.data.messages.some((message) => message.text === '안녕하세요'), true);

    assert.equal(local.leaveLocalClan(profileA.id).ok, false);
    assert.equal(local.removeLocalMember(clanResult.data.id, profileB.id, profileA.id).ok, true);
    const removedState = local.loadLocalClanState(profileB);
    assert.equal(removedState.ok && removedState.data.clan, null);
    assert.equal(local.leaveLocalClan(profileA.id).ok, true);
    const disbandedState = local.loadLocalClanState(profileA);
    assert.equal(disbandedState.ok && disbandedState.data.clan, null);
}
