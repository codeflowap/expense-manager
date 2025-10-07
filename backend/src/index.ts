import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './prisma';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import webhookRoutes from './routes/webhook.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for PDF uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (frontend)
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', documentRoutes);
app.use('/api/webhook', webhookRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get list of images in public/images folder
app.get('/api/images', (req, res) => {
  const imagesPath = path.join(publicPath, 'images');

  fs.readdir(imagesPath, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read images directory' });
    }

    // Filter for image files
    const imageFiles = files.filter(file =>
      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file)
    );

    res.json({ images: imageFiles });
  });
});

// Root endpoint - serve index.html
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: publicPath });
});

// Initialize database and start server
const startServer = async () => {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
