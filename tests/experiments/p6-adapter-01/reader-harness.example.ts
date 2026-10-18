// Consumer integration skeleton. No authentication, authorization or PostgreSQL transaction is implemented here.
import type {ReaderHarnessFactory} from './reader.js';
export const createHarness:ReaderHarnessFactory=async fixture=>{
 // After approval: install fixture.scope/receipt/publication and explicit segment grants in an isolated test database;
 // provide your trusted Reader, opaque session, control('revoke'|'revoke-without-epoch'), metrics and teardown.
 throw new Error('REVIEW_READY only: real Reader test factory is not implemented; fixture '+fixture.id);
};
