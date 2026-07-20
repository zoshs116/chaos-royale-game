import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { disabledResult, supabase, toSupabaseError, type SupabaseResult } from './supabaseClient';

export interface SignUpResult {
    session: Session | null;
    needsEmailConfirmation: boolean;
}

export async function getAuthSession(): Promise<SupabaseResult<Session | null>> {
    if (!supabase) return disabledResult();
    const { data, error } = await supabase.auth.getSession();
    if (error) return toSupabaseError(`로그인 상태 확인 실패: ${error.message}`, error);
    return { ok: true, data: data.session };
}

export async function getBattleAccessToken(): Promise<string | undefined> {
    const session = await getAuthSession();
    if (session.ok && session.data?.access_token) return session.data.access_token;
    return import.meta.env.VITE_CHAOS_DEV_MULTIPLAYER_TOKEN as string | undefined;
}

export async function signInWithPassword(email: string, password: string): Promise<SupabaseResult<Session>> {
    if (!supabase) return disabledResult();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) {
        return toSupabaseError(authErrorMessage(error?.message ?? '로그인 세션을 만들지 못했습니다.'), error);
    }
    return { ok: true, data: data.session };
}

export async function signUpWithPassword(email: string, password: string, nickname: string): Promise<SupabaseResult<SignUpResult>> {
    if (!supabase) return disabledResult();
    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
            data: { requested_nickname: nickname.trim() },
        },
    });
    if (error || !data.user) {
        return toSupabaseError(authErrorMessage(error?.message ?? '회원가입을 완료하지 못했습니다.'), error);
    }
    return {
        ok: true,
        data: {
            session: data.session,
            needsEmailConfirmation: !data.session,
        },
    };
}

export async function signOut(): Promise<SupabaseResult<null>> {
    if (!supabase) return disabledResult();
    const { error } = await supabase.auth.signOut();
    if (error) return toSupabaseError(`로그아웃 실패: ${error.message}`, error);
    return { ok: true, data: null };
}

export function subscribeAuthSession(onSession: (session: Session | null, event: AuthChangeEvent) => void): () => void {
    if (!supabase) return () => undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => onSession(session, event));
    return () => data.subscription.unsubscribe();
}

function authErrorMessage(message: string): string {
    const normalized = message.toLowerCase();
    if (normalized.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않습니다.';
    if (normalized.includes('user already registered')) return '이미 가입된 이메일입니다.';
    if (normalized.includes('password')) return '비밀번호는 6자 이상으로 입력해 주세요.';
    if (normalized.includes('email')) return '이메일 형식을 확인해 주세요.';
    return message;
}
