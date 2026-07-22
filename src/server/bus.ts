import { EventEmitter } from 'node:events';

// Emits ('game:<gameId>', GameSnapshot) after every successful mutation.
export const bus = new EventEmitter();
