export { getDb, type Db } from "./client";
export { DB_PATH, STORAGE_ROOT } from "./paths";
export { nextClaimNumber } from "./claim-number";
export { getVecVersion, loadSqliteVec } from "./vec";
export { openIsolatedDb, type IsolatedDb } from "./isolated";
export * from "./queries";
export * from "./schema";
