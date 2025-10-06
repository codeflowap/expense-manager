import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export const analyzeExpenseStatement = async (pdfText: string): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

    return htmlContent;
  } catch (error) {
    console.error('Error analyzing with Gemini:', error);
    throw new Error('Failed to analyze statement with AI');
  }
};
