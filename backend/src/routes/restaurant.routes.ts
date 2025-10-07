import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { searchRestaurants } from '../services/apify.service';

const router = Router();

// Search restaurants endpoint
router.post('/search', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { query, address } = req.body;

    if (!query) {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    if (!address) {
      res.status(400).json({ error: 'Address is required. Please update your profile with your address.' });
      return;
    }

    // Search restaurants using Apify
    const restaurants = await searchRestaurants({
      query,
      address,
      locale: 'en-CA',
      maxRows: 3
    });

    res.status(200).json({
      success: true,
      query,
      address,
      count: restaurants.length,
      restaurants
    });
  } catch (error) {
    console.error('Restaurant search error:', error);
    res.status(500).json({ error: 'Failed to search restaurants' });
  }
});

export default router;
