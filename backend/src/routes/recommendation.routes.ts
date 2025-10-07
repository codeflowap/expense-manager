import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { recommendCoffeeAlternatives, MenuRestaurantInput } from '../services/gemini.service';

const router = Router();

// Generate coffee reallocation recommendations
router.post('/coffee', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { analysisHtml, restaurants } = req.body as { analysisHtml?: string; restaurants?: MenuRestaurantInput[] };

    if (!analysisHtml || typeof analysisHtml !== 'string') {
      res.status(400).json({ error: 'analysisHtml is required' });
      return;
    }
    if (!Array.isArray(restaurants) || restaurants.length === 0) {
      res.status(400).json({ error: 'restaurants array with menu items is required' });
      return;
    }

    // Basic sanitization: cap restaurants/items to keep prompt small
    const trimmed = restaurants.slice(0, 10).map(r => ({
      name: String(r.name || '').slice(0, 80),
      items: (Array.isArray(r.items) ? r.items : []).slice(0, 200).map(it => ({
        name: String(it.name || '').slice(0, 120),
        price: Number(it.price) || 0,
      })).filter(it => it.price > 0)
    })).filter(r => r.items.length > 0);

    // Try to detect coffee spend directly from the analysis HTML as a hint
    const hint = extractCoffeeSpend(analysisHtml);
    const rec = await recommendCoffeeAlternatives(analysisHtml, trimmed, hint);
    res.status(200).json({ success: true, recommendations: rec });
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

export default router;

// --- Helpers ---
function extractCoffeeSpend(html: string): number | undefined {
  if (!html) return undefined;
  let text = html;
  try {
    // If includes a structured block
    const m = html.match(/<script[^>]*id=["']coffee-summary["'][^>]*>([\s\S]*?)<\/script>/i);
    if (m) {
      const obj = JSON.parse(m[1].trim());
      if (obj && typeof obj.coffeeSpend === 'number') return obj.coffeeSpend;
    }
  } catch {}

  // Strip tags for plain text scanning
  text = text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const lower = text.toLowerCase();
  const merchants = [
    'starbucks', 'tim hortons', 'timhortons', "mcdonald's", 'mcdonalds', 'dunkin', "peet's", 'peets', 'costa', 'second cup', 'coffee', 'café', 'cafe'
  ];
  const amountRegex = /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g;
  let total = 0;
  let found = false;

  // Scan line by line for better locality
  const lines = lower.split(/\n|\r|\.|;|•/);
  for (const line of lines) {
    if (!merchants.some(m => line.includes(m))) continue;
    let match;
    while ((match = amountRegex.exec(line)) !== null) {
      const amt = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amt)) {
        total += amt;
        found = true;
      }
    }
  }
  return found ? Number(total.toFixed(2)) : undefined;
}
