// API Base URL
const API_URL = 'http://localhost:3000/api';

// State management
let authToken = localStorage.getItem('authToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let pollInterval = null;
let selectedFile = null;
let lastVisitedPage = 'dashboardPage'; // Track where user came from

// DOM Elements
const pages = {
    login: document.getElementById('loginPage'),
    register: document.getElementById('registerPage'),
    forgotPassword: document.getElementById('forgotPasswordPage'),
    dashboard: document.getElementById('dashboardPage'),
    loading: document.getElementById('loadingPage'),
    inbox: document.getElementById('inboxPage'),
    result: document.getElementById('resultPage'),
    restaurants: document.getElementById('restaurantsPage')
};

const inboxIcon = document.getElementById('inboxIcon');
const notificationBadge = document.getElementById('notificationBadge');
const userProfile = document.getElementById('userProfile');
const userName = document.getElementById('userName');

// Utility Functions
function showPage(pageName) {
    Object.values(pages).forEach(page => page.classList.remove('active'));
    pages[pageName].classList.add('active');
    if (pageName !== 'inbox' && pageName !== 'result' && pageName !== 'loading') {
        lastVisitedPage = pageName + 'Page';
    }
}

// Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? '✓' : '✕';
    const title = type === 'success' ? 'Success' : 'Error';

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">×</button>
    `;

    container.appendChild(toast);

    // Close button
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    // Auto-remove after 5 seconds
    setTimeout(() => removeToast(toast), 5000);
}

function removeToast(toast) {
    toast.classList.add('hiding');
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 300);
}

function showError(message) {
    showToast(message, 'error');
}

function showSuccess(message) {
    showToast(message, 'success');
}

async function apiCall(endpoint, options = {}) {
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    if (authToken && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'An error occurred');
    }

    return data;
}

// Authentication
function updateUIForAuth() {
    if (authToken && currentUser) {
        showPage('dashboard');
        inboxIcon.classList.remove('hidden');
        userProfile.classList.remove('hidden');

        // Update username display (show name if available, otherwise email)
        userName.textContent = currentUser.name || currentUser.email.split('@')[0];

        // Update avatar if user has custom avatar
        const userAvatar = document.getElementById('userAvatar');
        const profileDropdownAvatar = document.getElementById('profileDropdownAvatar');
        const avatarSrc = currentUser.avatarUrl || 'https://i.pravatar.cc/40';
        userAvatar.src = avatarSrc;
        profileDropdownAvatar.src = avatarSrc.replace('40', '80');

        // Update profile form fields
        document.getElementById('profileName').value = currentUser.name || '';
        document.getElementById('profileAddress').value = currentUser.address || '';

        startPolling();
    } else {
        showPage('login');
        inboxIcon.classList.add('hidden');
        userProfile.classList.add('hidden');
        stopPolling();
    }
}

document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showError('Please enter email and password');
        return;
    }

    try {
        const data = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateUIForAuth();
    } catch (error) {
        showError(error.message);
    }
});

document.getElementById('registerBtn').addEventListener('click', async () => {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;

    if (!email || !password) {
        showError('Please enter email and password');
        return;
    }

    try {
        const data = await apiCall('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showSuccess('Registration successful!');
        updateUIForAuth();
    } catch (error) {
        showError(error.message);
    }
});

document.getElementById('showRegisterBtn').addEventListener('click', () => showPage('register'));
document.getElementById('showLoginBtn').addEventListener('click', () => showPage('login'));
document.getElementById('showForgotPasswordBtn').addEventListener('click', () => showPage('forgotPassword'));
document.getElementById('backToLoginBtn').addEventListener('click', () => showPage('login'));

// Forgot Password / Reset Password
document.getElementById('resetPasswordBtn').addEventListener('click', async () => {
    const email = document.getElementById('resetEmail').value.trim();
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!email || !newPassword || !confirmPassword) {
        showError('Please fill in all fields');
        return;
    }

    if (newPassword !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    if (newPassword.length < 6) {
        showError('Password must be at least 6 characters');
        return;
    }

    try {
        const data = await apiCall('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email, newPassword })
        });

        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showSuccess('Password reset successfully! You are now logged in.');
        updateUIForAuth();
    } catch (error) {
        showError(error.message);
    }
});

// File Upload
const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const uploadPrompt = document.getElementById('upload-prompt');
const uploadStatus = document.getElementById('upload-status');
const loadingState = document.getElementById('loading-state');
const successState = document.getElementById('success-state');
const fileNameDisplay = document.getElementById('file-name-display');
const submitBtn = document.getElementById('submitBtn');

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('hover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('hover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('hover');
    if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelection();
    }
});

fileInput.addEventListener('change', handleFileSelection);

function handleFileSelection() {
    if (fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        uploadPrompt.style.display = 'none';
        uploadStatus.style.display = 'block';
        loadingState.classList.remove('hidden');
        successState.classList.add('hidden');
        fileNameDisplay.textContent = selectedFile.name;
        submitBtn.disabled = true;

        setTimeout(() => {
            loadingState.classList.add('hidden');
            successState.classList.remove('hidden');
            submitBtn.disabled = false;
        }, 1000);
    }
}

submitBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    showPage('loading');

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        // Show result
        document.getElementById('resultsContainer').innerHTML = data.analysis;

        // Render daily spending chart
        if (data.dailySpending && data.dailySpending.length > 0) {
            renderDailySpendingChart(data.dailySpending);
        }

        showPage('result');

        // Reset upload form
        resetUploadForm();
        updateInboxCount();
    } catch (error) {
        showError(error.message);
        showPage('dashboard');
    }
});

function resetUploadForm() {
    selectedFile = null;
    fileInput.value = '';
    uploadPrompt.style.display = 'block';
    uploadStatus.style.display = 'none';
    submitBtn.disabled = true;
}

// Gmail Fetch Button
document.getElementById('gmailFetchBtn').addEventListener('click', async () => {
    showPage('loading');

    try {
        const data = await apiCall('/process-latest', {
            method: 'POST'
        });

        // Show result
        document.getElementById('resultsContainer').innerHTML = data.analysis;

        // Render daily spending chart
        if (data.dailySpending && data.dailySpending.length > 0) {
            renderDailySpendingChart(data.dailySpending);
        }

        showPage('result');
        updateInboxCount();
    } catch (error) {
        showError(error.message);
        showPage('dashboard');
    }
});

// Inbox
inboxIcon.addEventListener('click', async () => {
    showPage('loading');
    await loadInbox();
    showPage('inbox');
});

async function loadInbox() {
    try {
        const data = await apiCall('/inbox');
        const tbody = document.getElementById('inboxTableBody');
        tbody.innerHTML = '';

        if (data.documents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--gemini-gray);">No documents found</td></tr>';
            return;
        }

        data.documents.forEach(doc => {
            const row = document.createElement('tr');
            const date = new Date(doc.receivedAt).toLocaleString();

            row.innerHTML = `
                <td>${doc.filename}</td>
                <td>${date}</td>
                <td style="text-transform: capitalize;">${doc.source}</td>
                <td>
                    <span class="status-badge ${doc.processed ? 'status-processed' : 'status-pending'}">
                        ${doc.processed ? 'Processed' : 'Pending'}
                    </span>
                </td>
                <td>
                    ${doc.processed
                        ? `<button class="btn btn-success btn-small" onclick="viewResult('${doc.id}')">Check Result</button>`
                        : `<button class="btn btn-primary btn-small" onclick="processDocument('${doc.id}')">Process</button>`
                    }
                </td>
            `;

            tbody.appendChild(row);
        });
    } catch (error) {
        showError('Failed to load inbox: ' + error.message);
    }
}

window.processDocument = async function(docId) {
    showPage('loading');

    try {
        const data = await apiCall(`/process/${docId}`, {
            method: 'POST'
        });

        document.getElementById('resultsContainer').innerHTML = data.analysis;

        // Render daily spending chart
        if (data.dailySpending && data.dailySpending.length > 0) {
            renderDailySpendingChart(data.dailySpending);
        }

        showPage('result');
        updateInboxCount();
    } catch (error) {
        showError(error.message);
        showPage('inbox');
    }
};

window.viewResult = async function(docId) {
    showPage('loading');

    try {
        const data = await apiCall(`/result/${docId}`);
        document.getElementById('resultsContainer').innerHTML = data.analysis;

        // Render daily spending chart
        if (data.dailySpending && data.dailySpending.length > 0) {
            renderDailySpendingChart(data.dailySpending);
        }

        showPage('result');
    } catch (error) {
        showError(error.message);
        showPage('inbox');
    }
};

// Navigation
document.getElementById('backFromInbox').addEventListener('click', () => {
    showPage('dashboard');
});

document.getElementById('backFromResult').addEventListener('click', () => {
    showPage(lastVisitedPage.replace('Page', ''));
});

document.getElementById('backFromRestaurants').addEventListener('click', () => {
    showPage('dashboard');
});

// Polling for unread count
async function updateInboxCount() {
    try {
        const data = await apiCall('/inbox/unread-count');
        const count = data.unreadCount;

        if (count > 0) {
            notificationBadge.textContent = count;
            notificationBadge.classList.add('active');
        } else {
            notificationBadge.classList.remove('active');
        }
    } catch (error) {
        console.error('Failed to update inbox count:', error);
    }
}

function startPolling() {
    if (pollInterval) return;
    updateInboxCount();
    pollInterval = setInterval(updateInboxCount, 10000); // Poll every 10 seconds
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

// Daily Spending Chart
let dailySpendingChartInstance = null;

function renderDailySpendingChart(dailySpending) {
    const chartContainer = document.getElementById('chartContainer');
    const canvas = document.getElementById('dailySpendingChart');

    // Show chart container
    chartContainer.style.display = 'block';

    // Destroy previous chart instance if exists
    if (dailySpendingChartInstance) {
        dailySpendingChartInstance.destroy();
    }

    // Prepare data
    const days = dailySpending.map(d => d.day);
    const amounts = dailySpending.map(d => d.amount);

    // Create gradient
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, '#4285F4');
    gradient.addColorStop(0.5, '#34A853');
    gradient.addColorStop(1, '#FBBC04');

    // Create chart
    dailySpendingChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                label: 'Daily Spending ($)',
                data: amounts,
                backgroundColor: gradient,
                borderColor: '#4285F4',
                borderWidth: 2,
                borderRadius: 8,
                barThickness: 'flex',
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            family: 'Poppins',
                            size: 14,
                            weight: '500'
                        },
                        color: '#131314',
                        padding: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(19, 19, 20, 0.9)',
                    titleFont: {
                        family: 'Poppins',
                        size: 14,
                        weight: '600'
                    },
                    bodyFont: {
                        family: 'Poppins',
                        size: 13
                    },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return 'Spending: $' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            family: 'Poppins',
                            size: 12
                        },
                        color: '#5F6368'
                    },
                    title: {
                        display: true,
                        text: 'Day of Month',
                        font: {
                            family: 'Poppins',
                            size: 14,
                            weight: '600'
                        },
                        color: '#131314',
                        padding: 10
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#E8EAED',
                        lineWidth: 1
                    },
                    ticks: {
                        font: {
                            family: 'Poppins',
                            size: 12
                        },
                        color: '#5F6368',
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        }
                    },
                    title: {
                        display: true,
                        text: 'Spending Amount ($)',
                        font: {
                            family: 'Poppins',
                            size: 14,
                            weight: '600'
                        },
                        color: '#131314',
                        padding: 10
                    }
                }
            }
        }
    });
}

// Avatar Upload Functionality
const avatarInput = document.getElementById('avatarInput');
const userAvatar = document.getElementById('userAvatar');

// Click avatar to trigger file input
userAvatar.addEventListener('click', () => {
    if (authToken && currentUser) {
        avatarInput.click();
    }
});

// Handle avatar file selection
avatarInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showError('Please select an image file');
        return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showError('Image size must be less than 5MB');
        return;
    }

    try {
        // Convert to base64/data URL
        const reader = new FileReader();
        reader.onload = async (event) => {
            const avatarUrl = event.target.result;

            // Update avatar via API
            const data = await apiCall('/auth/update-avatar', {
                method: 'POST',
                body: JSON.stringify({
                    email: currentUser.email,
                    avatarUrl: avatarUrl
                })
            });

            // Update local state
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            // Update displayed avatars
            userAvatar.src = avatarUrl;
            document.getElementById('profileDropdownAvatar').src = avatarUrl;
            showSuccess('Avatar updated successfully!');
        };
        reader.readAsDataURL(file);
    } catch (error) {
        showError('Failed to update avatar: ' + error.message);
    }

    // Clear file input
    avatarInput.value = '';
});

// Profile Dropdown Toggle
const profileDropdown = document.getElementById('profileDropdown');
const userNameElement = document.getElementById('userName');

userNameElement.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('show');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!profileDropdown.contains(e.target) && !userNameElement.contains(e.target)) {
        profileDropdown.classList.remove('show');
    }
});

// Profile Dropdown Avatar Click - Trigger Avatar Upload
document.getElementById('profileDropdownAvatar').addEventListener('click', () => {
    avatarInput.click();
});

// Save Profile Button
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const name = document.getElementById('profileName').value.trim();
    const address = document.getElementById('profileAddress').value.trim();

    try {
        const data = await apiCall('/auth/update-profile', {
            method: 'POST',
            body: JSON.stringify({
                email: currentUser.email,
                name,
                address
            })
        });

        // Update current user
        currentUser = data.user;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Update UI
        updateUIForAuth();

        // Close dropdown
        profileDropdown.classList.remove('show');

        showSuccess('Profile updated successfully!');
    } catch (error) {
        showError('Failed to update profile: ' + error.message);
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    // Clear authentication data
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');

    // Update UI
    updateUIForAuth();

    showSuccess('Logged out successfully!');
});

// Display Restaurant Results
function displayRestaurantResults(data) {
    console.log('Restaurant search results:', data);

    // Update title
    document.getElementById('restaurantSearchTitle').textContent = `${data.query} Restaurants near you`;

    // Populate table
    const tbody = document.getElementById('restaurantsTableBody');
    tbody.innerHTML = '';

    if (!data.restaurants || data.restaurants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--gemini-gray);">No restaurants found</td></tr>';
        showPage('restaurants');
        return;
    }

    data.restaurants.forEach(restaurant => {
        const row = document.createElement('tr');

        // Image
        const imgSrc = restaurant.heroImageUrl || 'https://via.placeholder.com/80';

        // Categories
        const categories = Array.isArray(restaurant.categories)
            ? restaurant.categories.slice(0, 3).join(', ')
            : (restaurant.categories || 'N/A');

        row.innerHTML = `
            <td><img src="${imgSrc}" class="restaurant-img" alt="${restaurant.title}"></td>
            <td><strong>${restaurant.title || 'Unknown'}</strong></td>
            <td>${categories}</td>
            <td>${restaurant.menu ? 'Available' : 'N/A'}</td>
            <td>${restaurant.storeReviews ? 'Available' : 'N/A'}</td>
            <td>${restaurant.location?.address || 'N/A'}</td>
        `;

        tbody.appendChild(row);
    });

    showPage('restaurants');
    showSuccess(`Found ${data.count} restaurants for "${data.query}"`);
}

// Search Restaurants
async function searchRestaurants(query) {
    // Check if user has address
    if (!currentUser || !currentUser.address) {
        showError('Please update your address in your profile before searching for restaurants');
        // Open profile dropdown
        document.getElementById('profileDropdown').classList.add('show');
        return;
    }

    showPage('loading');

    try {
        const data = await apiCall('/restaurants/search', {
            method: 'POST',
            body: JSON.stringify({
                query,
                address: currentUser.address
            })
        });

        // Store search results and show results page
        displayRestaurantResults(data);
    } catch (error) {
        showError(error.message);
        showPage('dashboard');
    }
}

// Load Food Gallery Images
async function loadFoodGallery() {
    try {
        const response = await fetch('/api/images');
        const data = await response.json();

        if (!data.images || data.images.length === 0) {
            return;
        }

        const gallery = document.getElementById('foodGallery');
        gallery.innerHTML = '';

        // Shuffle images for random distribution
        const shuffledImages = data.images.sort(() => Math.random() - 0.5);

        shuffledImages.forEach(filename => {
            const img = document.createElement('img');
            img.src = `images/${filename}`;
            const foodName = filename.replace(/\.[^/.]+$/, ''); // Remove extension
            img.alt = foodName;
            img.className = 'food-item';

            // Add click handler to search for restaurants
            img.addEventListener('click', () => searchRestaurants(foodName));

            gallery.appendChild(img);
        });
    } catch (error) {
        console.error('Failed to load food gallery:', error);
    }
}

// Initialize
updateUIForAuth();
loadFoodGallery();
