// Leaflet Maps Integration
let mapInstance = null;
let userMarker = null;
let restaurantMarkers = [];

// Show Map Button Click Handler
document.getElementById('showMapBtn').addEventListener('click', () => {
    console.log('Show Map button clicked');
    console.log('Restaurants data:', window.restaurantsData);

    if (!window.restaurantsData || window.restaurantsData.length === 0) {
        showError('No restaurants to display on map');
        return;
    }

    // Show map container
    document.getElementById('restaurantMapContainer').style.display = 'block';

    // Initialize map after container is visible
    setTimeout(() => {
        initializeMap();
        // Scroll to map after initialization starts
        setTimeout(() => {
            document.getElementById('restaurantMapContainer').scrollIntoView({ behavior: 'smooth' });
        }, 500);
    }, 100);
});

async function initializeMap() {
    try {
        console.log('Initializing map...');
        const mapDiv = document.getElementById('restaurantMap');

        // Clear previous markers
        restaurantMarkers.forEach(marker => marker.remove());
        restaurantMarkers = [];

        // Remove previous map instance if exists
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }

        console.log('Geocoding user address:', currentUser.address);

        // Get user location from geocoding the address
        const userLocation = await geocodeAddress(currentUser.address);

        if (!userLocation) {
            showError('Could not locate your address on the map');
            return;
        }

        console.log('User location:', userLocation);

        // Create map centered on user location
        mapInstance = L.map(mapDiv).setView([userLocation.lat, userLocation.lng], 13);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(mapInstance);

        console.log('Map created successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
        showError('Failed to initialize map: ' + error.message);
        return;
    }

    // Create custom yellow icon for user
    const yellowIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: #FBBC04; border: 3px solid #F9AB00; width: 24px; height: 24px; border-radius: 50%;"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    // Add yellow marker for user location
    if (userMarker) {
        userMarker.remove();
    }

    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: yellowIcon })
        .addTo(mapInstance)
        .bindPopup(`<div style="padding: 8px;"><strong>Your Location</strong><br/>${currentUser.address}</div>`);

    // Create custom red icon for restaurants
    const redIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: #EA4335; border: 3px solid #C5221F; width: 20px; height: 20px; border-radius: 50%;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    // Add red markers for each restaurant
    const allMarkers = [];
    allMarkers.push([userLocation.lat, userLocation.lng]);

    for (const restaurant of window.restaurantsData) {
        if (!restaurant.location) continue;

        let restaurantLocation = null;

        // Try to get coordinates from location data
        if (restaurant.location.latitude && restaurant.location.longitude) {
            restaurantLocation = {
                lat: parseFloat(restaurant.location.latitude),
                lng: parseFloat(restaurant.location.longitude)
            };
        } else if (restaurant.location.lat && restaurant.location.lng) {
            restaurantLocation = {
                lat: parseFloat(restaurant.location.lat),
                lng: parseFloat(restaurant.location.lng)
            };
        } else if (restaurant.location.address) {
            // Geocode the restaurant address
            restaurantLocation = await geocodeAddress(restaurant.location.address);
        }

        if (!restaurantLocation) continue;

        allMarkers.push([restaurantLocation.lat, restaurantLocation.lng]);

        // Calculate distance from user
        const distance = calculateDistance(userLocation, restaurantLocation);

        // Create red marker for restaurant
        const marker = L.marker([restaurantLocation.lat, restaurantLocation.lng], { icon: redIcon })
            .addTo(mapInstance)
            .bindPopup(`
                <div style="padding: 10px; max-width: 250px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #131314;">${restaurant.title}</h3>
                    <p style="margin: 4px 0; font-size: 13px; color: #5F6368;">📍 ${distance} from you</p>
                    ${restaurant.location.address ? `<p style="margin: 4px 0; font-size: 12px; color: #5F6368;">${restaurant.location.address}</p>` : ''}
                </div>
            `);

        restaurantMarkers.push(marker);
    }

    // Adjust map bounds to show all markers
    if (allMarkers.length > 1) {
        const bounds = L.latLngBounds(allMarkers);
        mapInstance.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Geocode address to coordinates using free Nominatim API
async function geocodeAddress(address) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const results = await response.json();

        if (results && results.length > 0) {
            return {
                lat: parseFloat(results[0].lat),
                lng: parseFloat(results[0].lon)
            };
        } else {
            console.error('Geocoding failed for address:', address);
            return null;
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        return null;
    }
}

// Calculate distance between two lat/lng points (in km)
function calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLng = (point2.lng - point1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Format distance
    if (distance < 1) {
        return `${Math.round(distance * 1000)}m`;
    } else {
        return `${distance.toFixed(1)}km`;
    }
}
