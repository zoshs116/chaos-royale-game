import { useEffect, useMemo, useRef, useState } from 'react';
import { UNIT_TYPES } from '../data/UnitData';
import type { SkillType } from '../data/UnitData';
import {
    DUCKXEL_BATTLE_DIRECTIONS,
    getDuckxelAssetProfile,
    getDuckxelPreviewFramePath,
    resolveDuckxelDirectionAnimation,
} from '../data/DuckxelAnimationCatalog';
import type { DuckxelDirection, DuckxelPreviewAction } from '../data/DuckxelAnimationCatalog';
import { getActiveSkillDefinition } from '../data/ActiveSkillData';
import { unitName } from '../i18n/ko';

interface UnitProfileModalProps {
    unitKey: string;
    inDeck: boolean;
    deckFull: boolean;
    onClose: () => void;
    onAdd: () => void;
    onRemove: () => void;
}

const DIRECTION_LABELS: Record<DuckxelDirection, string> = {
    'north-west': '↖',
    'north-east': '↗',
    'south-west': '↙',
    'south-east': '↘',
};

const ROLE_LABELS: Record<string, string> = {
    tank: '탱커',
    assassin: '근접 딜러',
    mage: '마법사',
    support: '지원',
    siege: '공성',
    swarm: '물량',
};

const ATTACK_LABELS = {
    melee: '근거리',
    ranged: '원거리',
    splash: '범위 공격',
} as const;

const TARGET_LABELS = {
    any: '유닛·타워',
    building: '건물',
    ground: '지상 유닛',
    air: '공중 유닛',
} as const;

function skillCopy(skill: SkillType, params: Record<string, number | undefined>) {
    const hitInterval = params.hitInterval ?? 3;
    const copies: Partial<Record<SkillType, { name: string; trigger: string; description: string }>> = {
        defense_aura: { name: '방어 오라', trigger: '지속 효과', description: '주변 아군이 받는 피해를 줄입니다.' },
        stun_hit: { name: '기절 타격', trigger: `${hitInterval}회 공격마다`, description: '강한 타격으로 대상을 잠시 기절시킵니다.' },
        sprint_ambush: { name: '급습', trigger: '첫 교전 시', description: '이동 속도가 증가하고 첫 공격이 강해집니다.' },
        poison_dot: { name: '독 공격', trigger: '공격 적중 시', description: '일정 시간 동안 추가 피해를 입힙니다.' },
        fire_zone: { name: '화염 지대', trigger: '공격 적중 시', description: '바닥에 화염 지대를 남겨 범위 피해를 줍니다.' },
        petrify: { name: '석화', trigger: `${hitInterval}회 공격마다`, description: '대상을 잠시 움직일 수 없게 만듭니다.' },
        lifesteal: { name: '흡혈', trigger: '공격 적중 시', description: '가한 피해의 일부만큼 체력을 회복합니다.' },
        death_curse: { name: '죽음의 저주', trigger: '사망 시', description: '주변 적의 이동 속도를 낮춥니다.' },
        siege_mode: { name: '공성 모드', trigger: '건물 공격 시', description: '건물에 더 높은 피해를 입힙니다.' },
        death_explode: { name: '사망 폭발', trigger: '사망 시', description: '주변 적에게 범위 피해를 입힙니다.' },
    };
    return copies[skill] ?? null;
}

export default function UnitProfileModal({
    unitKey,
    inDeck,
    deckFull,
    onClose,
    onAdd,
    onRemove,
}: UnitProfileModalProps) {
    const profile = getDuckxelAssetProfile(unitKey);
    const data = UNIT_TYPES[unitKey];
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const [action, setAction] = useState<DuckxelPreviewAction>('walk');
    const [direction, setDirection] = useState<DuckxelDirection>('south-east');
    const [frameIndex, setFrameIndex] = useState(0);
    const [imageFailed, setImageFailed] = useState(false);

    const availableActions = useMemo(() => {
        if (!profile) return [] as DuckxelPreviewAction[];
        return (['walk', 'attack', 'skill'] as const).filter((key) => profile.previewActions[key]);
    }, [profile]);

    const resolved = profile ? resolveDuckxelDirectionAnimation(profile, action, direction) : null;
    const framePath = profile ? getDuckxelPreviewFramePath(profile, action, direction, frameIndex) : null;
    const skill = data?.skill && data.skill !== 'none'
        ? skillCopy(data.skill, data.skillParams as Record<string, number | undefined>)
        : null;
    const activeSkill = getActiveSkillDefinition(data?.activeSkill);

    useEffect(() => {
        closeButtonRef.current?.focus();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose]);

    useEffect(() => {
        setFrameIndex(0);
        setImageFailed(false);
    }, [unitKey, action, direction]);

    useEffect(() => {
        if (!resolved || resolved.directionDefinition.frameCount <= 1) return;
        const frameDuration = Math.max(50, Math.round(1000 / Math.max(1, resolved.directionDefinition.fps)));
        const atLastFrame = frameIndex >= resolved.directionDefinition.frameCount - 1;
        const delay = atLastFrame && !resolved.actionDefinition.loop
            ? resolved.actionDefinition.replayDelayMs
            : frameDuration;
        const timer = window.setTimeout(() => {
            setFrameIndex((current) => current >= resolved.directionDefinition.frameCount - 1 ? 0 : current + 1);
        }, delay);
        return () => window.clearTimeout(timer);
    }, [frameIndex, resolved]);

    if (!profile || !data) return null;

    const portraitPath = `/assets/portraits_card/${unitKey}.png`;
    const currentImage = imageFailed || !framePath ? portraitPath : framePath;

    return (
        <div className="unit-profile-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
        }}>
            <section className="unit-profile-modal" role="dialog" aria-modal="true" aria-labelledby="unit-profile-title">
                <header className="unit-profile-header">
                    <span className="unit-profile-cost" aria-label={`코스트 ${data.cost}`}>{data.cost}</span>
                    <div>
                        <h2 id="unit-profile-title">{unitName(unitKey)}</h2>
                        <p>{ROLE_LABELS[data.role] ?? data.role}</p>
                    </div>
                    <button ref={closeButtonRef} className="unit-profile-close" onClick={onClose} aria-label="닫기">×</button>
                </header>

                <div className="unit-profile-main">
                    <div className="unit-profile-preview-column">
                        <div className="unit-profile-action-tabs" role="tablist" aria-label="애니메이션 선택">
                            {availableActions.map((key) => (
                                <button
                                    key={key}
                                    role="tab"
                                    aria-selected={action === key}
                                    className={action === key ? 'active' : ''}
                                    onClick={() => setAction(key)}
                                >
                                    {profile.previewActions[key]?.label}
                                </button>
                            ))}
                        </div>

                        <div className="unit-profile-preview-stage">
                            <img
                                src={currentImage}
                                alt={`${unitName(unitKey)} ${profile.previewActions[action]?.label ?? ''}`}
                                onError={() => setImageFailed(true)}
                                style={{ transform: resolved?.flipX ? 'scaleX(-1)' : undefined }}
                            />
                            <span className="unit-profile-frame-status">{frameIndex + 1}/{resolved?.directionDefinition.frameCount ?? 1}</span>
                        </div>

                        <div className="unit-profile-directions" aria-label="방향 선택">
                            {DUCKXEL_BATTLE_DIRECTIONS.map((key) => (
                                <button
                                    key={key}
                                    className={direction === key ? 'active' : ''}
                                    onClick={() => setDirection(key)}
                                    aria-label={key}
                                    aria-pressed={direction === key}
                                >
                                    {DIRECTION_LABELS[key]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <aside className="unit-profile-deck-actions" aria-label="덱 관리">
                        <span className={inDeck ? 'included' : ''}>{inDeck ? '덱 포함' : '미포함'}</span>
                        <button className="add" onClick={onAdd} disabled={inDeck || deckFull}>+ 추가</button>
                        <button className="remove" onClick={onRemove} disabled={!inDeck}>− 삭제</button>
                        {deckFull && !inDeck && <small>덱이 가득 찼습니다</small>}
                    </aside>
                </div>

                <div className="unit-profile-stats">
                    <div><span>체력</span><strong>{data.hp.toLocaleString()}</strong></div>
                    <div><span>공격력</span><strong>{data.damage.toLocaleString()}</strong></div>
                    <div><span>사거리</span><strong>{data.range}</strong></div>
                    <div><span>공격 방식</span><strong>{ATTACK_LABELS[data.attackType]}</strong></div>
                    <div><span>공격 대상</span><strong>{TARGET_LABELS[data.targetPriority]}</strong></div>
                    <div><span>이동</span><strong>{data.movementType === 'air' ? '공중' : '지상'}</strong></div>
                </div>

                {(activeSkill || skill) && (
                    <section className="unit-profile-skill">
                        <div>
                            <strong>{activeSkill?.name ?? skill?.name}</strong>
                            <span>{activeSkill ? `쿨타임 ${(activeSkill.cooldownMs / 1000).toFixed(1)}초` : skill?.trigger}</span>
                        </div>
                        <p>{activeSkill?.description ?? skill?.description}</p>
                    </section>
                )}
            </section>
        </div>
    );
}
