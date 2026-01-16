import cors from 'cors';
import express, { Express } from 'express';

const app: Express = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Placeholder for task routes (added in Phase 2)
app.get('/api/tasks', (_req, res) => {
  res.json({ data: [], message: 'Task routes not yet implemented' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on port ${PORT}`);
});

export { app };
