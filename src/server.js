const app        = require('./app');
const { prisma } = require('./config/prisma');
const { registerDebtorsJob } = require('./jobs/debtorsMailer');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await prisma.$queryRaw`SELECT 1`; // verify DB connection on startup
    console.log('✅ Connected to MSSQL database');
    registerDebtorsJob();
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
      await prisma.$disconnect();
      server.close(() => process.exit(0));
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
