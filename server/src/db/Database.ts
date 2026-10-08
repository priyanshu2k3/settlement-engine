import { Pool } from 'pg';
import type {  PoolClient, QueryResult } from 'pg';
import 'dotenv/config';

class Database {
  #pool: Pool;

  constructor() {
    this.#pool = new Pool({
      user: process.env.POSTGRES_USER,
      host: process.env.POSTGRES_HOST,
      database: process.env.POSTGRES_DB,
      password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT),
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
}

export default new Database();