import type { GamePhase } from './types.js';
import type { GameEvent } from './events.js';

export type Transition<Ctx> = {
  from: GamePhase | '*';
  event: GameEvent['type'];
  guard?: (ctx: Ctx, e: GameEvent) => boolean;
  to: GamePhase | ((ctx: Ctx, e: GameEvent) => GamePhase);
  action?: (ctx: Ctx, e: GameEvent) => void;
};

/**
 * Small explicit state machine — transitions are data-driven for readability.
 * TODO: persist transition table externally if the flow grows further.
 */
export class StateMachine<Ctx> {
  private phase: GamePhase;
  private readonly transitions: Transition<Ctx>[];

  constructor(initial: GamePhase, transitions: Transition<Ctx>[]) {
    this.phase = initial;
    this.transitions = transitions;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  dispatch(ctx: Ctx, event: GameEvent): GamePhase {
    for (const t of this.transitions) {
      if (t.event !== event.type) continue;
      if (t.from !== '*' && t.from !== this.phase) continue;
      if (t.guard && !t.guard(ctx, event)) continue;
      const next = typeof t.to === 'function' ? t.to(ctx, event) : t.to;
      this.phase = next;
      t.action?.(ctx, event);
      return this.phase;
    }
    return this.phase;
  }

  force(phase: GamePhase): void {
    this.phase = phase;
  }
}
