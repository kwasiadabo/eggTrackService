const express        = require('express');
const cors           = require('cors');
const swaggerUi      = require('swagger-ui-express');
const swaggerSpec    = require('./config/swagger');
require('dotenv').config();

const routes     = require('./routes');
const authRoutes = require('./routes/auth');
const { errorHandler, notFound } = require('./middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Swagger UI ────────────────────────────────────────────
const swaggerUiOptions = {
  customSiteTitle: '🥚 EggTrack API Docs',
  customCss: `
    .swagger-ui .topbar { background: #3d2008; }
    .swagger-ui .topbar .download-url-wrapper { display: none; }
    .swagger-ui .info .title { color: #3d2008; }
    .swagger-ui .btn.execute  { background: #d4750a; border-color: #d4750a; }
    .swagger-ui .btn.execute:hover { background: #9a5208; }
    .swagger-ui .opblock.opblock-post   .opblock-summary-method { background: #d4750a; }
    .swagger-ui .opblock.opblock-get    .opblock-summary-method { background: #2e7d32; }
    .swagger-ui .opblock.opblock-put    .opblock-summary-method { background: #1565c0; }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #c62828; }
    .swagger-ui .opblock.opblock-patch  .opblock-summary-method { background: #6a1b9a; }
  `,
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'list',
    filter: true,
    tryItOutEnabled: true,
  },
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ─── Health check ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), docs: '/api-docs' });
});

// ─── API Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);   // public auth routes (login, refresh, logout)
app.use('/api', routes);            // protected business routes

// ─── 404 / Error handlers ──────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
