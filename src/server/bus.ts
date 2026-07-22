import { EventEmitter } from 'node:events';

// Emits ('game:<gameId>', GameSnapshot) after every successful mutation.
export const bus = new EventEmitter();
// Every connected display (host/contestant/stage/console) subscribes to this
// same emitter via the SSE stream route, so the listener count scales with
// concurrent viewers rather than a fixed small number — disable Node's
// default 10-listener warning threshold instead of setting an arbitrary cap.
bus.setMaxListeners(0);
