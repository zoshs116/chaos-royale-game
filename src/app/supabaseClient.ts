import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
    ? createClient(supabaseUrl!, supabaseKey!, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        },
        realtime: {
            params: {
                eventsPerSecond: 10,
            },
        },
    })
    : null;

export type SupabaseResult<T> =
    | { ok: true; data: T }
    | { ok: false; message: string; cause?: unknown };

export const disabledResult = <T>(): SupabaseResult<T> => ({
    ok: false,
    message: 'Supabase 설정이 없습니다. 로컬 테스트 모드로 동작합니다.',
});

export const toSupabaseError = <T>(message: string, cause?: unknown): SupabaseResult<T> => ({
    ok: false,
    message,
    cause,
});
