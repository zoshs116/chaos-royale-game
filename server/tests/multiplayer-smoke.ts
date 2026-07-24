import assert from 'node:assert/strict';
import AuthoritativeBattleRoom from '../match-simulator/src/AuthoritativeBattleRoom';
import MatchRoomService from '../services/matchmaking/src/MatchRoomService';
import MatchResultService from '../services/matches/src/MatchResultService';
import MemoryStorage from '../storage/MemoryStorage';
import { getAuthoritativeCombatProfile, validateAuthoritativeCombatProfiles } from '../match-simulator/src/CombatProfile';
import { getActiveSkillDefinition, validateActiveSkillDefinitions } from '../../src/data/ActiveSkillData';
import { resolveSharedCombatTarget, type SharedTargetView } from '../../src/systems/combat/SharedTargeting';

await testMatchRoomLifecycle();
await testAuthoritativeBattleValidation();
await testIdempotentCommandReplay();
await testActiveSkillCardLock();
await testAuthoritativeDisconnectGrace();
await testAuthoritativeDuckxelCombatFlow();
await testMuradinMeleeSplash();
await testAuthoritativeLaneTargeting();
await testIdempotentProgression();
await testLocalClanAndFriendlyFlow();
testDuckxelCombatProfiles();
testSharedTargetingRules();
console.log('[multiplayer-smoke] all checks passed');

async function testIdempotentCommandReplay() {
    const room = new AuthoritativeBattleRoom('room-idempotent-command');
    room.join({ playerId: 'blue-idempotent', team: 'blue', deck: ['duckxel_sword_man'] });
    room.join({ playerId: 'red-idempotent', team: 'red', deck: ['duckxel_sword_man'] });
    const command = {
        type: 'spawn' as const,
        playerId: 'blue-idempotent',
        seq: 1,
        unitKey: 'duckxel_sword_man',
        x: 86,
        y: 500,
        handIndex: 0,
    };
    assert.equal(room.enqueue(command).accepted, true);
    const afterFirst = room.snapshot();
    const replay = room.enqueue(command);
    const afterReplay = room.snapshot();
    assert.deepEqual(replay, { accepted: true, reason: 'already_applied' });
    assert.equal(afterReplay.units.length, afterFirst.units.length, 'replayed command must not spawn twice');
    assert.equal(afterReplay.inputCount, afterFirst.inputCount, 'replayed command must not increment input count');
}

async function testActiveSkillCardLock() {
    const room = new AuthoritativeBattleRoom('room-active-skill-card-lock');
    room.join({
        playerId: 'blue-skill-lock',
        team: 'blue',
        deck: ['duckxel_muradin', 'duckxel_sword_man'],
    });
    room.join({
        playerId: 'red-skill-lock',
        team: 'red',
        deck: ['duckxel_sword_man'],
    });

    assert.equal(room.enqueue({
        type: 'spawn',
        playerId: 'blue-skill-lock',
        seq: 1,
        unitKey: 'duckxel_muradin',
        x: 180,
        y: 500,
        handIndex: 0,
    }).accepted, true);

    const hand = room.snapshot().players.find(player => player.playerId === 'blue-skill-lock')?.hand ?? [];
    assert.equal(hand.includes('duckxel_muradin'), false, 'a living active-skill unit must lock its card out of the hand');
    assert.equal(hand[0], 'duckxel_sword_man', 'the server should skip the locked skill card when drawing');

    const lifecycleRoom = new AuthoritativeBattleRoom('room-active-skill-card-lifecycle');
    lifecycleRoom.join({ playerId: 'blue-skill-life', team: 'blue', deck: ['duckxel_muradin'] });
    lifecycleRoom.join({ playerId: 'red-skill-life', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(lifecycleRoom.enqueue({
        type: 'spawn',
        playerId: 'blue-skill-life',
        seq: 1,
        unitKey: 'duckxel_muradin',
        x: 180,
        y: 500,
        handIndex: 0,
    }).accepted, true);
    assert.deepEqual(
        lifecycleRoom.snapshot().players.find(player => player.playerId === 'blue-skill-life')?.hand,
        [null],
        'the only hand slot should stay empty while its skill unit is alive',
    );

    const internalRoom = lifecycleRoom as unknown as {
        units: Array<{ ownerId: string; hp: number }>;
    };
    const spawnedSkillUnit = internalRoom.units.find(unit => unit.ownerId === 'blue-skill-life');
    assert(spawnedSkillUnit);
    spawnedSkillUnit.hp = 0;
    lifecycleRoom.step();
    assert.deepEqual(
        lifecycleRoom.snapshot().players.find(player => player.playerId === 'blue-skill-life')?.hand,
        ['duckxel_muradin'],
        'the skill card must return after the last matching unit dies',
    );
}

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
        'duckxel_web_acrobat',
    ];
    assert.deepEqual(validateAuthoritativeCombatProfiles(unitKeys), []);
    assert.equal(getAuthoritativeCombatProfile('spear_goblin')?.spawnCount, 3);
    assert.equal(getAuthoritativeCombatProfile('skeleton_swordsman')?.spawnCount, 18);
    assert.equal(getAuthoritativeCombatProfile('royal_giant')?.damage, 240);
    assert.equal(getAuthoritativeCombatProfile('royal_giant')?.range, 90);
    assert.equal(getAuthoritativeCombatProfile('royal_giant')?.attackIntervalMs, 3247);
    assert.equal(getAuthoritativeCombatProfile('duckxel_sword_man')?.speed, 25);
    assert.equal(getAuthoritativeCombatProfile('duckxel_barbarian')?.speed, 26);
    assert.equal(getAuthoritativeCombatProfile('duckxel_muradin')?.meleeSplashRadius, 24);
    assert.equal(getAuthoritativeCombatProfile('royal_giant')?.targetPolicy, 'building-only');
    assert.equal(getAuthoritativeCombatProfile('hog_rider')?.movementRoute, 'river-jump');
    assert.equal(getAuthoritativeCombatProfile('duckxel_sword_man')?.sightRange, 110);
    assert.equal(getAuthoritativeCombatProfile('spear_goblin')?.sightRange, 110);
    assert.equal(getAuthoritativeCombatProfile('royal_giant')?.sightRange, 190);
    assert.equal(getAuthoritativeCombatProfile('duckxel_barbarian')?.activeSkill, 'dragon_blade');
    assert.equal(getAuthoritativeCombatProfile('duckxel_muradin')?.activeSkill, 'earthbreaker');
    assert.equal(getAuthoritativeCombatProfile('duckxel_web_acrobat')?.activeSkill, 'web_snare');
    assert.deepEqual(validateActiveSkillDefinitions(), []);
    const dragonBlade = getActiveSkillDefinition('dragon_blade');
    assert.equal(dragonBlade?.timingByDirection['south-east'].impactMs, 5290);
    assert.equal(dragonBlade?.timingByDirection['south-east'].totalMs, 6320);
    assert.equal(dragonBlade?.travelingProjectile?.speed, 190);
    assert.equal(dragonBlade?.impactWaves[0]?.radius, 84);
}

function testSharedTargetingRules() {
    type Target = { id: string };
    const view = (
        id: string,
        team: 'blue' | 'red',
        x: number,
        y: number,
        lane: 'left' | 'right',
        options: Partial<SharedTargetView<Target>> = {},
    ): SharedTargetView<Target> => ({
        source: { id },
        stableId: id,
        x,
        y,
        team,
        alive: true,
        isTower: false,
        isKingTower: false,
        towerActive: true,
        movementType: 'ground',
        lane,
        arenaSide: y < 288 ? -1 : y > 352 ? 1 : 0,
        bridgeCorridor: null,
        routeDistance: Math.hypot(x - 86, y - 500),
        ...options,
    });
    const actor = view('actor', 'blue', 86, 500, 'left');
    const leftTower = view('red:left-tower', 'red', 86, 152, 'left', {
        isTower: true,
        routeDistance: 348,
    });
    const farCrossLane = view('red:far-right', 'red', 270, 470, 'right');
    const centerPull = view('red:center', 'red', 142, 470, 'right');
    const rear = view('red:rear', 'red', 86, 560, 'left');
    const bridgeEnemy = view('red:bridge', 'red', 86, 280, 'left', {
        arenaSide: -1,
        bridgeCorridor: 'left',
        routeDistance: 80,
    });
    const bridgeActor = view('bridge-actor', 'blue', 86, 360, 'left', {
        arenaSide: 1,
        bridgeCorridor: 'left',
        routeDistance: 0,
    });
    const rules = {
        policy: 'any-nearest' as const,
        mask: { units: true, towers: true, ground: true, air: false },
        sightRange: 110,
        crossLaneCloseRange: 44,
        sameLanePenalty: 20,
        bridgeCrossLaneAllowed: true,
        bridgeEngagementRange: 84,
        centerX: 180,
        centerPullHalfWidth: 54,
        rearAggroRange: 44,
        backtrackTolerance: 18,
        preserveCurrentTower: false,
    };

    assert.equal(
        resolveSharedCombatTarget(actor, null, [actor, farCrossLane, leftTower], rules).target?.id,
        leftTower.source.id,
        'a distant opposite-lane unit must not pull the actor',
    );
    assert.equal(
        resolveSharedCombatTarget(actor, null, [actor, centerPull, leftTower], rules).target?.id,
        centerPull.source.id,
        'a nearby central defender must still pull the actor',
    );
    assert.equal(
        resolveSharedCombatTarget(actor, null, [actor, rear, leftTower], rules).target?.id,
        leftTower.source.id,
        'a newly seen enemy far behind must not trigger a long backtrack',
    );
    assert.equal(
        resolveSharedCombatTarget(actor, farCrossLane, [actor, farCrossLane, centerPull, leftTower], rules).target?.id,
        farCrossLane.source.id,
        'an existing living unit target must remain locked',
    );
    assert.equal(
        resolveSharedCombatTarget(bridgeActor, null, [bridgeActor, bridgeEnemy, leftTower], rules).target?.id,
        bridgeEnemy.source.id,
        'units aligned on the same bridge must be able to engage across the river',
    );
    assert.equal(
        resolveSharedCombatTarget(actor, null, [actor, centerPull, leftTower], {
            ...rules,
            policy: 'building-only',
            mask: { units: false, towers: true, ground: true, air: false },
        }).target?.id,
        leftTower.source.id,
        'building-only units must preserve their special target mask',
    );
}

async function testAuthoritativeLaneTargeting() {
    const room = new AuthoritativeBattleRoom('room-lane-targeting');
    room.join({ playerId: 'blue-lane', team: 'blue', deck: ['duckxel_sword_man'] });
    room.join({ playerId: 'red-lane', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(room.enqueue({
        type: 'spawn', playerId: 'blue-lane', seq: 1, unitKey: 'duckxel_sword_man', x: 86, y: 500, handIndex: 0,
    }).accepted, true);
    assert.equal(room.enqueue({
        type: 'spawn', playerId: 'red-lane', seq: 1, unitKey: 'duckxel_sword_man', x: 270, y: 280, handIndex: 0,
    }).accepted, true);

    const internal = room as unknown as {
        units: Array<{
            id: string;
            ownerId: string;
            x: number;
            y: number;
            state: string;
            targetId: string | null;
            spawnReadyAtMs: number;
            acquisitionReadyAtMs: number;
            towerTargetCommitted: boolean;
        }>;
    };
    const blue = internal.units.find(unit => unit.ownerId === 'blue-lane');
    const red = internal.units.find(unit => unit.ownerId === 'red-lane');
    assert(blue && red);
    blue.state = 'moving';
    blue.spawnReadyAtMs = 0;
    blue.acquisitionReadyAtMs = 0;
    blue.targetId = null;
    red.state = 'moving';
    red.spawnReadyAtMs = 0;
    red.acquisitionReadyAtMs = 0;
    red.x = 270;
    red.y = 470;
    room.step();
    assert.equal(
        room.snapshot().units.find(unit => unit.id === blue.id)?.targetId,
        'red:princess:left',
        'the authoritative server must reject a distant opposite-lane pull',
    );

    blue.targetId = null;
    blue.towerTargetCommitted = false;
    red.x = 142;
    red.y = 470;
    room.step();
    assert.equal(
        room.snapshot().units.find(unit => unit.id === blue.id)?.targetId,
        red.id,
        'the authoritative server must accept a nearby central defender',
    );
}

async function testAuthoritativeDuckxelCombatFlow() {
    const webRoom = new AuthoritativeBattleRoom('room-web-snare-flow');
    webRoom.join({ playerId: 'blue-web', team: 'blue', deck: ['duckxel_web_acrobat'] });
    webRoom.join({ playerId: 'red-web-target', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(webRoom.enqueue({
        type: 'spawn', playerId: 'blue-web', seq: 1, unitKey: 'duckxel_web_acrobat', x: 180, y: 400, handIndex: 0,
    }).accepted, true);
    assert.equal(webRoom.enqueue({
        type: 'spawn', playerId: 'red-web-target', seq: 1, unitKey: 'duckxel_sword_man', x: 180, y: 280, handIndex: 0,
    }).accepted, true);
    for (let index = 0; index < 16; index += 1) webRoom.step();
    const webCaster = webRoom.snapshot().units.find((unit) => unit.ownerId === 'blue-web');
    const webTargetBefore = webRoom.snapshot().units.find((unit) => unit.ownerId === 'red-web-target');
    assert(webCaster && webTargetBefore);
    assert.equal(webRoom.enqueue({
        type: 'cast_active_skill', playerId: 'blue-web', seq: 2, unitId: webCaster.id, skillKey: 'web_snare',
    }).accepted, true);
    let zoneSnapshot = webRoom.snapshot();
    for (let index = 0; index < 45 && zoneSnapshot.skillZones.length === 0; index += 1) zoneSnapshot = webRoom.step();
    assert.equal(zoneSnapshot.skillZones.length, 1, 'web snare must create an authoritative persistent zone');
    const rootedTarget = zoneSnapshot.units.find((unit) => unit.ownerId === 'red-web-target');
    assert(rootedTarget && rootedTarget.hp < webTargetBefore.hp, 'web snare must apply its opening area hit');
    const rootedAt = { x: rootedTarget.x, y: rootedTarget.y, hp: rootedTarget.hp };
    for (let index = 0; index < 24; index += 1) zoneSnapshot = webRoom.step();
    const targetDuringRoot = zoneSnapshot.units.find((unit) => unit.ownerId === 'red-web-target');
    assert(targetDuringRoot);
    assert(Math.hypot(targetDuringRoot.x - rootedAt.x, targetDuringRoot.y - rootedAt.y) < 0.5, 'web snare must immobilize ground units inside its area');
    for (let index = 0; index < 18; index += 1) zoneSnapshot = webRoom.step();
    const targetAfterDot = zoneSnapshot.units.find((unit) => unit.ownerId === 'red-web-target');
    assert(targetAfterDot && targetAfterDot.hp < rootedAt.hp, 'web snare must deal authoritative periodic damage');
    for (let index = 0; index < 190; index += 1) zoneSnapshot = webRoom.step();
    assert.equal(zoneSnapshot.skillZones.length, 0, 'web snare zone must expire after seven seconds');

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
    let sawFirstTargetKnockup = false;
    let targetAfter = skillRoom.snapshot().units.find(unit => unit.ownerId === 'red-target');
    for (let index = 0; index < 60 && !sawFirstTargetKnockup; index += 1) {
        const snapshot = skillRoom.step();
        const caster = snapshot.units.find(unit => unit.id === skillUnit.id);
        sawSkillElevation ||= Boolean(caster && caster.elevation > 0);
        sawForwardTravel ||= Boolean(caster && Math.hypot(caster.x - skillUnit.x, caster.y - skillUnit.y) > 12);
        targetAfter = snapshot.units.find(unit => unit.ownerId === 'red-target');
        sawFirstTargetKnockup ||= Boolean(targetAfter && targetAfter.elevation > 0);
    }
    assert.equal(sawSkillElevation, true, 'earthbreaker must expose an authoritative airborne arc');
    assert.equal(sawForwardTravel, true, 'earthbreaker must move the caster toward its landing point');
    assert(targetAfter && targetAfter.hp < targetBefore.hp, 'earthbreaker must apply its first authoritative area hit');
    assert.equal(sawFirstTargetKnockup, true, 'earthbreaker first impact must launch affected ground units');
    assert(targetAfter);
    const hpAfterFirstWave = targetAfter.hp;
    let sawSecondTargetKnockup = false;
    let landedAfterFirstKnockup = false;
    for (let index = 0; index < 70 && !sawSecondTargetKnockup; index += 1) {
        const snapshot = skillRoom.step();
        targetAfter = snapshot.units.find(unit => unit.ownerId === 'red-target');
        if (!targetAfter) break;
        if (!landedAfterFirstKnockup && targetAfter.elevation <= 0.01) {
            landedAfterFirstKnockup = true;
        } else if (landedAfterFirstKnockup && targetAfter.elevation > 0) {
            sawSecondTargetKnockup = true;
        }
    }
    assert(targetAfter && targetAfter.hp < hpAfterFirstWave, 'earthbreaker must apply its delayed second authoritative area hit');
    assert.equal(sawSecondTargetKnockup, true, 'earthbreaker second impact must relaunch affected ground units');

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
    const skeletonSpawnCount = getAuthoritativeCombatProfile('skeleton_swordsman')?.spawnCount ?? 0;
    assert.equal(swarm.length, skeletonSpawnCount * 2);
    assert(uniquePositions.size > skeletonSpawnCount, 'collision solver must separate overlapping swarm members');
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
    assert.deepEqual(room.enqueue({
        type: 'spawn',
        playerId: 'player-a',
        seq: 1,
        unitKey: 'duckxel_sword_man',
        x: 180,
        y: 500,
        handIndex: 0,
    }), { accepted: true, reason: 'already_applied' });
    const snapshot = room.step();
    assert.equal(snapshot.units.length, 1);
    assert(snapshot.blueElixir < 5);
    assert.equal(snapshot.towers.length, 6);
    assert.deepEqual(
        snapshot.players.find((player) => player.playerId === 'player-a')?.hand,
        ['duckxel_sword_man'],
        'the Knight card should cycle normally after its active skill is removed',
    );

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

async function testMuradinMeleeSplash() {
    const room = new AuthoritativeBattleRoom('room-muradin-melee-splash');
    room.join({ playerId: 'blue-muradin', team: 'blue', deck: ['duckxel_muradin'] });
    room.join({ playerId: 'red-skeletons', team: 'red', deck: ['skeleton_swordsman'] });
    const internalRoom = room as unknown as {
        towers: Array<{ active: boolean }>;
    };
    for (const tower of internalRoom.towers) tower.active = false;
    assert.equal(room.enqueue({
        type: 'spawn',
        playerId: 'blue-muradin',
        seq: 1,
        unitKey: 'duckxel_muradin',
        x: 180,
        y: 370,
        handIndex: 0,
    }).accepted, true);
    assert.equal(room.enqueue({
        type: 'spawn',
        playerId: 'red-skeletons',
        seq: 1,
        unitKey: 'skeleton_swordsman',
        x: 180,
        y: 300,
        handIndex: 0,
    }).accepted, true);

    const initialSkeletonCount = getAuthoritativeCombatProfile('skeleton_swordsman')?.spawnCount ?? 0;
    let snapshot = room.snapshot();
    for (let index = 0; index < 60; index += 1) {
        snapshot = room.step();
        const muradin = snapshot.units.find(unit => unit.ownerId === 'blue-muradin');
        if ((muradin?.hitSerial ?? 0) > 0) break;
    }
    const survivingSkeletons = snapshot.units.filter(unit => unit.ownerId === 'red-skeletons').length;
    assert(
        survivingSkeletons <= initialSkeletonCount - 3,
        'muradin melee splash must defeat at least three tightly grouped skeletons on its first hit',
    );
}

async function testAuthoritativeDisconnectGrace() {
    let now = 10_000;
    const room = new AuthoritativeBattleRoom('room-disconnect-grace', () => now);
    room.join({ playerId: 'player-a', team: 'blue', deck: ['duckxel_sword_man'] });
    room.join({ playerId: 'player-b', team: 'red', deck: ['duckxel_sword_man'] });
    const running = room.step();
    room.disconnect('player-b');
    const paused = room.step();
    assert.equal(paused.paused, true);
    assert.equal(paused.tick, running.tick, 'simulation tick must freeze while a player reconnects');
    assert.equal(paused.remainingMs, running.remainingMs, 'battle timer must freeze while a player reconnects');
    assert.deepEqual(room.enqueue({
        type: 'spawn', playerId: 'player-a', seq: 1, unitKey: 'duckxel_sword_man', x: 180, y: 500, handIndex: 0,
    }), { accepted: false, reason: 'match_paused' });

    now += 44_000;
    assert.equal(room.step().state, 'running');
    const rejoined = room.join({ playerId: 'player-b', team: 'red', deck: ['duckxel_sword_man'] });
    assert.equal(rejoined.paused, false);
    assert.equal(room.step().tick, running.tick + 1, 'simulation must resume after reconnect');

    room.disconnect('player-b');
    now += 45_001;
    const timedOut = room.step();
    assert.equal(timedOut.state, 'finished');
    assert.equal(timedOut.winner, 'blue');
    assert.equal(timedOut.finishReason, 'disconnect_timeout');

    now = 100_000;
    const abandoned = new AuthoritativeBattleRoom('room-both-disconnected', () => now);
    abandoned.join({ playerId: 'player-a', team: 'blue', deck: ['duckxel_sword_man'] });
    abandoned.join({ playerId: 'player-b', team: 'red', deck: ['duckxel_sword_man'] });
    abandoned.disconnect('player-a');
    now += 5_000;
    abandoned.disconnect('player-b');
    now += 40_001;
    assert.equal(abandoned.step().state, 'running', 'both players must receive their complete reconnect grace');
    now += 5_000;
    const abandonedResult = abandoned.step();
    assert.equal(abandonedResult.state, 'finished');
    assert.equal(abandonedResult.winner, 'draw', 'simultaneous abandonment must not arbitrarily award one team');
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
