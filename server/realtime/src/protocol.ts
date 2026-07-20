import type {
    BattleCommand,
    BattlePlayerConfig,
    BattleSnapshot,
} from '../../match-simulator/src/AuthoritativeBattleRoom';

export type ClientBattleMessage =
    | {
        type: 'join';
        roomId: string;
        token?: string;
        player: BattlePlayerConfig;
    }
    | {
        type: 'command';
        roomId: string;
        command: BattleCommand;
    }
    | {
        type: 'ping';
        sentAt: number;
    };

export type ServerBattleMessage =
    | { type: 'joined'; snapshot: BattleSnapshot }
    | { type: 'snapshot'; snapshot: BattleSnapshot }
    | { type: 'command_result'; seq: number; accepted: boolean; reason?: string }
    | { type: 'pong'; sentAt: number; serverAt: number }
    | { type: 'error'; code: string; message: string };

export function parseClientMessage(raw: string): ClientBattleMessage {
    const parsed = JSON.parse(raw) as Partial<ClientBattleMessage>;
    if (!parsed || typeof parsed.type !== 'string') throw new Error('message type is required');
    if (parsed.type === 'ping' && typeof parsed.sentAt === 'number') return parsed as ClientBattleMessage;
    if (parsed.type === 'join' && typeof parsed.roomId === 'string' && parsed.player) return parsed as ClientBattleMessage;
    if (parsed.type === 'command' && typeof parsed.roomId === 'string' && parsed.command) return parsed as ClientBattleMessage;
    throw new Error('invalid battle message');
}
