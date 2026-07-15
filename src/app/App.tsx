import { useEffect, useMemo, useReducer, useState } from 'react';
import { UNIT_FACTIONS, UNIT_TYPES, FACTION_COLORS } from '../data/UnitData';
import { unitName } from '../i18n/ko';
import { dispatchChaosNavigation, setChaosAppBridge } from './bridge';
import { CardSlot, GameBottomNav, GameButton, GamePanel, ResourcePill } from './gameUi';
import { DEFAULT_PROFILE, INITIAL_CLAN_MESSAGES, SELF_CLAN_MEMBER, formatNumber, visibleUnitKeys } from './mockData';
import { isSupabaseConfigured } from './supabaseClient';
import {
    acceptRemoteFriendlyRoom,
    acceptRemoteInvite,
    cancelRemoteInvite,
    createRemoteClan,
    createRemoteFriendlyRoom,
    createRemoteInvite,
    loadRemoteClanState,
    sendRemoteClanMessage,
    subscribeRemoteClan,
    unsubscribeRemoteClan,
    updateRemoteFriendlyRoomStatus,
    upsertRemoteProfile,
    type RemoteClanState,
} from './supabaseMultiplayer';
import type {
    AppRoute,
    AppState,
    BattleLaunchContext,
    BattleResult,
    ClanInvite,
    ClanMessage,
    FriendlyRoom,
    PlayerProfile,
    Team,
} from './types';

type Action =
    | { type: 'NAVIGATE'; route: AppRoute }
    | { type: 'LOGIN'; nickname: string }
    | { type: 'UPDATE_PROFILE'; name: string; avatarUnit: string }
    | { type: 'SET_DECK'; deck: string[] }
    | { type: 'CLAIM_DAILY' }
    | { type: 'BUY_UNIT'; unitKey: string; price: number; currency: 'gold' | 'gems' }
    | { type: 'CREATE_CLAN'; name: string; clan?: AppState['clan'] }
    | { type: 'INVITE_FRIEND'; nickname: string; invite?: ClanInvite }
    | { type: 'CANCEL_INVITE'; inviteId: string }
    | { type: 'ACCEPT_INVITE_LOCALLY'; inviteId: string }
    | { type: 'REMOVE_MEMBER'; memberId: string }
    | { type: 'SEND_CHAT'; text: string }
    | { type: 'REQUEST_FRIENDLY'; opponentName?: string; room?: FriendlyRoom }
    | { type: 'ACCEPT_FRIENDLY' }
    | { type: 'LEAVE_ROOM' }
    | { type: 'MARK_FRIENDLY_IN_BATTLE' }
    | { type: 'SHOW_RESULT'; result: BattleResult }
    | { type: 'HYDRATE_REMOTE_CLAN'; remote: RemoteClanState }
    | { type: 'REMOTE_NOTICE'; message: string };

const appStorageKey = 'chaos-royale-react-state-v3';

const initialRoute = (): AppRoute => {
    if (typeof window === 'undefined') return 'loading';
    const scene = new URLSearchParams(window.location.search).get('scene');
    if (scene === 'battle') return 'battle';
    if (scene === 'deck') return 'deck';
    if (scene === 'shop') return 'shop';
    if (scene === 'clan') return 'clan';
    if (scene === 'gameover') return 'result';
    if (scene === 'lobby') return 'lobby';
    return 'login';
};

const initialIsAuthenticated = () => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const scene = params.get('scene');
    return params.get('automation') === '1' && ['lobby', 'deck', 'shop', 'clan', 'gameover', 'battle'].includes(scene ?? '');
};

const baseState: AppState = {
    route: initialRoute(),
    isAuthenticated: initialIsAuthenticated(),
    profile: DEFAULT_PROFILE,
    clan: null,
    clanMembers: [SELF_CLAN_MEMBER],
    clanInvites: [],
    clanMessages: INITIAL_CLAN_MESSAGES,
    friendlyRoom: null,
    result: {
        winner: 'blue',
        blueCrowns: 2,
        redCrowns: 1,
        playerName: DEFAULT_PROFILE.name,
        opponentName: '상대',
        arenaName: '로얄 계곡',
    },
};

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createMessage = (
    state: AppState,
    text: string,
    type: ClanMessage['type'] = 'system',
    authorName = type === 'chat' ? state.profile.name : '시스템',
): ClanMessage => ({
    id: nowId('msg'),
    authorId: type === 'chat' ? state.profile.id : 'system',
    authorName,
    text,
    createdAt: Date.now(),
    type,
});

const selfMemberFromProfile = (profile: PlayerProfile) => ({
    ...SELF_CLAN_MEMBER,
    id: profile.id,
    name: profile.name,
    level: profile.level,
    trophies: profile.trophies,
});

const normalizeLoadedState = (loaded: Partial<AppState>): AppState => {
    const profile = { ...DEFAULT_PROFILE, ...loaded.profile };
    const members = loaded.clanMembers?.length ? loaded.clanMembers : [selfMemberFromProfile(profile)];
    const hasSelf = members.some((member) => member.id === profile.id);
    return {
        ...baseState,
        ...loaded,
        route: initialRoute(),
        isAuthenticated: loaded.isAuthenticated ?? initialIsAuthenticated(),
        profile,
        clan: loaded.clan ?? null,
        clanMembers: hasSelf ? members : [selfMemberFromProfile(profile), ...members],
        clanInvites: loaded.clanInvites ?? [],
        clanMessages: loaded.clanMessages?.length ? loaded.clanMessages : INITIAL_CLAN_MESSAGES,
    };
};

const loadInitialState = (): AppState => {
    if (typeof window === 'undefined') return baseState;
    try {
        const raw = window.localStorage.getItem(appStorageKey);
        if (!raw) return baseState;
        return normalizeLoadedState(JSON.parse(raw) as Partial<AppState>);
    } catch {
        return baseState;
    }
};

function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'NAVIGATE':
            return { ...state, route: action.route };
        case 'LOGIN': {
            const name = action.nickname.trim() || DEFAULT_PROFILE.name;
            return {
                ...state,
                isAuthenticated: true,
                route: 'lobby',
                profile: { ...state.profile, name },
                clanMembers: state.clanMembers.map((member) => member.id === state.profile.id ? { ...member, name } : member),
                clanMessages: [...state.clanMessages, createMessage(state, `${name} 님이 접속했습니다.`)],
            };
        }
        case 'UPDATE_PROFILE': {
            const name = action.name.trim() || state.profile.name;
            return {
                ...state,
                route: 'lobby',
                profile: { ...state.profile, name, avatarUnit: action.avatarUnit },
                clanMembers: state.clanMembers.map((member) => member.id === state.profile.id ? { ...member, name } : member),
            };
        }
        case 'SET_DECK':
            return { ...state, profile: { ...state.profile, selectedDeck: action.deck } };
        case 'CLAIM_DAILY':
            return { ...state, profile: { ...state.profile, gold: state.profile.gold + 100, gems: state.profile.gems + 5 } };
        case 'BUY_UNIT': {
            const current = state.profile[action.currency];
            if (current < action.price) return state;
            return { ...state, profile: { ...state.profile, [action.currency]: current - action.price } };
        }
        case 'CREATE_CLAN': {
            const name = action.name.trim() || '카오스 훈련장';
            const clan = action.clan ?? {
                id: nowId('clan'),
                name,
                ownerId: state.profile.id,
                inviteCode: `CHAOS-${Math.floor(1000 + Math.random() * 9000)}`,
                createdAt: Date.now(),
            };
            return {
                ...state,
                clan,
                clanInvites: [],
                clanMembers: [selfMemberFromProfile(state.profile)],
                clanMessages: [createMessage(state, `${name} 클랜을 만들었습니다.`)],
                friendlyRoom: null,
            };
        }
        case 'INVITE_FRIEND': {
            const nickname = action.nickname.trim();
            if (!state.clan) return state;
            if (!nickname) return { ...state, clanMessages: [...state.clanMessages, createMessage(state, '초대할 친구 닉네임을 입력하세요.')] };
            if (nickname === state.profile.name) return { ...state, clanMessages: [...state.clanMessages, createMessage(state, '자기 자신은 초대할 수 없습니다.')] };
            if (state.clanMembers.some((member) => member.name === nickname)) {
                return { ...state, clanMessages: [...state.clanMessages, createMessage(state, `${nickname} 님은 이미 클랜 멤버입니다.`)] };
            }
            if (state.clanInvites.some((invite) => invite.toNickname === nickname && invite.status === 'pending')) {
                return { ...state, clanMessages: [...state.clanMessages, createMessage(state, `${nickname} 님에게 이미 보낸 초대가 있습니다.`)] };
            }
            const invite: ClanInvite = action.invite ?? {
                id: nowId('invite'),
                clanId: state.clan.id,
                fromUserId: state.profile.id,
                toNickname: nickname,
                status: 'pending',
                createdAt: Date.now(),
            };
            return {
                ...state,
                clanInvites: [invite, ...state.clanInvites],
                clanMessages: [...state.clanMessages, createMessage(state, `${nickname} 님에게 클랜 초대를 보냈습니다.`)],
            };
        }
        case 'CANCEL_INVITE': {
            const invite = state.clanInvites.find((item) => item.id === action.inviteId);
            return {
                ...state,
                clanInvites: state.clanInvites.filter((item) => item.id !== action.inviteId),
                clanMessages: invite ? [...state.clanMessages, createMessage(state, `${invite.toNickname} 님에게 보낸 초대를 취소했습니다.`)] : state.clanMessages,
            };
        }
        case 'ACCEPT_INVITE_LOCALLY': {
            const invite = state.clanInvites.find((item) => item.id === action.inviteId);
            if (!invite || invite.status !== 'pending') return state;
            const alreadyMember = state.clanMembers.some((member) => member.name === invite.toNickname);
            return {
                ...state,
                clanInvites: state.clanInvites.map((item) => item.id === action.inviteId ? { ...item, status: 'accepted' } : item),
                clanMembers: alreadyMember ? state.clanMembers : [
                    ...state.clanMembers,
                    {
                        id: `local-${invite.toNickname}`,
                        name: invite.toNickname,
                        level: 1,
                        trophies: 0,
                        online: true,
                        ready: false,
                        role: 'member',
                    },
                ],
                clanMessages: [...state.clanMessages, createMessage(state, `${invite.toNickname} 님이 클랜에 입장했습니다.`)],
            };
        }
        case 'REMOVE_MEMBER': {
            const member = state.clanMembers.find((item) => item.id === action.memberId);
            if (!member || member.id === state.profile.id) return state;
            return {
                ...state,
                clanMembers: state.clanMembers.filter((item) => item.id !== action.memberId),
                friendlyRoom: state.friendlyRoom?.guestName === member.name ? null : state.friendlyRoom,
                clanMessages: [...state.clanMessages, createMessage(state, `${member.name} 님을 클랜에서 내보냈습니다.`)],
            };
        }
        case 'SEND_CHAT':
            if (!action.text.trim()) return state;
            if (!state.clan) return { ...state, clanMessages: [...state.clanMessages, createMessage(state, '클랜을 먼저 만들어야 채팅할 수 있습니다.')] };
            return { ...state, clanMessages: [...state.clanMessages, createMessage(state, action.text.trim(), 'chat')] };
        case 'REQUEST_FRIENDLY': {
            if (action.room) {
                return {
                    ...state,
                    friendlyRoom: action.room,
                    clanMessages: [...state.clanMessages, createMessage(state, `${action.room.guestName ?? '상대'} 님에게 친선전을 요청했습니다. 방 코드 ${action.room.id}`, 'friendly_request')],
                };
            }
            const opponent = state.clanMembers.find((member) => member.id !== state.profile.id && member.online && member.name === action.opponentName)
                ?? state.clanMembers.find((member) => member.id !== state.profile.id && member.online);
            if (!opponent) {
                return { ...state, clanMessages: [...state.clanMessages, createMessage(state, '친선전을 보낼 접속 중인 클랜 멤버가 없습니다.')] };
            }
            const localTeam: Team = Math.random() > 0.5 ? 'blue' : 'red';
            const room: FriendlyRoom = {
                id: Math.random().toString(36).slice(2, 8).toUpperCase(),
                hostUserId: state.profile.id,
                guestUserId: opponent.id,
                hostName: state.profile.name,
                guestName: opponent.name,
                localTeam,
                opponentTeam: localTeam === 'blue' ? 'red' : 'blue',
                status: 'requested',
                createdAt: Date.now(),
            };
            return {
                ...state,
                friendlyRoom: room,
                clanMessages: [...state.clanMessages, createMessage(state, `${opponent.name} 님에게 친선전을 요청했습니다. 방 코드 ${room.id}`, 'friendly_request')],
            };
        }
        case 'HYDRATE_REMOTE_CLAN':
            return {
                ...state,
                clan: action.remote.clan,
                clanMembers: action.remote.members.length > 0 ? action.remote.members : state.clanMembers,
                clanInvites: action.remote.invites,
                clanMessages: action.remote.messages.length > 0 ? action.remote.messages : state.clanMessages,
                friendlyRoom: action.remote.friendlyRoom,
            };
        case 'REMOTE_NOTICE':
            return { ...state, clanMessages: [...state.clanMessages, createMessage(state, action.message)] };
        case 'ACCEPT_FRIENDLY':
            if (!state.friendlyRoom) return state;
            return {
                ...state,
                friendlyRoom: { ...state.friendlyRoom, status: 'accepted' },
                clanMessages: [...state.clanMessages, createMessage(state, '친선전이 수락되었습니다. 전투를 시작할 수 있습니다.')],
            };
        case 'LEAVE_ROOM':
            return { ...state, friendlyRoom: null, clanMessages: [...state.clanMessages, createMessage(state, '친선전 대기방을 나갔습니다.')] };
        case 'MARK_FRIENDLY_IN_BATTLE':
            if (!state.friendlyRoom) return state;
            return { ...state, route: 'battle', friendlyRoom: { ...state.friendlyRoom, status: 'in_battle' } };
        case 'SHOW_RESULT':
            return { ...state, route: 'result', result: action.result, friendlyRoom: state.friendlyRoom ? { ...state.friendlyRoom, status: 'finished' } : null };
        default:
            return state;
    }
}

interface AppProps {
    onStartBattle: (deck: string[], context?: BattleLaunchContext) => void;
}

export default function App({ onStartBattle }: AppProps) {
    const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
    const [syncStatus, setSyncStatus] = useState(
        isSupabaseConfigured ? 'Supabase 연결 준비됨' : '로컬 테스트 모드'
    );

    useEffect(() => {
        setChaosAppBridge({
            navigate: (route) => dispatch({ type: 'NAVIGATE', route: route === 'lobby' && !state.isAuthenticated ? 'login' : route }),
            showLobby: () => dispatch({ type: 'NAVIGATE', route: state.isAuthenticated ? 'lobby' : 'login' }),
            showResult: (result: BattleResult) => dispatch({ type: 'SHOW_RESULT', result }),
        });
    }, [state.isAuthenticated]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const { route: _route, ...persistable } = state;
        window.localStorage.setItem(appStorageKey, JSON.stringify(persistable));
    }, [state]);

    useEffect(() => {
        if (!state.isAuthenticated || !isSupabaseConfigured) return;
        let ignore = false;
        void (async () => {
            const profileResult = await upsertRemoteProfile(state.profile);
            if (ignore) return;
            if (!profileResult.ok) {
                setSyncStatus(profileResult.message);
                return;
            }

            const remoteResult = await loadRemoteClanState(state.profile);
            if (ignore) return;
            if (remoteResult.ok) {
                dispatch({ type: 'HYDRATE_REMOTE_CLAN', remote: remoteResult.data });
                setSyncStatus('Supabase 동기화 완료');
            } else {
                setSyncStatus(remoteResult.message);
            }
        })();
        return () => {
            ignore = true;
        };
    }, [state.isAuthenticated, state.profile.id]);

    useEffect(() => {
        if (!state.clan?.id || !isSupabaseConfigured) return;
        const channel = subscribeRemoteClan(state.clan.id, () => {
            void loadRemoteClanState(state.profile).then((result) => {
                if (result.ok) dispatch({ type: 'HYDRATE_REMOTE_CLAN', remote: result.data });
                else setSyncStatus(result.message);
            });
        });
        return () => unsubscribeRemoteClan(channel);
    }, [state.clan?.id, state.profile.id]);

    const go = (route: AppRoute) => dispatch({ type: 'NAVIGATE', route });
    const noteRemote = (message: string) => {
        setSyncStatus(message);
        dispatch({ type: 'REMOTE_NOTICE', message });
    };
    const saveProfileRemote = async (profile: PlayerProfile) => {
        if (!isSupabaseConfigured || !state.isAuthenticated) return;
        const result = await upsertRemoteProfile(profile);
        if (result.ok) setSyncStatus('Profile synced');
        else noteRemote(result.message);
    };

    useEffect(() => {
        if (!state.friendlyRoom || state.friendlyRoom.status !== 'finished' || !isSupabaseConfigured) return;
        void updateRemoteFriendlyRoomStatus(state.friendlyRoom.id, 'finished').then((result) => {
            if (!result.ok) noteRemote(result.message);
        });
    }, [state.friendlyRoom?.id, state.friendlyRoom?.status]);

    const createClan = async (name: string) => {
        if (!isSupabaseConfigured) {
            dispatch({ type: 'CREATE_CLAN', name });
            return;
        }
        const result = await createRemoteClan(state.profile, name);
        if (result.ok) {
            dispatch({ type: 'CREATE_CLAN', name: result.data.name, clan: result.data });
            setSyncStatus('클랜 생성 동기화 완료');
        } else {
            noteRemote(result.message);
        }
    };

    const inviteFriend = async (nickname: string) => {
        if (!state.clan) {
            dispatch({ type: 'INVITE_FRIEND', nickname });
            return;
        }
        if (!isSupabaseConfigured) {
            dispatch({ type: 'INVITE_FRIEND', nickname });
            return;
        }
        const result = await createRemoteInvite(state.clan, state.profile, nickname);
        if (result.ok) {
            dispatch({ type: 'INVITE_FRIEND', nickname, invite: result.data });
            setSyncStatus('초대 동기화 완료');
        } else {
            noteRemote(result.message);
        }
    };

    const cancelInvite = async (inviteId: string) => {
        if (isSupabaseConfigured) {
            const result = await cancelRemoteInvite(inviteId);
            if (!result.ok) noteRemote(result.message);
        }
        dispatch({ type: 'CANCEL_INVITE', inviteId });
    };

    const acceptInvite = async (inviteId: string) => {
        const invite = state.clanInvites.find((item) => item.id === inviteId);
        if (!invite) return;
        if (isSupabaseConfigured) {
            const result = await acceptRemoteInvite(invite);
            if (!result.ok) {
                noteRemote(result.message);
                return;
            }
        }
        dispatch({ type: 'ACCEPT_INVITE_LOCALLY', inviteId });
    };

    const sendChat = async (text: string) => {
        if (!text.trim()) return;
        if (state.clan && isSupabaseConfigured) {
            const result = await sendRemoteClanMessage(state.clan, state.profile, text.trim());
            if (!result.ok) {
                noteRemote(result.message);
                return;
            }
        }
        dispatch({ type: 'SEND_CHAT', text });
    };

    const requestFriendly = async (opponentName: string) => {
        const opponent = state.clanMembers.find((member) => member.id !== state.profile.id && member.name === opponentName)
            ?? state.clanMembers.find((member) => member.id !== state.profile.id);
        if (!opponent || !state.clan || !isSupabaseConfigured) {
            dispatch({ type: 'REQUEST_FRIENDLY', opponentName });
            return;
        }
        const result = await createRemoteFriendlyRoom(state.clan, state.profile, opponent);
        if (result.ok) dispatch({ type: 'REQUEST_FRIENDLY', opponentName, room: result.data });
        else noteRemote(result.message);
    };

    const acceptFriendly = async () => {
        if (state.friendlyRoom && isSupabaseConfigured) {
            const result = await acceptRemoteFriendlyRoom(state.friendlyRoom.id);
            if (!result.ok) {
                noteRemote(result.message);
                return;
            }
        }
        dispatch({ type: 'ACCEPT_FRIENDLY' });
    };

    const saveProfile = (name: string, avatarUnit: string) => {
        const profile = { ...state.profile, name: name.trim() || state.profile.name, avatarUnit };
        dispatch({ type: 'UPDATE_PROFILE', name: profile.name, avatarUnit: profile.avatarUnit });
        void saveProfileRemote(profile);
    };

    const saveDeck = (deck: string[]) => {
        const profile = { ...state.profile, selectedDeck: deck };
        dispatch({ type: 'SET_DECK', deck });
        void saveProfileRemote(profile);
    };

    const startBattle = (context?: Partial<BattleLaunchContext>) => {
        if (state.profile.selectedDeck.length < 1) return;
        const launch: BattleLaunchContext = {
            mode: context?.mode ?? 'solo',
            roomId: context?.roomId,
            localTeam: context?.localTeam ?? 'blue',
            opponentName: context?.opponentName ?? '상대',
        };
        if (launch.mode === 'friendly') {
            if (launch.roomId && isSupabaseConfigured) {
                void updateRemoteFriendlyRoomStatus(launch.roomId, 'in_battle').then((result) => {
                    if (!result.ok) noteRemote(result.message);
                });
            }
            dispatch({ type: 'MARK_FRIENDLY_IN_BATTLE' });
        }
        else dispatch({ type: 'NAVIGATE', route: 'battle' });
        onStartBattle(state.profile.selectedDeck, launch);
    };

    if (state.route === 'loading') return null;

    return (
        <main className={`react-shell ${state.route === 'battle' ? 'battle-react-shell' : ''}`}>
            {state.route === 'battle' ? (
                <BattleOverlay state={state} onForfeit={() => {
                    window.chaosGame?.scene.stop('main-scene');
                    dispatchChaosNavigation({
                        result: {
                            winner: 'red',
                            blueCrowns: 0,
                            redCrowns: 3,
                            playerName: state.profile.name,
                            opponentName: state.friendlyRoom?.guestName ?? '상대',
                            arenaName: '로얄 계곡',
                        },
                    });
                }} />
            ) : (
                <div className="phone-frame">
                    {state.route === 'login' && <LoginScreen onLogin={(nickname) => dispatch({ type: 'LOGIN', nickname })} />}
                    {state.route === 'profile' && <ProfileScreen profile={state.profile} go={go} onSave={saveProfile} />}
                    {state.route === 'lobby' && <LobbyScreen state={state} go={go} onStartBattle={() => startBattle()} dispatch={dispatch} />}
                    {state.route === 'deck' && <DeckScreen profile={state.profile} go={go} onStartBattle={() => startBattle()} onDeckChange={saveDeck} />}
                    {state.route === 'shop' && <ShopScreen profile={state.profile} go={go} dispatch={dispatch} />}
                    {state.route === 'clan' && <ClanScreen
                        state={state}
                        go={go}
                        dispatch={dispatch}
                        syncStatus={syncStatus}
                        onCreateClan={createClan}
                        onInviteFriend={inviteFriend}
                        onCancelInvite={cancelInvite}
                        onAcceptInvite={acceptInvite}
                        onSendChat={sendChat}
                        onRequestFriendly={requestFriendly}
                        onAcceptFriendly={acceptFriendly}
                        onStartBattle={() => {
                        if (!state.friendlyRoom || state.friendlyRoom.status !== 'accepted') return;
                        startBattle({
                            mode: 'friendly',
                            roomId: state.friendlyRoom.id,
                            localTeam: state.friendlyRoom.localTeam,
                            opponentName: state.friendlyRoom.guestName ?? '상대',
                        });
                    }} />}
                    {state.route === 'result' && state.result && <ResultScreen result={state.result} go={go} onStartBattle={() => startBattle()} />}
                </div>
            )}
        </main>
    );
}

function LoginScreen({ onLogin }: { onLogin: (nickname: string) => void }) {
    const [nickname, setNickname] = useState(DEFAULT_PROFILE.name);
    return (
        <section className="screen login-screen">
            <div className="login-backdrop" aria-hidden="true" />
            <div className="login-gradient" aria-hidden="true" />
            <div className="login-logo-block">
                <h1>카오스 로얄</h1>
                <p>TACTICAL BATTLE ARENA</p>
            </div>
            <div className="login-actions multiplayer-login">
                <label className="field-label">닉네임</label>
                <input className="text-input" value={nickname} maxLength={12} onChange={(event) => setNickname(event.target.value)} />
                <GameButton variant="primary" icon="battle" onClick={() => onLogin(nickname)}>게임 시작</GameButton>
                <small>지금은 로컬 테스트 로그인입니다. Supabase 연결 시 실제 계정 세션으로 바뀝니다.</small>
            </div>
        </section>
    );
}

function ProfileScreen({ profile, go, onSave }: { profile: PlayerProfile; go: (route: AppRoute) => void; onSave: (name: string, avatarUnit: string) => void }) {
    const [name, setName] = useState(profile.name);
    const [avatarUnit, setAvatarUnit] = useState(profile.avatarUnit);
    const avatarOptions = ['stone_cold', 'maiev', 'darae', 'grommash'];
    return (
        <section className="screen">
            <div className="screen-content">
                <Header title="프로필 설정" profile={profile} back={() => go('lobby')} />
                <GamePanel className="stack profile-edit-panel">
                    <label className="field-label">닉네임</label>
                    <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={12} />
                    <div className="avatar-grid">
                        {avatarOptions.map((unitKey) => (
                            <button key={unitKey} className={`avatar-choice ${avatarUnit === unitKey ? 'selected' : ''}`} onClick={() => setAvatarUnit(unitKey)}>
                                <img src={`/assets/portraits_card/${unitKey}.png`} alt="" />
                                <span>{unitName(unitKey)}</span>
                            </button>
                        ))}
                    </div>
                    <GameButton variant="green" onClick={() => onSave(name, avatarUnit)}>저장</GameButton>
                </GamePanel>
            </div>
        </section>
    );
}

function LobbyScreen({ state, go, onStartBattle, dispatch }: { state: AppState; go: (route: AppRoute) => void; onStartBattle: () => void; dispatch: React.Dispatch<Action> }) {
    const { profile } = state;
    return (
        <section className="screen">
            <div className="screen-content">
                <Header title="카오스 로얄" profile={profile} onProfile={() => go('profile')} />
                <button className="profile-card" onClick={() => go('profile')}>
                    <img src={`/assets/portraits_card/${profile.avatarUnit}.png`} alt="" />
                    <div>
                        <h2>{profile.name}</h2>
                        <p>승 {profile.wins}  패 {profile.losses}</p>
                    </div>
                    <strong><GameIconShim name="trophy" /> {profile.trophies}</strong>
                </button>
                <button className="arena-card" onClick={onStartBattle}>
                    <span>현재 아레나</span>
                    <strong>로얄 계곡</strong>
                    <small>아레나 7</small>
                </button>
                <GameButton variant="gold" className="battle-cta" icon="battle" onClick={onStartBattle}>전투</GameButton>
                <section className="panel">
                    <div className="panel-title"><span>현재 덱</span><button onClick={() => go('deck')}>편집</button></div>
                    <div className="deck-row">
                        {profile.selectedDeck.slice(0, 4).map((unitKey) => <MiniCard key={unitKey} unitKey={unitKey} />)}
                    </div>
                </section>
                <button className="bonus-panel" onClick={() => dispatch({ type: 'CLAIM_DAILY' })}>
                    <span>일일 보상<small>희귀 상자 준비</small></span>
                    <strong>받기</strong>
                </button>
                <div className="shortcut-grid">
                    <button onClick={() => go('shop')}>상점</button>
                    <button onClick={() => go('deck')}>덱</button>
                    <button onClick={() => go('deck')}>카드</button>
                    <button onClick={() => go('clan')}>클랜</button>
                </div>
            </div>
            <BottomNav active="lobby" go={go} />
        </section>
    );
}

function DeckScreen({ profile, go, onStartBattle, onDeckChange }: { profile: PlayerProfile; go: (route: AppRoute) => void; onStartBattle: () => void; onDeckChange: (deck: string[]) => void }) {
    const [deck, setDeck] = useState(profile.selectedDeck);
    const [filter, setFilter] = useState<'all' | 'sentinel' | 'scourge' | 'neutral'>('all');
    const units = visibleUnitKeys().filter((key) => filter === 'all' || UNIT_FACTIONS[key]?.faction === filter);
    const averageElixir = useMemo(() => {
        const total = deck.reduce((sum, unitKey) => sum + (UNIT_TYPES[unitKey]?.cost ?? 0), 0);
        return deck.length ? (total / deck.length).toFixed(1) : '0.0';
    }, [deck]);
    const toggle = (unitKey: string) => {
        const next = deck.includes(unitKey)
            ? deck.filter((key) => key !== unitKey)
            : deck.length < 8 ? [...deck, unitKey] : deck;
        setDeck(next);
        onDeckChange(next);
    };
    return (
        <section className="screen">
            <div className="screen-content">
                <Header title="전투 덱" profile={profile} back={() => go('lobby')} />
                <section className="panel">
                    <div className="panel-title"><span>활성 {deck.length} / 8</span><strong>평균 엘릭서 {averageElixir}</strong></div>
                    <div className="deck-grid">
                        {Array.from({ length: 8 }).map((_, index) => deck[index] ? <MiniCard key={`${deck[index]}-${index}`} unitKey={deck[index]} onClick={() => toggle(deck[index])} /> : <button key={index} className="empty-slot">+</button>)}
                    </div>
                </section>
                <div className="filter-row">
                    {(['all', 'sentinel', 'scourge', 'neutral'] as const).map((key) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{factionLabel(key)}</button>)}
                </div>
                <div className="card-collection">
                    {units.map((unitKey) => <UnitCard key={unitKey} unitKey={unitKey} selected={deck.includes(unitKey)} onClick={() => toggle(unitKey)} />)}
                </div>
            </div>
            <GameButton variant="gold" className="battle-cta small" icon="battle" onClick={onStartBattle}>전투</GameButton>
            <BottomNav active="deck" go={go} />
        </section>
    );
}

function ShopScreen({ profile, go, dispatch }: { profile: PlayerProfile; go: (route: AppRoute) => void; dispatch: React.Dispatch<Action> }) {
    const deals = ['stone_cold', 'lucifer', 'obli', 'darae', 'grommash', 'nipi'];
    const featured = ['medusa', 'maiev', 'agamemnon', 'akasha'];
    return (
        <section className="screen">
            <div className="screen-content">
                <Header title="상점" profile={profile} back={() => go('lobby')} />
                <Scrollable>
                    <SectionTitle title="일일 상품" sub="12시간 뒤 갱신" />
                    <div className="shop-grid">
                        {deals.map((unitKey, index) => <ShopCard key={unitKey} unitKey={unitKey} price={[450, 400, 500, 480, 650, 520][index]} currency="gold" dispatch={dispatch} />)}
                    </div>
                    <SectionTitle title="추천 유닛" />
                    <div className="shop-grid">
                        {featured.map((unitKey, index) => <ShopCard key={unitKey} unitKey={unitKey} price={[250, 350, 500, 650][index]} currency="gems" dispatch={dispatch} />)}
                    </div>
                    <SectionTitle title="상자 상점" />
                    {['실버 상자', '골드 상자', '마법 상자'].map((name, index) => <div className="pack-card" key={name}><span /><div><strong>{name}</strong><small>카드와 보상 포함</small></div><button>{[500, 1500, 250][index]}</button></div>)}
                </Scrollable>
            </div>
            <BottomNav active="shop" go={go} />
        </section>
    );
}

function ClanScreen({
    state,
    go,
    dispatch,
    syncStatus,
    onCreateClan,
    onInviteFriend,
    onCancelInvite,
    onAcceptInvite,
    onSendChat,
    onRequestFriendly,
    onAcceptFriendly,
    onStartBattle,
}: {
    state: AppState;
    go: (route: AppRoute) => void;
    dispatch: React.Dispatch<Action>;
    syncStatus: string;
    onCreateClan: (name: string) => Promise<void>;
    onInviteFriend: (nickname: string) => Promise<void>;
    onCancelInvite: (inviteId: string) => Promise<void>;
    onAcceptInvite: (inviteId: string) => Promise<void>;
    onSendChat: (text: string) => Promise<void>;
    onRequestFriendly: (opponentName: string) => Promise<void>;
    onAcceptFriendly: () => Promise<void>;
    onStartBattle: () => void;
}) {
    const [text, setText] = useState('');
    const [clanName, setClanName] = useState(state.clan?.name ?? '카오스 훈련장');
    const [inviteName, setInviteName] = useState('');
    const acceptedMembers = state.clanMembers.filter((member) => member.id !== state.profile.id);
    const [friendlyTarget, setFriendlyTarget] = useState(acceptedMembers[0]?.name ?? '');
    const activeFriendlyTarget = acceptedMembers.some((member) => member.name === friendlyTarget) ? friendlyTarget : acceptedMembers[0]?.name ?? '';
    const canStart = state.friendlyRoom?.status === 'accepted';

    return (
        <section className="screen">
            <div className="screen-content">
                <Header title="클랜" profile={state.profile} back={() => go('lobby')} />
                <div className="clan-layout">
                    <GamePanel>
                        <div className="panel-title">
                            <span>{state.clan?.name ?? '클랜 없음'}</span>
                            <strong>{state.clan ? `${state.clanMembers.length}명` : '생성 필요'}</strong>
                        </div>
                        <p className="sync-status">{syncStatus}</p>
                        <div className="clan-create-row">
                            <input value={clanName} onChange={(event) => setClanName(event.target.value)} maxLength={14} />
                            <button onClick={() => void onCreateClan(clanName)}>{state.clan ? '다시 만들기' : '클랜 만들기'}</button>
                        </div>
                        {!state.clan && <p className="empty-clan-note">클랜을 만들면 초대, 채팅, 친선전 기능이 열립니다.</p>}
                    </GamePanel>

                    {state.clan && (
                        <>
                            <GamePanel className="invite-panel" inset>
                                <div className="panel-title"><span>친구 초대</span><strong>{state.clan.inviteCode}</strong></div>
                                <div className="clan-create-row">
                                    <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="친구 닉네임" maxLength={12} />
                                    <button onClick={() => { void onInviteFriend(inviteName); setInviteName(''); }}>초대</button>
                                </div>
                                <div className="invite-list">
                                    {state.clanInvites.length === 0 && <p className="empty-clan-note">보낸 초대가 없습니다.</p>}
                                    {state.clanInvites.map((invite) => (
                                        <div className={`invite-row ${invite.status}`} key={invite.id}>
                                            <span>{invite.toNickname}</span>
                                            <strong>{invite.status === 'pending' ? '초대 대기' : '입장 완료'}</strong>
                                            {invite.status === 'pending' && (
                                                <>
                                                    <button onClick={() => void onAcceptInvite(invite.id)}>입장 처리</button>
                                                    <button onClick={() => void onCancelInvite(invite.id)}>취소</button>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </GamePanel>

                            <GamePanel>
                                <div className="panel-title"><span>클랜 멤버</span><strong>{state.clanMembers.filter((member) => member.online).length}명 접속</strong></div>
                                {state.clanMembers.map((member) => (
                                    <div className="member-row" key={member.id}>
                                        <span className={member.online ? 'online-dot' : 'offline-dot'} />
                                        <strong>{member.name}</strong>
                                        <small>Lv.{member.level} / {member.trophies}</small>
                                        {member.id !== state.profile.id && <button onClick={() => dispatch({ type: 'REMOVE_MEMBER', memberId: member.id })}>내보내기</button>}
                                    </div>
                                ))}
                            </GamePanel>

                            <section className="chat-panel">
                                <div className="message-list">
                                    {state.clanMessages.map((msg) => <p key={msg.id} className={`message ${msg.type}`}><strong>{msg.authorName}</strong>{msg.text}</p>)}
                                </div>
                                <div className="chat-input-row">
                                    <input value={text} onChange={(event) => setText(event.target.value)} placeholder="메시지 입력" />
                                    <button onClick={() => { void onSendChat(text); setText(''); }}>전송</button>
                                </div>
                            </section>

                            <div className="friendly-row">
                                <select value={activeFriendlyTarget} onChange={(event) => setFriendlyTarget(event.target.value)} disabled={acceptedMembers.length === 0}>
                                    {acceptedMembers.length === 0 && <option>입장한 친구 없음</option>}
                                    {acceptedMembers.map((member) => <option key={member.id}>{member.name}</option>)}
                                </select>
                                <button disabled={acceptedMembers.length === 0} onClick={() => void onRequestFriendly(activeFriendlyTarget)}>친선전 보내기</button>
                                <button disabled={!state.friendlyRoom || state.friendlyRoom.status !== 'requested'} onClick={() => void onAcceptFriendly()}>수락</button>
                                <button disabled={!canStart} onClick={onStartBattle}>전투 시작</button>
                            </div>
                            {state.friendlyRoom && (
                                <GamePanel className="friendly-status" inset>
                                    <strong>친선전 방 {state.friendlyRoom.id}</strong>
                                    <span>내 진영: {state.friendlyRoom.localTeam === 'blue' ? '블루' : '레드'} / 상대: {state.friendlyRoom.opponentTeam === 'blue' ? '블루' : '레드'}</span>
                                    <small>Supabase 연결 후에는 상대가 직접 수락해야 전투가 시작됩니다.</small>
                                    <button onClick={() => dispatch({ type: 'LEAVE_ROOM' })}>요청 취소</button>
                                </GamePanel>
                            )}
                        </>
                    )}
                </div>
            </div>
            <BottomNav active="clan" go={go} />
        </section>
    );
}

function BattleOverlay({ state, onForfeit }: { state: AppState; onForfeit: () => void }) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const enemyName = state.friendlyRoom?.guestName ?? '상대';
    return (
        <div className="battle-react-overlay">
            <div className="battle-profile-strip" aria-hidden="true">
                <GamePanel className="battle-player-plate red" inset>
                    <strong>{enemyName}</strong>
                    <span>{state.friendlyRoom?.opponentTeam === 'blue' ? '블루' : '레드'}</span>
                </GamePanel>
                <GamePanel className="battle-player-plate blue" inset>
                    <strong>{state.profile.name}</strong>
                    <span>{state.friendlyRoom ? (state.friendlyRoom.localTeam === 'blue' ? '블루' : '레드') : '블루'}</span>
                </GamePanel>
            </div>
            <button className="battle-exit-button" onClick={() => setConfirmOpen(true)} aria-label="전투 나가기">×</button>
            {confirmOpen && (
                <div className="battle-modal-layer">
                    <GamePanel className="forfeit-modal">
                        <h2>전투를 포기하겠습니까?</h2>
                        <p>포기하면 즉시 패배 처리됩니다.</p>
                        <div>
                            <GameButton variant="dark" onClick={() => setConfirmOpen(false)}>아니요</GameButton>
                            <GameButton variant="purple" onClick={onForfeit}>네</GameButton>
                        </div>
                    </GamePanel>
                </div>
            )}
        </div>
    );
}

function ResultScreen({ result, go, onStartBattle }: { result: BattleResult; go: (route: AppRoute) => void; onStartBattle: () => void }) {
    const victory = result.winner === 'blue';
    return (
        <section className="screen result-screen">
            <div className={`result-banner ${victory ? 'win' : 'lose'}`}>{victory ? '승리' : result.winner === 'red' ? '패배' : '무승부'}</div>
            <p className="result-subtitle">전투 결과</p>
            <GamePanel className="result-panel">
                <div className="crown-row"><strong>{result.blueCrowns}</strong><span>VS</span><strong>{result.redCrowns}</strong></div>
                <div className="reward-row"><span>+150 골드</span><span>+30 보석</span><span>+12 트로피</span></div>
                <dl>
                    <dt>플레이어</dt><dd>{result.playerName}</dd>
                    <dt>상대</dt><dd>{result.opponentName}</dd>
                    <dt>아레나</dt><dd>{result.arenaName}</dd>
                </dl>
            </GamePanel>
            <GameButton variant="gold" className="result-button gold" icon="battle" onClick={onStartBattle}>다시 전투</GameButton>
            <GameButton variant="dark" className="result-button steel" onClick={() => go('lobby')}>로비로</GameButton>
        </section>
    );
}

function Header({ title, profile, back, onProfile }: { title: string; profile: PlayerProfile; back?: () => void; onProfile?: () => void }) {
    return (
        <header className="app-header">
            {back && <button className="back-button" onClick={back}>‹</button>}
            <button className="header-title-button" onClick={onProfile} disabled={!onProfile}>{title}</button>
            <ResourcePill tone="gold">{formatNumber(profile.gold)}</ResourcePill>
            <ResourcePill tone="gem">{profile.gems}</ResourcePill>
        </header>
    );
}

function BottomNav({ active, go }: { active: 'lobby' | 'deck' | 'shop' | 'clan'; go: (route: AppRoute) => void }) {
    const items = [
        ['lobby', '전투', 'battle'],
        ['deck', '덱', 'deck'],
        ['shop', '상점', 'shop'],
        ['clan', '클랜', 'clan'],
    ] as const;
    return <GameBottomNav active={active} items={items.map(([key, label, icon]) => ({ key, label, icon }))} onNavigate={go} />;
}

function MiniCard({ unitKey, onClick }: { unitKey: string; onClick?: () => void }) {
    return <CardSlot className="mini-card" onClick={onClick}><img src={`/assets/portraits_card/${unitKey}.png`} alt="" /></CardSlot>;
}

function UnitCard({ unitKey, selected, onClick }: { unitKey: string; selected: boolean; onClick: () => void }) {
    const data = UNIT_TYPES[unitKey];
    const faction = UNIT_FACTIONS[unitKey]?.faction ?? 'neutral';
    return (
        <button className={`unit-card ${selected ? 'selected' : ''}`} onClick={onClick} style={{ '--accent': `#${FACTION_COLORS[faction].toString(16).padStart(6, '0')}` } as React.CSSProperties}>
            <span className="cost">{data.cost}</span>
            <img src={`/assets/portraits_card/${unitKey}.png`} alt="" />
            <strong>{unitName(unitKey)}</strong>
        </button>
    );
}

function ShopCard({ unitKey, price, currency, dispatch }: { unitKey: string; price: number; currency: 'gold' | 'gems'; dispatch: React.Dispatch<Action> }) {
    return (
        <article className="shop-card">
            <img src={`/assets/portraits_card/${unitKey}.png`} alt="" />
            <strong>{unitName(unitKey)}</strong>
            <span>{currency === 'gold' ? '골드' : '보석'} {price}</span>
            <button onClick={() => dispatch({ type: 'BUY_UNIT', unitKey, price, currency })}>구매</button>
        </article>
    );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
    return <h2 className="section-title"><span>{title}</span>{sub && <small>{sub}</small>}</h2>;
}

function Scrollable({ children }: { children: React.ReactNode }) {
    return <div className="scrollable">{children}</div>;
}

function factionLabel(key: 'all' | 'sentinel' | 'scourge' | 'neutral') {
    return ({ all: '전체', sentinel: '센티넬', scourge: '스컬지', neutral: '중립' } as const)[key];
}

function GameIconShim({ name }: { name: 'trophy' }) {
    return <img className="kenney-icon inline-icon" src={`/assets/ui/kenney/icons/${name}.png`} alt="" aria-hidden="true" />;
}
