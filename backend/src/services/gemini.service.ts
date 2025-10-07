import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

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
3. Key insights and observations
4. Any unusual or significant transactions

Format the response as clean HTML with the following structure:
- Use <h2> for the main title (e.g., "Financial Summary for [Month Year]")
- Use <h3> for section headings
- Use <ul> and <li> for lists
- Use <strong> for emphasis on numbers and important points
- Include percentages for each category

Statement Text:
${pdfText}

Provide ONLY the HTML content without markdown code blocks or backticks.`;

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
