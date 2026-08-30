require('dotenv').config();
const app = require('./app');
const { initializeDatabase } = require('./database/db');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await initializeDatabase();
    console.log('✅ Database initialized');

    app.listen(PORT, () => {
      console.log(`🚀 Waste Segregation API running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌱 Ready to help segregate waste!`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
