import cors from 'cors';
import express, { Express } from 'express';

import { createTables, initializeDatabase } from './db/index.js';
import taskRoutes from './routes/tasks.js';

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDatabase();
createTables();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Task routes
app.use('/api/tasks', taskRoutes);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on port ${PORT}`);
});

export { app };
