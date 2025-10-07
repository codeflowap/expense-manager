import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { searchNearbyBanks } from '../services/banks.service';

const router = Router();

// Search nearby banks endpoint
router.post('/search', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { address } = req.body;

    if (!address) {
      res.status(400).json({ error: 'Address is required. Please update your profile with your address.' });
      return;
    }

    // Search for nearby banks using Google Places API
    const banks = await searchNearbyBanks(address, 3);

    res.status(200).json({
      success: true,
      address,
      count: banks.length,
      banks
    });
  } catch (error) {
    console.error('Bank search error:', error);
    res.status(500).json({ error: 'Failed to search for banks' });
  }
});

export default router;
