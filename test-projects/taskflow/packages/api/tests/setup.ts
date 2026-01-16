import { beforeAll, afterAll, beforeEach } from 'vitest';

import { db, closeDatabase } from '../src/db/connection.js';
import { createTables } from '../src/db/schema.js';

beforeAll(() => {
  createTables();
});

beforeEach(() => {
  // Clear all tasks before each test
  db.exec('DELETE FROM tasks');
});

afterAll(() => {
  closeDatabase();
});
