import { Pool } from 'pg';
import type {  PoolClient, QueryResult } from 'pg';
import "../config.js";
import { POSTGRES_DB, POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_PORT, POSTGRES_USER } from "../config.js";

class Database {
  #pool: Pool;

  constructor() {
    this.#pool = new Pool({
      user: POSTGRES_USER,
      host: POSTGRES_HOST,
      database: POSTGRES_DB,
      password: POSTGRES_PASSWORD,
      port: POSTGRES_PORT,
      max: 1,
    });

    this.#initializeListeners();
  }

  #initializeListeners(): void {
    this.#pool.on('connect', () => {
      console.log('Successfully connected to the PostgreSQL database.');
    });

    this.#pool.on('error', (err: Error) => {
      console.error(
        'Unexpected error on idle PostgreSQL client:',
        err
      );
    });
  }

  async query(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult> {
    try {
      return await this.#pool.query(text, params);
    } catch (error) {
      console.error(
        `Database Query Error: ${
          error instanceof Error ? error.message : error
        }`
      );

      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.#pool.connect();
  }

  async close(): Promise<void> {
    console.log('Closing database connection pool...');
    await this.#pool.end();
  }

  poolStats() {
    return {
      total: this.#pool.totalCount,
      idle: this.#pool.idleCount,
      waiting: this.#pool.waitingCount,
      max: this.#pool.options.max ?? 10,
    };
  }
}

export default new Database();
