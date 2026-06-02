const app        = require('./app');
const { getPool, closePool } = require('./config/database');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await getPool(); // verify DB connection on startup
    const server = app.listen(PORT, () => {
      console.log('');
      console.log('🥚  EggTrack API is running!');
      console.log(`📡  Base URL  : http://localhost:${PORT}`);
      console.log(`📖  API Docs  : http://localhost:${PORT}/api-docs`);
      console.log(`📄  OpenAPI   : http://localhost:${PORT}/api-docs.json`);
      console.log('');
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down gracefully…');
      await closePool();
      server.close(() => process.exit(0));
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
