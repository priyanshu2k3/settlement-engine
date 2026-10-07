import type { PoolClient, QueryResult } from 'pg';
import 'dotenv/config';
declare class Database {
    #private;
    constructor();
    query(text: string, params?: unknown[]): Promise<QueryResult>;
    getClient(): Promise<PoolClient>;
    close(): Promise<void>;
}
declare const _default: Database;
export default _default;
//# sourceMappingURL=Database.d.ts.map