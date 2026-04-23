import type { GamePhase } from './types.js';

/** Minimal event shape for the unused `StateMachine` helper. */
export type PhaseDispatchEvent = { type: string };

export type Transition<Ctx, E extends PhaseDispatchEvent = PhaseDispatchEvent> = {
  from: GamePhase | '*';
  event: E['type'];
  guard?: (ctx: Ctx, e: E) => boolean;
  to: GamePhase | ((ctx: Ctx, e: E) => GamePhase);
  action?: (ctx: Ctx, e: E) => void;
};

/**
 * Small explicit state machine — transitions are data-driven for readability.
 * TODO: persist transition table externally if the flow grows further.
 */
export class StateMachine<Ctx, E extends PhaseDispatchEvent = PhaseDispatchEvent> {
  private phase: GamePhase;
  private readonly transitions: Transition<Ctx, E>[];

  constructor(initial: GamePhase, transitions: Transition<Ctx, E>[]) {
    this.phase = initial;
    this.transitions = transitions;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  dispatch(ctx: Ctx, event: E): GamePhase {
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
