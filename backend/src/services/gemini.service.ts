import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Use a dedicated key for Gemini to avoid collisions with Google Maps keys
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

export const analyzeExpenseStatement = async (pdfText: string): Promise<string> => {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Gemini analysis attempt ${attempt}/${maxRetries}...`);

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `You are an AI financial analyst. Analyze the following credit card or bank statement and provide a comprehensive financial summary in HTML format.

Please provide:
1. Total spending amount
2. Spending breakdown by category (Groceries, Entertainment, Utilities, Shopping, Transportation, Dining, etc.)
3. Coffee Spending: include a dedicated section titled "Coffee Spending" with:
   - Total spent on coffee/cafe/coffee-shops across the entire statement
   - Breakdown by merchant (e.g., Starbucks, Tim Hortons, McDonald's coffee, Dunkin, Peet's, Costa, Second Cup, Cafe, Coffee Shop). Sum line-items for these merchants even if they appear under Dining.
4. Key insights and observations
5. Any unusual or significant transactions

Formatting requirements (MUST follow exactly):
- Use <h2> for the main title (e.g., "Financial Summary for [Month Year]")
- Use <h3> for section headings
- Use <ul> and <li> for lists
- Use <strong> for emphasis on numbers and important points
- Include percentages for each category
- After the visible HTML, include a hidden JSON block with id="coffee-summary" that contains only a JSON object with fields:
  {"coffeeSpend": number, "merchants": [{"name": string, "amount": number}]}
  Render it exactly as: <script id="coffee-summary" type="application/json">{...}</script>

Statement Text:
${pdfText}

Provide ONLY the HTML content (no markdown code fences).`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      let htmlContent = response.text();

      // Clean up the response - remove markdown code blocks if present
      htmlContent = htmlContent.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

      console.log(`Gemini analysis succeeded on attempt ${attempt}`);
      return htmlContent;
    } catch (error) {
      lastError = error as Error;
      console.error(`Gemini analysis attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff: 1s, 2s, 4s)
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // All retries failed
  console.error('All Gemini analysis attempts failed');
  throw new Error(`Failed to analyze statement with AI after ${maxRetries} attempts: ${lastError?.message}`);
};

export interface DailySpending {
  day: number;
  amount: number;
}

export const analyzeDailySpending = async (pdfText: string): Promise<DailySpending[]> => {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Gemini daily spending analysis attempt ${attempt}/${maxRetries}...`);

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `You are an AI financial analyst. Analyze the following credit card or bank statement and extract daily spending aggregated by day of the month.

Extract all transactions and sum the spending amounts for each day of the month. Return ONLY a JSON array with the following structure:
[
  {"day": 1, "amount": 125.50},
  {"day": 2, "amount": 45.20},
  {"day": 3, "amount": 0},
  ...
]

Important:
- "day" is the day of the month (1-31)
- "amount" is the total spending in dollars for that day
- Include all days from 1 to the last day mentioned in the statement, even if amount is 0
- Return ONLY valid JSON, no markdown, no code blocks, no explanation

Statement Text:
${pdfText}`;

      const result = await model.generateContent(prompt);
      const response = result.response;
      let jsonContent = response.text();

      // Clean up the response - remove markdown code blocks if present
      jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Parse JSON
      const dailySpending: DailySpending[] = JSON.parse(jsonContent);

      console.log(`Gemini daily spending analysis succeeded on attempt ${attempt}`);
      return dailySpending;
    } catch (error) {
      lastError = error as Error;
      console.error(`Gemini daily spending analysis attempt ${attempt}/${maxRetries} failed:`, error);

      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // All retries failed
  console.error('All Gemini daily spending analysis attempts failed');
  throw new Error(`Failed to analyze daily spending with AI after ${maxRetries} attempts: ${lastError?.message}`);
};

// Recommendation types
export interface MenuItemInput {
  name: string;
  price: number;
}

export interface MenuRestaurantInput {
  name: string;
  items: MenuItemInput[];
}

export interface CoffeeRecommendationAllocation {
  restaurant: string;
  items: MenuItemInput[];
  subtotal: number;
}

export interface CoffeeRecommendationResult {
  coffeeSpend: number;
  allocations: CoffeeRecommendationAllocation[];
  notes?: string;
}

export const recommendCoffeeAlternatives = async (
  analysisHtml: string,
  restaurants: MenuRestaurantInput[],
  coffeeSpendHint?: number
): Promise<CoffeeRecommendationResult> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // Keep payload compact and safe
    const menuJson = JSON.stringify(restaurants).slice(0, 200_000); // guard against oversized prompts
    const restaurantCount = Array.isArray(restaurants) ? restaurants.length : 0;
    const restaurantNames = (restaurants || []).map(r => r?.name).filter(Boolean).slice(0, 10).join(', ');

    const hintLine = (typeof coffeeSpendHint === 'number' && coffeeSpendHint > 0)
      ? `Detected coffee spend (hint): $${coffeeSpendHint.toFixed(2)}. Use this value as authoritative if present.`
      : 'If you can infer a single total amount spent on coffee/cafe/coffee-shops from the input, use it.';

    const prompt = `You are an assistant helping a user re-allocate their spending.

Input A is the user's statement analysis in HTML. From it, determine the total amount spent on coffee/cafe/coffee-shops (combine line items such as coffee, cafe, Starbucks, Tim Hortons, etc.).

Input B is a list of restaurants with their menu items and numeric prices in dollars.

There are exactly ${restaurantCount} restaurants available: ${restaurantNames}.

Task:
- Recommend a basket of menu items (each priced at least $25) drawn from ACROSS THE PROVIDED RESTAURANTS to best match the coffee spend.
- By default, use ALL ${restaurantCount} restaurants: include at least one item from EACH restaurant (${restaurantNames}).
- If using all restaurants cannot get within $1 of the coffee spend due to menu constraints, clearly state this in notes and fall back to using 2 restaurants; if still impossible, fall back to a single restaurant as a last resort.
- Systematically search combinations while prioritizing the option that MINIMIZES |sum - coffeeSpend|.
- If an exact match is not possible, target the closest value; break ties by preferring (1) smaller absolute difference, then (2) slight undershoot over overshoot, then (3) fewer restaurants, then (4) fewer items.
- Avoid duplicates unless multiples are reasonable (it is OK to buy the same item multiple times if needed).
- Use only the provided menu items and prices.

${hintLine}

Return ONLY valid JSON with this exact structure:
{
  "coffeeSpend": number,              // detected coffee spend in dollars
  "allocations": [                    // 1–3 entries
    {
      "restaurant": string,
      "items": [ { "name": string, "price": number } ],
      "subtotal": number
    }
  ],
  "notes": string
}

If you cannot find coffee spend, set coffeeSpend to 0 and allocations to [].

Input A (HTML):\n${analysisHtml}\n
Input B (restaurants JSON):\n${menuJson}`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    // Strip accidental code fences
    text = text.replace(/```json\n?|```/g, '').trim();

    try {
      const parsed = JSON.parse(text);
      // Minimal shape validation
      if (typeof parsed.coffeeSpend !== 'number' || !Array.isArray(parsed.allocations)) {
        throw new Error('Invalid JSON shape from model');
      }
      return parsed as CoffeeRecommendationResult;
    } catch (e) {
      console.error('Failed to parse recommendations JSON:', e, text);
      // Return safe fallback
      return { coffeeSpend: 0, allocations: [], notes: 'Could not derive recommendations.' };
    }
  } catch (err: any) {
    console.error('Gemini recommendation error:', err?.message || err);
    return { coffeeSpend: 0, allocations: [], notes: 'Recommendation model unavailable.' };
  }
};
