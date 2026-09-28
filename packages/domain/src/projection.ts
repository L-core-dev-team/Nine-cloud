import type { DomainEvent, SaveEnvelope } from '@jiuxiao/contracts';
import { replayEvents, TurnBoundaryError, type EventReducer } from './event-log.js';

// The caller must supply a reducer from the save's signed ruleset.
export function project(save: SaveEnvelope, events: readonly DomainEvent[], reduce?: EventReducer): SaveEnvelope {
  if (!reduce) throw new TurnBoundaryError('REDUCER_NOT_INSTALLED', 'No signed event reducer is installed.');
  return replayEvents(save, events, reduce);
}
