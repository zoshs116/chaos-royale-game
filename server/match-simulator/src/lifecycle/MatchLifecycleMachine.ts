export type MatchLifecycleState =
    | 'created'
    | 'queued'
    | 'provisioning'
    | 'running'
    | 'finishing'
    | 'archived'
    | 'failed';

export type MatchLifecycleEvent =
    | 'queue_assigned'
    | 'server_reserved'
    | 'start_match'
    | 'submit_result'
    | 'archive_done'
    | 'fatal_error'
    | 'reset';

export interface MatchLifecycleSnapshot {
    matchId: string;
    state: MatchLifecycleState;
    revision: number;
}

type TransitionMap = Readonly<Record<MatchLifecycleState, Readonly<Partial<Record<MatchLifecycleEvent, MatchLifecycleState>>>>>;

const TRANSITIONS: TransitionMap = {
    created: {
        queue_assigned: 'queued',
        fatal_error: 'failed'
    },
    queued: {
        server_reserved: 'provisioning',
        reset: 'created',
        fatal_error: 'failed'
    },
    provisioning: {
        start_match: 'running',
        fatal_error: 'failed'
    },
    running: {
        submit_result: 'finishing',
        fatal_error: 'failed'
    },
    finishing: {
        archive_done: 'archived',
        fatal_error: 'failed'
    },
    archived: {
        reset: 'created'
    },
    failed: {
        reset: 'created'
    }
} as const;

export default class MatchLifecycleMachine {
    private readonly matchId: string;
    private state: MatchLifecycleState = 'created';
    private revision: number = 1;

    constructor(matchId: string) {
        this.matchId = matchId;
    }

    public getSnapshot(): MatchLifecycleSnapshot {
        return {
            matchId: this.matchId,
            state: this.state,
            revision: this.revision
        };
    }

    public can(event: MatchLifecycleEvent): boolean {
        const nextState = TRANSITIONS[this.state][event];
        return nextState !== undefined;
    }

    public transition(event: MatchLifecycleEvent): MatchLifecycleSnapshot {
        const nextState = TRANSITIONS[this.state][event];
        if (nextState === undefined) {
            throw new Error(`Invalid transition: ${this.state} -> ${event}`);
        }

        this.state = nextState;
        this.revision += 1;
        return this.getSnapshot();
    }
}
