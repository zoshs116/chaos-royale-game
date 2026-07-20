import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { UNIT_FACTIONS, UNIT_TYPES, FACTION_COLORS } from '../data/UnitData';
import { unitName } from '../i18n/ko';
import { setChaosAppBridge } from './bridge';
import { CardSlot, GameBottomNav, GameButton, GamePanel, ResourcePill } from './gameUi';
import { createDefaultProfile, DEFAULT_PROFILE, formatNumber, visibleUnitKeys } from './mockData';
import { createStorageKey, isExplicitDevelopmentMode } from './identity';
import { getAuthSession, signInWithPassword, signOut, signUpWithPassword, subscribeAuthSession } from './authRepository';
import { loadCachedProfile, loadProfile, saveCachedProfile, saveProfile as persistProfile } from './profileRepository';
import { sanitizeDeck } from './profileRules';
import { isSupabaseConfigured } from './supabaseClient';
import {
    acceptLocalInvite,
    cancelLocalInvite,
    createLocalClan,
    createLocalFriendlyRoom,
    createLocalInvite,
    declineLocalInvite,
    leaveLocalClan,
    loadLocalClanState,
    removeLocalMember,
    sendLocalClanMessage,
    subscribeLocalMultiplayer,
    updateLocalFriendlyRoom,
    upsertLocalProfile,
} from './localMultiplayer';
import {
    acceptRemoteFriendlyRoom,
    acceptRemoteInvite,
    cancelRemoteInvite,
    createRemoteClan,
    createRemoteFriendlyRoom,
    createRemoteInvite,
    declineRemoteInvite,
    leaveRemoteClan,
    loadRemoteClanState,
    removeRemoteClanMember,
    sendRemoteClanMessage,
    subscribeRemoteSocial,
    unsubscribeRemoteSocial,
    updateRemoteFriendlyRoomStatus,
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
import UnitProfileModal from './UnitProfileModal';
import { isDuckxelAssetUnit } from '../data/DuckxelAnimationCatalog';

type Action =
    | { type: 'NAVIGATE'; route: AppRoute }
    | { type: 'LOGIN'; nickname: string }
    | { type: 'AUTHENTICATE'; profile: PlayerProfile; stored?: Partial<AppState> }
    | { type: 'SIGN_OUT' }
    | { type: 'HYDRATE_PROFILE'; profile: PlayerProfile }
    | { type: 'UPDATE_PROFILE'; name: string; avatarUnit: string }
    | { type: 'SET_DECK'; deck: string[] }
    | { type: 'CREATE_CLAN'; name: string; clan?: AppState['clan'] }
    | { type: 'INVITE_FRIEND'; nickname: string; invite?: ClanInvite }
    | { type: 'CANCEL_INVITE'; inviteId: string }
    | { type: 'DECLINE_INVITE'; inviteId: string }
    | { type: 'ACCEPT_INVITE_LOCALLY'; inviteId: string }
    | { type: 'REMOVE_MEMBER'; memberId: string }
    | { type: 'SEND_CHAT'; text: string }
    | { type: 'REQUEST_FRIENDLY'; opponentName?: string; room?: FriendlyRoom }
    | { type: 'ACCEPT_FRIENDLY' }
    | { type: 'SET_FRIENDLY_ROOM'; room: FriendlyRoom }
    | { type: 'LEAVE_ROOM' }
    | { type: 'MARK_FRIENDLY_IN_BATTLE' }
    | { type: 'SHOW_RESULT'; result: BattleResult }
    | { type: 'HYDRATE_REMOTE_CLAN'; remote: RemoteClanState }
    | { type: 'SET_CLAN_ONLINE'; userIds: string[] }
    | { type: 'REMOTE_NOTICE'; message: string };

type SocialOperationResult = { ok: true; data: unknown } | { ok: false; message: string };

const appStorageBase = 'chaos-royale-react-state-v4';
const storageKeyFor = (userId: string) => createStorageKey(appStorageBase, userId);

const initialRoute = (): AppRoute => {
    if (typeof window === 'undefined') return 'loading';
    const scene = new URLSearchParams(window.location.search).get('scene');
    if (scene === 'battle') return 'loading';
    if (scene === 'deck') return 'deck';
    if (scene === 'shop') return 'lobby';
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
    clanMembers: [],
    clanInvites: [],
    clanMessages: [],
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

const normalizeLoadedState = (loaded: Partial<AppState>, fallbackProfile = DEFAULT_PROFILE): AppState => {
    const profile = loadCachedProfile({ ...fallbackProfile, ...loaded.profile, id: fallbackProfile.id });
    const hasLegacyDemoProgress =
        profile.trophies === 4580
        && profile.gold === 12500
        && profile.gems === 320
        && profile.wins === 142
        && profile.losses === 38;
    if (hasLegacyDemoProgress) {
        profile.trophies = 0;
        profile.gold = 0;
        profile.gems = 0;
        profile.wins = 0;
        profile.losses = 0;
    }
    return {
        ...baseState,
        ...loaded,
        route: initialRoute(),
        isAuthenticated: loaded.isAuthenticated ?? initialIsAuthenticated(),
        profile,
        clan: loaded.clan ?? null,
        clanMembers: loaded.clanMembers ?? [],
        clanInvites: loaded.clanInvites ?? [],
        clanMessages: loaded.clanMessages ?? [],
    };
};

const loadInitialState = (): AppState => {
    if (typeof window === 'undefined') return baseState;
    try {
        const raw = window.localStorage.getItem(storageKeyFor(DEFAULT_PROFILE.id));
        if (!raw) return baseState;
        return normalizeLoadedState(JSON.parse(raw) as Partial<AppState>);
    } catch {
        return baseState;
    }
};

const readStoredState = (userId: string): Partial<AppState> | undefined => {
    if (typeof window === 'undefined') return undefined;
    try {
        const raw = window.localStorage.getItem(storageKeyFor(userId));
        return raw ? JSON.parse(raw) as Partial<AppState> : undefined;
    } catch {
        return undefined;
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
        case 'AUTHENTICATE': {
            const restored = normalizeLoadedState(action.stored ?? {}, action.profile);
            const profile = action.profile;
            return {
                ...restored,
                route: profile.profileComplete === false ? 'profile' : 'lobby',
                isAuthenticated: true,
                profile,
                clanMembers: [],
                clanInvites: [],
                clanMessages: [],
                friendlyRoom: null,
            };
        }
        case 'SIGN_OUT':
            return {
                ...baseState,
                route: 'login',
                isAuthenticated: false,
                profile: DEFAULT_PROFILE,
                clan: null,
                clanMembers: [],
                clanInvites: [],
                clanMessages: [],
                friendlyRoom: null,
            };
        case 'HYDRATE_PROFILE':
            return {
                ...state,
                profile: action.profile,
                clanMembers: state.clanMembers.map((member) => member.id === state.profile.id ? {
                    ...member,
                    id: action.profile.id,
                    name: action.profile.name,
                    level: action.profile.level,
                    trophies: action.profile.trophies,
                } : member),
            };
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
                clanMembers: [],
                clanMessages: [],
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
        case 'DECLINE_INVITE':
            return {
                ...state,
                clanInvites: state.clanInvites.map((item) =>
                    item.id === action.inviteId ? { ...item, status: 'declined' } : item
                ),
            };
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
                clanMembers: action.remote.members,
                clanInvites: action.remote.invites,
                clanMessages: action.remote.messages,
                friendlyRoom: action.remote.friendlyRoom,
            };
        case 'SET_CLAN_ONLINE': {
            const online = new Set(action.userIds);
            return {
                ...state,
                clanMembers: state.clanMembers.map((member) => ({ ...member, online: online.has(member.id) })),
            };
        }
        case 'REMOTE_NOTICE':
            return state;
        case 'ACCEPT_FRIENDLY':
            if (!state.friendlyRoom) return state;
            return {
                ...state,
                friendlyRoom: { ...state.friendlyRoom, status: 'accepted' },
                clanMessages: [...state.clanMessages, createMessage(state, '친선전이 수락되었습니다. 전투를 시작할 수 있습니다.')],
            };
        case 'SET_FRIENDLY_ROOM':
            return { ...state, friendlyRoom: action.room };
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
    const [remoteEnabled, setRemoteEnabled] = useState(false);
    const developmentMode = useMemo(() => !isSupabaseConfigured || isExplicitDevelopmentMode(), []);
    const [authReady, setAuthReady] = useState(developmentMode);
    const [profileHydrated, setProfileHydrated] = useState(developmentMode);
    const [authBusy, setAuthBusy] = useState(false);
    const [authMessage, setAuthMessage] = useState('');
    const [socialBusy, setSocialBusy] = useState<string | null>(null);
    const socialActionLock = useRef(false);
    const pendingNickname = useRef<string | null>(null);
    const authRequest = useRef(0);
    const authenticatedUserId = useRef<string | null>(null);
    const launchedFriendlyRoom = useRef<string | null>(null);

    const bootstrapAuthenticatedSession = useCallback(async (userId: string) => {
        const requestId = ++authRequest.current;
        setAuthBusy(true);
        setAuthMessage('');
        const fallback = loadCachedProfile(createDefaultProfile(userId));
        let profileResult = await loadProfile(fallback);
        if (requestId !== authRequest.current) return;
        if (!profileResult.ok) {
            setAuthMessage(profileResult.message);
            setSyncStatus(profileResult.message);
            setRemoteEnabled(false);
            setProfileHydrated(false);
            setAuthReady(true);
            setAuthBusy(false);
            dispatch({ type: 'SIGN_OUT' });
            return;
        }

        const requestedNickname = pendingNickname.current;
        if (requestedNickname && profileResult.data.profileComplete === false) {
            pendingNickname.current = null;
            profileResult = await persistProfile({
                ...profileResult.data,
                name: requestedNickname,
                profileComplete: true,
            });
            if (requestId !== authRequest.current) return;
            if (!profileResult.ok) {
                setAuthMessage(profileResult.message);
                setSyncStatus(profileResult.message);
                setRemoteEnabled(false);
                setProfileHydrated(false);
                setAuthReady(true);
                setAuthBusy(false);
                dispatch({ type: 'SIGN_OUT' });
                return;
            }
        }

        dispatch({
            type: 'AUTHENTICATE',
            profile: profileResult.data,
            stored: readStoredState(userId),
        });
        authenticatedUserId.current = userId;
        setRemoteEnabled(true);
        setProfileHydrated(true);
        setAuthReady(true);
        setAuthBusy(false);
        setSyncStatus('Supabase 인증·프로필 동기화 완료');
    }, []);

    useEffect(() => {
        if (developmentMode) {
            setRemoteEnabled(false);
            setAuthReady(true);
            setProfileHydrated(true);
            setSyncStatus('개발 사용자 로컬 모드');
            return;
        }

        let disposed = false;
        const applySession = (session: Session | null) => {
            if (disposed) return;
            if (session) {
                if (authenticatedUserId.current === session.user.id) return;
                const requestedNickname = session.user.user_metadata?.requested_nickname;
                if (typeof requestedNickname === 'string') pendingNickname.current = requestedNickname;
                void bootstrapAuthenticatedSession(session.user.id);
                return;
            }
            authRequest.current += 1;
            authenticatedUserId.current = null;
            setRemoteEnabled(false);
            setProfileHydrated(false);
            setAuthReady(true);
            setAuthBusy(false);
            dispatch({ type: 'SIGN_OUT' });
        };

        void getAuthSession().then((result) => {
            if (disposed) return;
            if (!result.ok) {
                setAuthMessage(result.message);
                setAuthReady(true);
                return;
            }
            applySession(result.data);
        });
        const unsubscribe = subscribeAuthSession((session, event) => {
            if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
            applySession(session);
        });
        return () => {
            disposed = true;
            authRequest.current += 1;
            unsubscribe();
        };
    }, [bootstrapAuthenticatedSession, developmentMode]);

    useEffect(() => {
        setChaosAppBridge({
            navigate: (route) => dispatch({ type: 'NAVIGATE', route: route === 'lobby' && !state.isAuthenticated ? 'login' : route }),
            showLobby: () => dispatch({ type: 'NAVIGATE', route: state.isAuthenticated ? 'lobby' : 'login' }),
            showResult: (result: BattleResult) => dispatch({ type: 'SHOW_RESULT', result }),
        });
    }, [state.isAuthenticated]);

    useEffect(() => {
        if (typeof window === 'undefined' || !authReady || !state.isAuthenticated) return;
        if (remoteEnabled && !profileHydrated) return;
        const { route: _route, ...persistable } = state;
        window.localStorage.setItem(storageKeyFor(state.profile.id), JSON.stringify(persistable));
        saveCachedProfile(state.profile);
    }, [authReady, profileHydrated, remoteEnabled, state]);

    useEffect(() => {
        if (!authReady || !profileHydrated || !state.isAuthenticated) return;
        let ignore = false;
        void (async () => {
            if (!remoteEnabled) {
                const localProfileResult = upsertLocalProfile(state.profile);
                if (!localProfileResult.ok) {
                    setSyncStatus(localProfileResult.message);
                    return;
                }
                const localState = loadLocalClanState(state.profile);
                if (localState.ok) dispatch({ type: 'HYDRATE_REMOTE_CLAN', remote: localState.data });
                else setSyncStatus(localState.message);
                return;
            }

            const profileResult = await loadProfile(state.profile);
            if (ignore) return;
            if (!profileResult.ok) {
                setSyncStatus(profileResult.message);
                return;
            }
            if (profileResult.data.id === state.profile.id && JSON.stringify(profileResult.data) !== JSON.stringify(state.profile)) {
                dispatch({ type: 'HYDRATE_PROFILE', profile: profileResult.data });
            }

            const remoteResult = await loadRemoteClanState(profileResult.data);
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
    }, [authReady, profileHydrated, remoteEnabled, state.isAuthenticated, state.profile.id]);

    useEffect(() => {
        if (remoteEnabled || !state.isAuthenticated) return;
        return subscribeLocalMultiplayer(() => {
            const result = loadLocalClanState(state.profile);
            if (result.ok) dispatch({ type: 'HYDRATE_REMOTE_CLAN', remote: result.data });
            else setSyncStatus(result.message);
        });
    }, [remoteEnabled, state.isAuthenticated, state.profile]);

    const refreshClanState = useCallback(async (): Promise<boolean> => {
        const result = remoteEnabled ? await loadRemoteClanState(state.profile) : loadLocalClanState(state.profile);
        if (!result.ok) {
            setSyncStatus(result.message);
            return false;
        }
        dispatch({ type: 'HYDRATE_REMOTE_CLAN', remote: result.data });
        setSyncStatus(remoteEnabled ? 'Supabase 클랜 동기화 완료' : '로컬 클랜 동기화 완료');
        return true;
    }, [remoteEnabled, state.profile]);

    useEffect(() => {
        if (!remoteEnabled || !state.isAuthenticated) return;
        let refreshScheduled = false;
        const requestRefresh = () => {
            if (refreshScheduled) return;
            refreshScheduled = true;
            window.setTimeout(() => {
                refreshScheduled = false;
                void refreshClanState();
            }, 80);
        };
        const subscription = subscribeRemoteSocial(
            state.profile.id,
            state.clan?.id,
            requestRefresh,
            (userIds) => dispatch({ type: 'SET_CLAN_ONLINE', userIds }),
        );
        return () => unsubscribeRemoteSocial(subscription);
    }, [refreshClanState, remoteEnabled, state.clan?.id, state.isAuthenticated, state.profile.id]);

    const go = (route: AppRoute) => dispatch({ type: 'NAVIGATE', route });
    const noteRemote = (message: string) => {
        setSyncStatus(message);
    };
    const saveProfileRemote = async (profile: PlayerProfile) => {
        if (!state.isAuthenticated) return null;
        if (!remoteEnabled) {
            const localResult = upsertLocalProfile(profile);
            if (!localResult.ok) {
                noteRemote(localResult.message);
                return null;
            }
            saveCachedProfile(profile);
            setSyncStatus('프로필 로컬 저장 완료');
            return profile;
        }
        const result = await persistProfile(profile);
        if (result.ok) setSyncStatus(isSupabaseConfigured ? '프로필 동기화 완료' : '프로필 로컬 저장 완료');
        else noteRemote(result.message);
        return result.ok ? result.data : null;
    };

    const runSocialAction = async (
        key: string,
        operation: () => SocialOperationResult | Promise<SocialOperationResult>,
        successMessage: string,
    ): Promise<boolean> => {
        if (socialActionLock.current) return false;
        socialActionLock.current = true;
        setSocialBusy(key);
        try {
            const result = await operation();
            if (!result.ok) {
                noteRemote(result.message);
                return false;
            }
            const refreshed = await refreshClanState();
            if (refreshed) setSyncStatus(successMessage);
            return refreshed;
        } finally {
            socialActionLock.current = false;
            setSocialBusy(null);
        }
    };

    const createClan = async (name: string) => runSocialAction(
        'create-clan',
        () => remoteEnabled ? createRemoteClan(state.profile, name) : createLocalClan(state.profile, name),
        '클랜 생성 완료',
    );

    const inviteFriend = async (nickname: string) => {
        if (!state.clan) {
            noteRemote('클랜을 먼저 만들어 주세요.');
            return false;
        }
        return runSocialAction(
            'invite',
            () => remoteEnabled
                ? createRemoteInvite(state.clan!, state.profile, nickname)
                : createLocalInvite(state.clan!, state.profile, nickname),
            '클랜 초대 전송 완료',
        );
    };

    const cancelInvite = async (inviteId: string) => runSocialAction(
        `cancel-invite:${inviteId}`,
        () => remoteEnabled ? cancelRemoteInvite(inviteId) : cancelLocalInvite(inviteId, state.profile.id),
        '클랜 초대 취소 완료',
    );

    const acceptInvite = async (inviteId: string) => {
        const invite = state.clanInvites.find((item) => item.id === inviteId);
        if (!invite) return false;
        return runSocialAction(
            `accept-invite:${inviteId}`,
            () => remoteEnabled ? acceptRemoteInvite(invite) : acceptLocalInvite(inviteId, state.profile.id),
            '클랜 가입 완료',
        );
    };

    const declineInvite = async (inviteId: string) => runSocialAction(
        `decline-invite:${inviteId}`,
        () => remoteEnabled ? declineRemoteInvite(inviteId) : declineLocalInvite(inviteId, state.profile.id),
        '클랜 초대 거절 완료',
    );

    const removeMember = async (memberId: string) => {
        if (!state.clan) return false;
        return runSocialAction(
            `remove-member:${memberId}`,
            () => remoteEnabled
                ? removeRemoteClanMember(state.clan!, memberId)
                : removeLocalMember(state.clan!.id, memberId, state.profile.id),
            '클랜 멤버 강퇴 완료',
        );
    };

    const leaveClan = async () => runSocialAction(
        'leave-clan',
        () => remoteEnabled ? leaveRemoteClan() : leaveLocalClan(state.profile.id),
        state.clan?.ownerId === state.profile.id ? '클랜 해체 완료' : '클랜 나가기 완료',
    );

    const sendChat = async (text: string) => {
        if (!text.trim() || !state.clan) return false;
        return runSocialAction(
            'send-chat',
            () => remoteEnabled
                ? sendRemoteClanMessage(state.clan!, state.profile, text.trim())
                : sendLocalClanMessage(state.clan!, state.profile, text.trim()),
            '채팅 동기화 완료',
        );
    };

    const requestFriendly = async (opponentName: string) => {
        const opponent = state.clanMembers.find((member) => member.id !== state.profile.id && member.name === opponentName)
            ?? state.clanMembers.find((member) => member.id !== state.profile.id);
        if (!opponent || !state.clan) {
            dispatch({ type: 'REQUEST_FRIENDLY', opponentName });
            return;
        }
        if (!remoteEnabled) {
            const result = createLocalFriendlyRoom(state.clan, state.profile, opponent);
            if (result.ok) dispatch({ type: 'REQUEST_FRIENDLY', opponentName, room: result.data });
            else noteRemote(result.message);
            return;
        }
        const result = await createRemoteFriendlyRoom(state.clan, state.profile, opponent);
        if (result.ok) dispatch({ type: 'REQUEST_FRIENDLY', opponentName, room: result.data });
        else noteRemote(result.message);
    };

    const acceptFriendly = async () => {
        if (state.friendlyRoom && !remoteEnabled) {
            const result = updateLocalFriendlyRoom(state.friendlyRoom.id, state.profile.id, 'accepted');
            if (!result.ok) {
                noteRemote(result.message);
                return;
            }
        } else if (state.friendlyRoom && remoteEnabled) {
            const result = await acceptRemoteFriendlyRoom(state.friendlyRoom);
            if (!result.ok) {
                noteRemote(result.message);
                return;
            }
            dispatch({
                type: 'SET_FRIENDLY_ROOM',
                room: { ...state.friendlyRoom, status: 'accepted', guestReady: true, revision: result.data },
            });
            return;
        }
        dispatch({ type: 'ACCEPT_FRIENDLY' });
    };

    const leaveFriendlyRoom = async () => {
        if (!state.friendlyRoom) return;
        const nextStatus: FriendlyRoom['status'] =
            state.friendlyRoom.status === 'requested' && state.friendlyRoom.guestUserId === state.profile.id
                ? 'declined'
                : 'canceled';
        if (!remoteEnabled) {
            const result = updateLocalFriendlyRoom(state.friendlyRoom.id, state.profile.id, nextStatus);
            if (!result.ok) {
                noteRemote(result.message);
                return;
            }
        } else {
            const result = await updateRemoteFriendlyRoomStatus(state.friendlyRoom, nextStatus);
            if (!result.ok) {
                noteRemote(result.message);
                return;
            }
        }
        dispatch({ type: 'LEAVE_ROOM' });
    };

    const handleSignIn = async (email: string, password: string) => {
        setAuthBusy(true);
        setAuthMessage('');
        const result = await signInWithPassword(email, password);
        if (!result.ok) {
            setAuthMessage(result.message);
            setAuthBusy(false);
            return;
        }
        const requestedNickname = result.data.user.user_metadata?.requested_nickname;
        if (typeof requestedNickname === 'string') pendingNickname.current = requestedNickname;
        await bootstrapAuthenticatedSession(result.data.user.id);
    };

    const handleSignUp = async (email: string, password: string, nickname: string) => {
        const cleanNickname = nickname.trim();
        if (cleanNickname.length < 2 || cleanNickname.length > 16) {
            setAuthMessage('닉네임은 2~16자로 입력해 주세요.');
            return;
        }
        setAuthBusy(true);
        setAuthMessage('');
        pendingNickname.current = cleanNickname;
        const result = await signUpWithPassword(email, password, cleanNickname);
        if (!result.ok) {
            pendingNickname.current = null;
            setAuthMessage(result.message);
            setAuthBusy(false);
            return;
        }
        if (result.data.needsEmailConfirmation || !result.data.session) {
            pendingNickname.current = null;
            setAuthMessage('확인 메일을 보냈습니다. 메일 확인 후 로그인해 주세요.');
            setAuthBusy(false);
            return;
        }
        await bootstrapAuthenticatedSession(result.data.session.user.id);
    };

    const handleDevelopmentLogin = (nickname: string) => {
        const profile = {
            ...state.profile,
            name: nickname.trim() || state.profile.name,
            profileComplete: true,
        };
        dispatch({ type: 'AUTHENTICATE', profile, stored: readStoredState(profile.id) });
    };

    const handleSignOut = async () => {
        if (developmentMode) {
            dispatch({ type: 'SIGN_OUT' });
            return;
        }
        setAuthBusy(true);
        const result = await signOut();
        if (!result.ok) {
            setAuthMessage(result.message);
            setAuthBusy(false);
            return;
        }
        authRequest.current += 1;
        authenticatedUserId.current = null;
        setRemoteEnabled(false);
        setProfileHydrated(false);
        setAuthBusy(false);
        dispatch({ type: 'SIGN_OUT' });
    };

    const saveProfile = async (name: string, avatarUnit: string) => {
        const profile = {
            ...state.profile,
            name: name.trim() || state.profile.name,
            avatarUnit,
            profileComplete: true,
        };
        const saved = await saveProfileRemote(profile);
        if (!saved) return;
        dispatch({ type: 'HYDRATE_PROFILE', profile: saved });
        dispatch({ type: 'NAVIGATE', route: 'lobby' });
    };

    const saveDeck = async (deck: string[]) => {
        const sanitizedDeck = sanitizeDeck(deck);
        const profile = { ...state.profile, selectedDeck: sanitizedDeck };
        const saved = await saveProfileRemote(profile);
        if (!saved) return;
        dispatch({ type: 'HYDRATE_PROFILE', profile: saved });
    };

    const startBattle = async (context?: Partial<BattleLaunchContext>) => {
        if (state.profile.selectedDeck.length < 1) return;
        const launch: BattleLaunchContext = {
            mode: context?.mode ?? 'solo',
            roomId: context?.roomId,
            playerId: state.profile.id,
            localTeam: context?.localTeam ?? 'blue',
            opponentName: context?.opponentName ?? '상대',
        };
        if (launch.mode === 'friendly') {
            const alreadyStarted = state.friendlyRoom?.id === launch.roomId && state.friendlyRoom?.status === 'in_battle';
            if (launch.roomId && !remoteEnabled && !alreadyStarted) {
                const starting = updateLocalFriendlyRoom(launch.roomId, state.profile.id, 'starting');
                if (!starting.ok) {
                    noteRemote(starting.message);
                    return;
                }
                const inBattle = updateLocalFriendlyRoom(launch.roomId, state.profile.id, 'in_battle');
                if (!inBattle.ok) {
                    noteRemote(inBattle.message);
                    return;
                }
            } else if (launch.roomId && remoteEnabled && !alreadyStarted) {
                const room = state.friendlyRoom ?? { id: launch.roomId, revision: 1 };
                const starting = await updateRemoteFriendlyRoomStatus(room, 'starting');
                if (!starting.ok) {
                    noteRemote(starting.message);
                    return;
                }
                const inBattle = await updateRemoteFriendlyRoomStatus({ id: room.id, revision: starting.data }, 'in_battle');
                if (!inBattle.ok) {
                    noteRemote(inBattle.message);
                    return;
                }
                if (state.friendlyRoom) {
                    dispatch({
                        type: 'SET_FRIENDLY_ROOM',
                        room: { ...state.friendlyRoom, status: 'in_battle', revision: inBattle.data },
                    });
                }
            }
            launchedFriendlyRoom.current = launch.roomId ?? null;
            dispatch({ type: 'MARK_FRIENDLY_IN_BATTLE' });
        }
        else dispatch({ type: 'NAVIGATE', route: 'battle' });
        onStartBattle(state.profile.selectedDeck, launch);
    };

    useEffect(() => {
        const room = state.friendlyRoom;
        if (!room || room.status !== 'in_battle' || state.route === 'battle') return;
        if (launchedFriendlyRoom.current === room.id || room.hostUserId === state.profile.id) return;
        launchedFriendlyRoom.current = room.id;
        dispatch({ type: 'MARK_FRIENDLY_IN_BATTLE' });
        onStartBattle(state.profile.selectedDeck, {
            mode: 'friendly',
            roomId: room.id,
            playerId: state.profile.id,
            localTeam: room.localTeam,
            opponentName: room.hostName,
        });
    }, [onStartBattle, state.friendlyRoom, state.profile.id, state.profile.selectedDeck, state.route]);

    if (!authReady && !developmentMode) {
        return (
            <main className="react-shell">
                <div className="phone-frame">
                    <section className="screen auth-boot-screen">
                        <div className="auth-boot-spinner" />
                        <strong>로그인 상태를 확인하는 중...</strong>
                    </section>
                </div>
            </main>
        );
    }
    if (state.route === 'loading') return null;

    return (
        <main className={`react-shell ${state.route === 'battle' ? 'battle-react-shell' : ''}`}>
            {state.route === 'battle' ? (
                <BattleOverlay state={state} onForfeit={() => {
                    window.dispatchEvent(new CustomEvent('chaos:battle-forfeit'));
                }} />
            ) : (
                <div className="phone-frame">
                    {state.route === 'login' && <LoginScreen
                        developmentMode={developmentMode}
                        busy={authBusy}
                        message={authMessage}
                        onSignIn={handleSignIn}
                        onSignUp={handleSignUp}
                        onDevelopmentLogin={handleDevelopmentLogin}
                    />}
                    {state.route === 'profile' && <ProfileScreen
                        profile={state.profile}
                        go={go}
                        onSave={saveProfile}
                        onLogout={handleSignOut}
                    />}
                    {state.route === 'lobby' && <LobbyScreen state={state} go={go} onStartBattle={() => startBattle()} />}
                    {state.route === 'deck' && <DeckScreen profile={state.profile} go={go} onStartBattle={() => startBattle()} onDeckChange={saveDeck} />}
                    {state.route === 'clan' && <ClanScreen
                        state={state}
                        go={go}
                        syncStatus={syncStatus}
                        socialBusy={socialBusy}
                        onCreateClan={createClan}
                        onInviteFriend={inviteFriend}
                        onCancelInvite={cancelInvite}
                        onAcceptInvite={acceptInvite}
                        onDeclineInvite={declineInvite}
                        onRemoveMember={removeMember}
                        onLeaveClan={leaveClan}
                        onSendChat={sendChat}
                        onRequestFriendly={requestFriendly}
                        onAcceptFriendly={acceptFriendly}
                        onLeaveFriendly={leaveFriendlyRoom}
                        onStartBattle={() => {
                        if (!state.friendlyRoom || state.friendlyRoom.status !== 'accepted') return;
                        startBattle({
                            mode: 'friendly',
                            roomId: state.friendlyRoom.id,
                            localTeam: state.friendlyRoom.localTeam,
                            opponentName: state.friendlyRoom.hostUserId === state.profile.id
                                ? (state.friendlyRoom.guestName ?? '상대')
                                : state.friendlyRoom.hostName,
                        });
                    }} />}
                    {state.route === 'result' && state.result && <ResultScreen result={state.result} go={go} onStartBattle={() => startBattle()} />}
                </div>
            )}
        </main>
    );
}

function LoginScreen({
    developmentMode,
    busy,
    message,
    onSignIn,
    onSignUp,
    onDevelopmentLogin,
}: {
    developmentMode: boolean;
    busy: boolean;
    message: string;
    onSignIn: (email: string, password: string) => Promise<void>;
    onSignUp: (email: string, password: string, nickname: string) => Promise<void>;
    onDevelopmentLogin: (nickname: string) => void;
}) {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState(DEFAULT_PROFILE.name);
    const submit = () => {
        if (developmentMode) {
            onDevelopmentLogin(nickname);
            return;
        }
        if (mode === 'signup') void onSignUp(email, password, nickname);
        else void onSignIn(email, password);
    };
    return (
        <section className="screen login-screen">
            <div className="login-backdrop" aria-hidden="true" />
            <div className="login-gradient" aria-hidden="true" />
            <div className="login-logo-block">
                <h1>카오스 로얄</h1>
                <p>TACTICAL BATTLE ARENA</p>
            </div>
            <div className="login-actions multiplayer-login">
                {!developmentMode && (
                    <div className="auth-mode-switch" role="tablist" aria-label="계정 메뉴">
                        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>로그인</button>
                        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>회원가입</button>
                    </div>
                )}
                {!developmentMode && (
                    <>
                        <label className="field-label" htmlFor="auth-email">이메일</label>
                        <input id="auth-email" className="text-input" type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} />
                        <label className="field-label" htmlFor="auth-password">비밀번호</label>
                        <input id="auth-password" className="text-input" type="password" value={password} minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onChange={(event) => setPassword(event.target.value)} />
                    </>
                )}
                {(developmentMode || mode === 'signup') && (
                    <>
                        <label className="field-label" htmlFor="auth-nickname">닉네임</label>
                        <input id="auth-nickname" className="text-input" value={nickname} minLength={2} maxLength={16} onChange={(event) => setNickname(event.target.value)} />
                    </>
                )}
                <GameButton variant="primary" icon="battle" disabled={busy || (!developmentMode && (!email || password.length < 6))} onClick={submit}>
                    {busy ? '처리 중...' : developmentMode ? '개발 모드 시작' : mode === 'signup' ? '계정 만들기' : '로그인'}
                </GameButton>
                {message && <p className="auth-message" role="status">{message}</p>}
                <small>{developmentMode ? '개발용 로컬 계정으로 실행합니다.' : '프로필과 덱은 로그인 계정에 안전하게 저장됩니다.'}</small>
            </div>
        </section>
    );
}

function ProfileScreen({ profile, go, onSave, onLogout }: {
    profile: PlayerProfile;
    go: (route: AppRoute) => void;
    onSave: (name: string, avatarUnit: string) => Promise<void>;
    onLogout: () => Promise<void>;
}) {
    const [name, setName] = useState(profile.name);
    const [avatarUnit, setAvatarUnit] = useState(profile.avatarUnit);
    const avatarOptions = ['stone_cold', 'maiev', 'darae', 'grommash'];
    return (
        <section className="screen">
            <div className="screen-content">
                <Header title="프로필 설정" profile={profile} back={profile.profileComplete === false ? undefined : () => go('lobby')} />
                <GamePanel className="stack profile-edit-panel">
                    <label className="field-label">닉네임</label>
                    <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={16} />
                    <div className="avatar-grid">
                        {avatarOptions.map((unitKey) => (
                            <button key={unitKey} className={`avatar-choice ${avatarUnit === unitKey ? 'selected' : ''}`} onClick={() => setAvatarUnit(unitKey)}>
                                <img src={`/assets/portraits_card/${unitKey}.png`} alt="" />
                                <span>{unitName(unitKey)}</span>
                            </button>
                        ))}
                    </div>
                    <GameButton variant="green" disabled={name.trim().length < 2} onClick={() => void onSave(name, avatarUnit)}>저장</GameButton>
                    <GameButton variant="dark" onClick={() => void onLogout()}>로그아웃</GameButton>
                </GamePanel>
            </div>
        </section>
    );
}

function LobbyScreen({ state, go, onStartBattle }: { state: AppState; go: (route: AppRoute) => void; onStartBattle: () => void }) {
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
                <div className="shortcut-grid">
                    <button onClick={() => go('deck')}>덱</button>
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
    const [profileUnitKey, setProfileUnitKey] = useState<string | null>(null);
    const units = visibleUnitKeys().filter((key) => filter === 'all' || UNIT_FACTIONS[key]?.faction === filter);
    const averageElixir = useMemo(() => {
        const total = deck.reduce((sum, unitKey) => sum + (UNIT_TYPES[unitKey]?.cost ?? 0), 0);
        return deck.length ? (total / deck.length).toFixed(1) : '0.0';
    }, [deck]);
    const applyDeck = (next: string[]) => {
        setDeck(next);
        onDeckChange(next);
    };
    const toggle = (unitKey: string) => {
        const next = deck.includes(unitKey)
            ? deck.filter((key) => key !== unitKey)
            : deck.length < 8 ? [...deck, unitKey] : deck;
        applyDeck(next);
    };
    const inspectOrToggle = (unitKey: string) => {
        if (isDuckxelAssetUnit(unitKey)) {
            setProfileUnitKey(unitKey);
            return;
        }
        toggle(unitKey);
    };
    const addProfileUnit = () => {
        if (!profileUnitKey || deck.includes(profileUnitKey) || deck.length >= 8) return;
        applyDeck([...deck, profileUnitKey]);
    };
    const removeProfileUnit = () => {
        if (!profileUnitKey || !deck.includes(profileUnitKey)) return;
        applyDeck(deck.filter((key) => key !== profileUnitKey));
    };
    return (
        <section className="screen">
            <div className="screen-content">
                <Header title="전투 덱" profile={profile} back={() => go('lobby')} />
                <section className="panel">
                    <div className="panel-title"><span>활성 {deck.length} / 8</span><strong>평균 엘릭서 {averageElixir}</strong></div>
                    <div className="deck-grid">
                        {Array.from({ length: 8 }).map((_, index) => deck[index]
                            ? <MiniCard key={`${deck[index]}-${index}`} unitKey={deck[index]} onClick={() => inspectOrToggle(deck[index])} />
                            : <button key={index} className="empty-slot" aria-label="빈 덱 슬롯">+</button>)}
                    </div>
                </section>
                <div className="filter-row">
                    {(['all', 'sentinel', 'scourge', 'neutral'] as const).map((key) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{factionLabel(key)}</button>)}
                </div>
                <div className="card-collection">
                    {units.map((unitKey) => <UnitCard key={unitKey} unitKey={unitKey} selected={deck.includes(unitKey)} onClick={() => inspectOrToggle(unitKey)} />)}
                </div>
            </div>
            <GameButton variant="gold" className="battle-cta small" icon="battle" onClick={onStartBattle}>전투</GameButton>
            <BottomNav active="deck" go={go} />
            {profileUnitKey && (
                <UnitProfileModal
                    unitKey={profileUnitKey}
                    inDeck={deck.includes(profileUnitKey)}
                    deckFull={deck.length >= 8}
                    onClose={() => setProfileUnitKey(null)}
                    onAdd={addProfileUnit}
                    onRemove={removeProfileUnit}
                />
            )}
        </section>
    );
}

function ClanScreen({
    state,
    go,
    syncStatus,
    socialBusy,
    onCreateClan,
    onInviteFriend,
    onCancelInvite,
    onAcceptInvite,
    onDeclineInvite,
    onRemoveMember,
    onLeaveClan,
    onSendChat,
    onRequestFriendly,
    onAcceptFriendly,
    onLeaveFriendly,
    onStartBattle,
}: {
    state: AppState;
    go: (route: AppRoute) => void;
    syncStatus: string;
    socialBusy: string | null;
    onCreateClan: (name: string) => Promise<boolean>;
    onInviteFriend: (nickname: string) => Promise<boolean>;
    onCancelInvite: (inviteId: string) => Promise<boolean>;
    onAcceptInvite: (inviteId: string) => Promise<boolean>;
    onDeclineInvite: (inviteId: string) => Promise<boolean>;
    onRemoveMember: (memberId: string) => Promise<boolean>;
    onLeaveClan: () => Promise<boolean>;
    onSendChat: (text: string) => Promise<boolean>;
    onRequestFriendly: (opponentName: string) => Promise<void>;
    onAcceptFriendly: () => Promise<void>;
    onLeaveFriendly: () => Promise<void>;
    onStartBattle: () => void;
}) {
    const [text, setText] = useState('');
    const [clanName, setClanName] = useState(state.clan?.name ?? '카오스 훈련장');
    const [inviteName, setInviteName] = useState('');
    const acceptedMembers = state.clanMembers.filter((member) => member.id !== state.profile.id);
    const [friendlyTarget, setFriendlyTarget] = useState(acceptedMembers[0]?.name ?? '');
    const activeFriendlyTarget = acceptedMembers.some((member) => member.name === friendlyTarget) ? friendlyTarget : acceptedMembers[0]?.name ?? '';
    const canStart = state.friendlyRoom?.status === 'accepted' && state.friendlyRoom.hostUserId === state.profile.id;
    const canAccept = state.friendlyRoom?.status === 'requested' && state.friendlyRoom.guestUserId === state.profile.id;
    const isClanOwner = state.clan?.ownerId === state.profile.id;
    const inviteStatusLabel: Record<ClanInvite['status'], string> = {
        pending: '초대 대기',
        accepted: '가입 완료',
        declined: '거절됨',
        canceled: '취소됨',
        expired: '만료됨',
    };
    const isBusy = socialBusy !== null;

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
                        {!state.clan ? (
                            <div className="clan-create-row">
                                <input value={clanName} onChange={(event) => setClanName(event.target.value)} maxLength={20} disabled={isBusy} />
                                <button disabled={isBusy || clanName.trim().length < 2} onClick={() => void onCreateClan(clanName)}>클랜 만들기</button>
                            </div>
                        ) : (
                            <div className="clan-membership-actions">
                                <span>초대 코드 {state.clan.inviteCode}</span>
                                <button disabled={isBusy} onClick={() => void onLeaveClan()}>{isClanOwner ? '클랜 해체' : '클랜 나가기'}</button>
                            </div>
                        )}
                        {!state.clan && <p className="empty-clan-note">클랜을 만들거나 받은 초대를 수락하면 채팅과 친선전 기능이 열립니다.</p>}
                    </GamePanel>

                    {!state.clan && state.clanInvites.some((invite) => invite.status === 'pending') && (
                        <GamePanel className="invite-panel" inset>
                            <div className="panel-title"><span>받은 클랜 초대</span><strong>{state.clanInvites.filter((invite) => invite.status === 'pending').length}개</strong></div>
                            <div className="invite-list">
                                {state.clanInvites.filter((invite) => invite.status === 'pending').map((invite) => (
                                    <div className="invite-row pending" key={invite.id}>
                                        <span>{invite.clanName ?? '클랜'} / {invite.fromUserName ?? '클랜장'}</span>
                                        <button disabled={isBusy} onClick={() => void onAcceptInvite(invite.id)}>수락</button>
                                        <button disabled={isBusy} onClick={() => void onDeclineInvite(invite.id)}>거절</button>
                                    </div>
                                ))}
                            </div>
                        </GamePanel>
                    )}

                    {state.clan && (
                        <>
                            <GamePanel className="invite-panel" inset>
                                <div className="panel-title"><span>친구 초대</span><strong>{state.clan.inviteCode}</strong></div>
                                <div className="clan-create-row">
                                    <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="친구 닉네임" maxLength={16} disabled={isBusy} />
                                    <button disabled={isBusy || inviteName.trim().length < 2} onClick={() => {
                                        void onInviteFriend(inviteName).then((ok) => { if (ok) setInviteName(''); });
                                    }}>초대</button>
                                </div>
                                <div className="invite-list">
                                    {state.clanInvites.length === 0 && <p className="empty-clan-note">보낸 초대가 없습니다.</p>}
                                    {state.clanInvites.filter((invite) => invite.fromUserId === state.profile.id).map((invite) => (
                                        <div className={`invite-row ${invite.status}`} key={invite.id}>
                                            <span>{invite.toNickname}</span>
                                            <strong>{inviteStatusLabel[invite.status]}</strong>
                                            {invite.status === 'pending' && (
                                                <button disabled={isBusy} onClick={() => void onCancelInvite(invite.id)}>취소</button>
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
                                        {member.id !== state.profile.id && isClanOwner && <button disabled={isBusy} onClick={() => void onRemoveMember(member.id)}>강퇴</button>}
                                    </div>
                                ))}
                            </GamePanel>

                            <section className="chat-panel">
                                <div className="message-list">
                                    {state.clanMessages.map((msg) => <p key={msg.id} className={`message ${msg.type}`}><strong>{msg.authorName}</strong>{msg.text}</p>)}
                                </div>
                                <div className="chat-input-row">
                                    <input value={text} maxLength={300} disabled={isBusy} onChange={(event) => setText(event.target.value)} placeholder="메시지 입력" />
                                    <button disabled={isBusy || !text.trim()} onClick={() => {
                                        void onSendChat(text).then((ok) => { if (ok) setText(''); });
                                    }}>전송</button>
                                </div>
                            </section>

                            <div className="friendly-row">
                                <select value={activeFriendlyTarget} onChange={(event) => setFriendlyTarget(event.target.value)} disabled={acceptedMembers.length === 0}>
                                    {acceptedMembers.length === 0 && <option>입장한 친구 없음</option>}
                                    {acceptedMembers.map((member) => <option key={member.id}>{member.name}</option>)}
                                </select>
                                <button disabled={acceptedMembers.length === 0} onClick={() => void onRequestFriendly(activeFriendlyTarget)}>친선전 보내기</button>
                                <button disabled={!canAccept} onClick={() => void onAcceptFriendly()}>수락</button>
                                <button disabled={!canStart} onClick={onStartBattle}>전투 시작</button>
                            </div>
                            {state.friendlyRoom && (
                                <GamePanel className="friendly-status" inset>
                                    <strong>친선전 방 {state.friendlyRoom.id}</strong>
                                    <span>내 진영: {state.friendlyRoom.localTeam === 'blue' ? '블루' : '레드'} / 상대: {state.friendlyRoom.opponentTeam === 'blue' ? '블루' : '레드'}</span>
                                    <small>상대가 수락한 뒤 클랜장이 전투를 시작할 수 있습니다.</small>
                                    <button onClick={() => void onLeaveFriendly()}>요청 취소</button>
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

function BottomNav({ active, go }: { active: 'lobby' | 'deck' | 'clan'; go: (route: AppRoute) => void }) {
    const items = [
        ['lobby', '전투', 'battle'],
        ['deck', '덱', 'deck'],
        ['clan', '클랜', 'clan'],
    ] as const;
    return <GameBottomNav active={active} items={items.map(([key, label, icon]) => ({ key, label, icon }))} onNavigate={go} />;
}

function MiniCard({ unitKey, onClick }: { unitKey: string; onClick?: () => void }) {
    return <CardSlot className="mini-card" onClick={onClick}><img src={`/assets/portraits_card/${unitKey}.png`} alt={unitName(unitKey)} /></CardSlot>;
}

function UnitCard({ unitKey, selected, onClick }: { unitKey: string; selected: boolean; onClick: () => void }) {
    const data = UNIT_TYPES[unitKey];
    const faction = UNIT_FACTIONS[unitKey]?.faction ?? 'neutral';
    return (
        <button className={`unit-card ${selected ? 'selected' : ''}`} onClick={onClick} style={{ '--accent': `#${FACTION_COLORS[faction].toString(16).padStart(6, '0')}` } as React.CSSProperties}>
            <span className="cost">{data.cost}</span>
            <img src={`/assets/portraits_card/${unitKey}.png`} alt={unitName(unitKey)} />
            <strong>{unitName(unitKey)}</strong>
        </button>
    );
}

function factionLabel(key: 'all' | 'sentinel' | 'scourge' | 'neutral') {
    return ({ all: '전체', sentinel: '센티넬', scourge: '스컬지', neutral: '중립' } as const)[key];
}

function GameIconShim({ name }: { name: 'trophy' }) {
    return <img className="kenney-icon inline-icon" src={`/assets/ui/kenney/icons/${name}.png`} alt="" aria-hidden="true" />;
}
