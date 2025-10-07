import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';

dotenv.config();

const client = new ApifyClient({
  token: process.env.APIFY_API_TOKEN!,
});

export interface RestaurantSearchParams {
  query: string;
  address: string;
  locale?: string;
  maxRows?: number;
}

export interface Restaurant {
  title: string;
  heroImageUrl?: string;
  categories?: string[];
  menu?: string;
  storeReviews?: any;
  location?: any;
  distance?: any;
  phoneNumber?: string;
  emails?: string[];
}

export const searchRestaurants = async (params: RestaurantSearchParams): Promise<Restaurant[]> => {
  const { query, address, locale = 'en-CA', maxRows = 3 } = params;

  try {
    console.log(`Searching restaurants: query="${query}", address="${address}"`);

    // Prepare Actor input
    const input = {
      query,
      address,
      locale,
      maxRows,
    };

    // Run the Actor with 1 minute timeout
    const run = await client.actor('nrQeUJPbeJLVVsXPH').call(input, {
      timeout: 60, // 1 minute timeout in seconds
    });

    // Fetch results from the dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log(`Found ${items.length} restaurants`);

    return items as unknown as Restaurant[];
  } catch (error) {
    console.error('Apify search error:', error);
    throw new Error('Failed to search restaurants');
  }
};
