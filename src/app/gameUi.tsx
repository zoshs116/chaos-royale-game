import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type GameButtonVariant = 'primary' | 'gold' | 'green' | 'dark' | 'purple' | 'square';
type GameIconName = 'battle' | 'deck' | 'shop' | 'clan' | 'trophy' | 'plus' | 'info' | 'back' | 'close' | 'locked';

const iconPath = (name: GameIconName) => `/assets/ui/kenney/icons/${name}.png`;

export function GameIcon({ name, className = '' }: { name: GameIconName; className?: string }) {
    return <img className={`kenney-icon ${className}`.trim()} src={iconPath(name)} alt="" aria-hidden="true" />;
}

export function GameButton({
    variant = 'primary',
    className = '',
    children,
    icon,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: GameButtonVariant;
    icon?: GameIconName;
}) {
    return (
        <button className={`game-button game-button-${variant} ${className}`.trim()} {...props}>
            {icon && <GameIcon name={icon} />}
            <span className="game-button-label">{children}</span>
        </button>
    );
}

export function GamePanel({
    className = '',
    children,
    inset = false,
    ...props
}: HTMLAttributes<HTMLElement> & {
    children: ReactNode;
    inset?: boolean;
}) {
    return (
        <section className={`game-panel ${inset ? 'game-panel-inset' : ''} ${className}`.trim()} {...props}>
            {children}
        </section>
    );
}

export function CardSlot({
    className = '',
    children,
    locked = false,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: ReactNode;
    locked?: boolean;
}) {
    return (
        <button className={`game-card-slot ${locked ? 'locked' : ''} ${className}`.trim()} {...props}>
            {locked ? <GameIcon name="locked" /> : children}
        </button>
    );
}

export function ResourcePill({
    children,
    icon,
    tone = 'gold',
}: {
    children: ReactNode;
    icon?: GameIconName;
    tone?: 'gold' | 'gem' | 'blue';
}) {
    return (
        <span className={`resource-pill resource-pill-${tone}`}>
            {icon && <GameIcon name={icon} />}
            {children}
        </span>
    );
}

export function GameBottomNav<T extends string>({
    active,
    items,
    onNavigate,
}: {
    active: T;
    items: readonly { key: T; label: string; icon: GameIconName }[];
    onNavigate: (key: T) => void;
}) {
    return (
        <nav className="bottom-nav game-bottom-nav">
            {items.map((item) => (
                <button key={item.key} className={active === item.key ? 'active' : ''} onClick={() => onNavigate(item.key)}>
                    <span><GameIcon name={item.icon} /></span>
                    {item.label}
                </button>
            ))}
        </nav>
    );
}
