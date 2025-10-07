import { Router, Response } from 'express';

const router = Router();

// Public config endpoint — only exposes values that must be public in the browser
router.get('/', (_req, res: Response): void => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || '';
  const provider = (process.env.MAPS_PROVIDER || 'auto').toLowerCase(); // 'google' | 'leaflet' | 'auto'
  res.status(200).json({
    googleMapsApiKey: mapsKey,
    mapsProvider: provider,
  });
});

export default router;
