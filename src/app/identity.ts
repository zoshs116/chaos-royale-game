export type IdentityMode = 'development' | 'supabase';

export interface AppIdentity {
    userId: string;
    mode: IdentityMode;
    label: string;
}

const DEV_IDENTITIES = {
    a: {
        userId: '11111111-1111-4111-8111-111111111111',
        mode: 'development',
        label: '개발 사용자 A',
    },
    b: {
        userId: '22222222-2222-4222-8222-222222222222',
        mode: 'development',
        label: '개발 사용자 B',
    },
} as const satisfies Record<string, AppIdentity>;

const identityStorageKey = 'chaos-royale-dev-identity';

export function isExplicitDevelopmentMode(): boolean {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('automation') === '1' || ['a', 'b'].includes(params.get('devUser')?.toLowerCase() ?? '');
}

export function resolveDevelopmentIdentity(): AppIdentity {
    if (typeof window === 'undefined') return DEV_IDENTITIES.a;

    const requested = new URLSearchParams(window.location.search).get('devUser')?.toLowerCase();
    if (requested === 'a' || requested === 'b') {
        window.localStorage.setItem(identityStorageKey, requested);
        return DEV_IDENTITIES[requested];
    }

    const stored = window.localStorage.getItem(identityStorageKey);
    return stored === 'b' ? DEV_IDENTITIES.b : DEV_IDENTITIES.a;
}

export function createStorageKey(base: string, userId: string): string {
    return `${base}:${userId}`;
}

export function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
