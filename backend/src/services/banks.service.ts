import axios from 'axios';

export interface Bank {
  name: string;
  address: string;
  phone: string;
  rating: number;
  workingHours: string[];
}

/**
 * Search for banks near a given address using Google Places API
 */
export async function searchNearbyBanks(address: string, maxResults: number = 3): Promise<Bank[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    // Step 1: Geocode the address to get lat/lng
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const geocodeResponse = await axios.get(geocodeUrl);

    if (!geocodeResponse.data.results || geocodeResponse.data.results.length === 0) {
      throw new Error('Could not geocode address');
    }

    const location = geocodeResponse.data.results[0].geometry.location;
    const lat = location.lat;
    const lng = location.lng;

    // Step 2: Search for banks using Places API Nearby Search
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=bank&key=${apiKey}`;
    const placesResponse = await axios.get(placesUrl);

    if (!placesResponse.data.results || placesResponse.data.results.length === 0) {
      return [];
    }

    // Step 3: Get details for each bank (for phone and hours)
    const banks: Bank[] = [];
    const results = placesResponse.data.results.slice(0, maxResults);

    for (const place of results) {
      const placeId = place.place_id;
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,rating,opening_hours&key=${apiKey}`;

      try {
        const detailsResponse = await axios.get(detailsUrl);
        const details = detailsResponse.data.result;

        banks.push({
          name: details.name || 'N/A',
          address: details.formatted_address || 'N/A',
          phone: details.formatted_phone_number || 'N/A',
          rating: details.rating || 0,
          workingHours: details.opening_hours?.weekday_text || []
        });
      } catch (error) {
        console.error(`Failed to get details for place ${placeId}:`, error);
        // Add basic info if details fetch fails
        banks.push({
          name: place.name || 'N/A',
          address: place.vicinity || 'N/A',
          phone: 'N/A',
          rating: place.rating || 0,
          workingHours: []
        });
      }
    }

    return banks;
  } catch (error: any) {
    console.error('Error searching for banks:', error.message);
    throw new Error('Failed to search for banks');
  }
}
