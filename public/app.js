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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

// Modal Functions
function showModal(title, data) {
    const modal = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = title;

    // Format data based on type and content
    let content = '';

    // Helper: safely parse JSON if string
    const tryParseJson = (val) => {
        if (typeof val !== 'string') return val;
        try {
            return JSON.parse(val);
        } catch (e) {
            return val;
        }
    };

    // Helper: extract a name from various review item shapes (deep search)
    const getAuthorName = (item) => {
        if (!item || typeof item !== 'object') return '';
        const queue = [item];
        const visited = new Set();
        const nameKeys = new Set(['userName','author','name','reviewerName','user','displayName','authorName','username','fullName','eaterName']);
        while (queue.length) {
            const node = queue.shift();
            if (!node || typeof node !== 'object' || visited.has(node)) continue;
            visited.add(node);
            const first = node.firstName || node.givenName || node.first || '';
            const last = node.lastName || node.familyName || node.last || '';
            if (first || last) return `${String(first).trim()} ${String(last).trim()}`.trim();
            for (const [k, v] of Object.entries(node)) {
                if (nameKeys.has(k) && typeof v === 'string' && v.trim()) return v.trim();
                if (v && typeof v === 'object') queue.push(v);
                if (Array.isArray(v)) v.forEach(x => queue.push(x));
            }
        }
        return '';
    };

    // Helper: flatten reviews from various shapes
    const normalizeReviews = (val) => {
        const v = tryParseJson(val);
        if (Array.isArray(v)) return v;
        if (v && typeof v === 'object') {
            if (Array.isArray(v.reviews)) return v.reviews;
            if (Array.isArray(v.storeReviews)) return v.storeReviews;
            if (Array.isArray(v.featuredReviews)) return v.featuredReviews;
            if (Array.isArray(v.items)) return v.items;
            if (Array.isArray(v.results)) return v.results;
            if (v.data && Array.isArray(v.data.reviews)) return v.data.reviews;
            if (v.data && Array.isArray(v.data.items)) return v.data.items;
            for (const key of Object.keys(v)) {
                if (Array.isArray(v[key])) {
                    const arr = v[key];
                    if (arr.length && (typeof arr[0] === 'object')) return arr;
                }
            }
            return [v];
        }
        return [];
    };

    // Helper: flatten menu items from a variety of shapes
    const normalizeMenuItems = (val) => {
        const v = tryParseJson(val);
        const out = [];
        // Key sets to detect likely item objects
        const itemNameKeys = new Set(['itemName','productName','dishName','title','name','label','sectionTitle','shortName','longName','heading']);
        const itemPriceKeys = new Set(['price','priceTagline','formattedPrice','priceText','amount','value','priceCents','centAmount','cents']);

        const formatPriceValue = (value, keyHint = '') => {
            if (value == null) return '';
            // If it's already a string with currency or decimal, keep it
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) return '';
                // If it's purely digits and likely cents, normalize
                if (/^\d+$/.test(trimmed)) {
                    const num = parseInt(trimmed, 10);
                    const isCents = keyHint.toLowerCase().includes('cent') || num >= 100;
                    const dollars = isCents ? num / 100 : num;
                    return `$${dollars.toFixed(2)}`;
                }
                // Leave as-is (e.g., CA$14.95)
                return trimmed;
            }
            if (typeof value === 'number') {
                const isCents = keyHint.toLowerCase().includes('cent') || (Number.isInteger(value) && value >= 100);
                const dollars = isCents ? value / 100 : value;
                return `$${dollars.toFixed(2)}`;
            }
            if (typeof value === 'object') {
                // Common nested fields
                if (value.price != null) return formatPriceValue(value.price, 'price');
                if (value.amount != null) return formatPriceValue(value.amount, 'amount');
                if (value.value != null) return formatPriceValue(value.value, 'value');
                if (value.centAmount != null) return formatPriceValue(value.centAmount, 'centAmount');
                if (value.cents != null) return formatPriceValue(value.cents, 'cents');
                if (value.text) return String(value.text);
                if (value.formatted) return String(value.formatted);
                if (value.formattedPrice) return String(value.formattedPrice);
            }
            return '';
        };

        const extractItemFields = (obj) => {
            let name = obj.itemName || obj.title || obj.name || obj.label || obj.sectionTitle || '';
            let description = obj.itemDescription || obj.description || obj.subtitle || obj.sectionSubtitle || '';
            let price = '';
            // Prefer priceTagline if present (object or string)
            if (obj.priceTagline !== undefined) price = formatPriceValue(obj.priceTagline, 'priceTagline');
            // Fallbacks
            if (!price && obj.price !== undefined) price = formatPriceValue(obj.price, 'price');
            if (!price && obj.formattedPrice !== undefined) price = formatPriceValue(obj.formattedPrice, 'formattedPrice');
            if (!price && obj.priceText !== undefined) price = formatPriceValue(obj.priceText, 'priceText');

            if (!name || !description || !price) {
                const queue = [obj];
                const visited = new Set();
                const nameKeys = new Set(['itemName','productName','dishName','title','name','label','sectionTitle','shortName','longName','heading']);
                const descKeys = new Set(['itemDescription','description','subtitle','sectionSubtitle','details','summary','body','note']);
                const priceKeys = new Set(['price','priceTagline','formattedPrice','priceText','amount','value','priceCents']);
                while (queue.length) {
                    const node = queue.shift();
                    if (!node || typeof node !== 'object' || visited.has(node)) continue;
                    visited.add(node);
                    for (const [k, v] of Object.entries(node)) {
                        if (!name && nameKeys.has(k) && typeof v === 'string' && v.trim()) name = v.trim();
                        if (!description && descKeys.has(k) && typeof v === 'string' && v.trim()) description = v.trim();
                        if (!price && priceKeys.has(k)) {
                            const p = formatPriceValue(v, k);
                            if (p) price = p;
                        }
                        if (v && typeof v === 'object') queue.push(v);
                        if (Array.isArray(v)) v.forEach(x => queue.push(x));
                    }
                }
            }
            return { name, description, price };
        };

        const visit = (node) => {
            if (!node) return;
            // If it's a JSON string, parse and continue
            if (typeof node === 'string') {
                const parsed = tryParseJson(node);
                if (parsed && (Array.isArray(parsed) || typeof parsed === 'object')) {
                    visit(parsed);
                }
                return;
            }
            if (Array.isArray(node)) { node.forEach(n => visit(n)); return; }
            if (typeof node === 'object') {
                // If the object looks like a single menu item, extract it
                const keys = Object.keys(node);
                const likelyItem = keys.some(k => itemNameKeys.has(k) || itemPriceKeys.has(k));
                if (likelyItem) {
                    const { name, description, price } = extractItemFields(node);
                    // Only push if it looks like a real item (needs price or description, not just title)
                    if ((price || description) || (name && (node.price != null || node.priceTagline != null))) {
                        out.push({ name: name || 'Menu Item', description, price });
                    }
                }
                // Traverse common containers (each individually)
                visit(node.sectionItems);
                visit(node.items);
                visit(node.menuItems);
                visit(node.products);
                visit(node.entries);
                visit(node.children);
                visit(node.sections);
                visit(node.categories);
                visit(node.groups);
                visit(node.cards);
                visit(node.catalogItems);
                if (node.menu) visit(node.menu);
                // Also scan any string-encoded JSON subfields
                for (const val of Object.values(node)) {
                    if (typeof val === 'string') {
                        const parsed = tryParseJson(val);
                        if (parsed && (Array.isArray(parsed) || typeof parsed === 'object')) visit(parsed);
                    }
                }
            }
        };
        visit(v);
        // Deduplicate items by name|description|price
        const seen = new Set();
        const deduped = [];
        for (const it of out) {
            const key = `${(it.name||'').toLowerCase().trim()}|${(it.description||'').toLowerCase().trim()}|${it.price||''}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(it);
            }
        }
        return deduped;
    };

    // Check if this is menu data
    if (title.includes('Menu')) {
        const items = normalizeMenuItems(data);
        console.log('Menu data normalized:', Array.isArray(items) ? items.length + ' items' : typeof items);
        content = '<div style="display: grid; gap: 12px;">';
        let hasItems = false;

        items.forEach((item, idx) => {
            if (typeof item === 'object' && item !== null) {
                console.log(`Menu item ${idx} keys:`, Object.keys(item));

                // Try multiple possible field names
                const name = item.name || item.itemName || item.title || item.label || item.sectionTitle || '';
                const description = item.description || item.itemDescription || item.subtitle || item.sectionSubtitle || '';
                const price = item.price || item.priceTagline || item.formattedPrice || item.priceText || '';
                
                // Skip entries with no useful data
                if (!name && !description && !price) return;
                // Mark that we have something to show
                hasItems = true;
                const displayName = name || 'Menu Item';

                content += `
                    <div style="background: white; padding: 18px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #667eea;">
                        <h4 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(displayName)}</h4>
                        ${description ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: #666; line-height: 1.4;">${escapeHtml(description)}</p>` : ''}
                        ${price ? `<div style="font-size: 15px; font-weight: 600; color: #667eea;">💰 ${escapeHtml(price)}</div>` : ''}
                    </div>
                `;
            }
        });

        if (!hasItems) {
            content = '<p style="color: var(--gemini-gray);">No menu items available</p>';
        }

        content += '</div>';
    }
    // Check if this is reviews data
    else if (title.includes('Reviews') && (Array.isArray(data) || typeof data === 'object')) {
        console.log('Reviews raw data:', JSON.stringify(data, null, 2));
        const reviews = normalizeReviews(data);

        // Parse numeric rating robustly from various formats
        const parseRating = (val) => {
            if (typeof val === 'number' && isFinite(val)) return Math.max(0, Math.min(5, val));
            if (typeof val === 'string') {
                const s = val.trim();
                // Count star glyphs like ★★★★☆
                const full = (s.match(/★/g) || []).length;
                if (full) return Math.max(0, Math.min(5, full));
                // Extract like 4.5/5 or 4.5 out of 5
                const m = s.match(/(\d+(?:\.\d+)?)(?=\s*(?:\/\s*5|\s*out\s*of\s*5)?)/i);
                if (m) return Math.max(0, Math.min(5, parseFloat(m[1])));
                // Plain integer string
                const n = Number(s);
                if (!Number.isNaN(n)) return Math.max(0, Math.min(5, n));
            }
            if (val && typeof val === 'object') {
                if (typeof val.value === 'number') return Math.max(0, Math.min(5, val.value));
                if (typeof val.rating === 'number') return Math.max(0, Math.min(5, val.rating));
            }
            return 0;
        };

        // Render 0–5 stars with full/empty glyphs
        const createStarRating = (ratingRaw) => {
            const rating = parseRating(ratingRaw);
            const fullStars = Math.floor(rating + 1e-6);
            const emptyStars = 5 - fullStars;
            let stars = '<span style="color: #FBBC04; letter-spacing: 2px;">';
            stars += '★'.repeat(fullStars);
            stars += '</span>';
            stars += '<span style="color: #E0E0E0; letter-spacing: 2px;">';
            stars += '★'.repeat(emptyStars);
            stars += '</span>';
            return stars;
        };

        // Check if it's a summary object with rating
        if (reviews.length === 1 && (reviews[0].rating !== undefined || reviews[0].storeRatingScore !== undefined || reviews[0].stars !== undefined || reviews[0].score !== undefined)) {
            const review = reviews[0];
            const rating = parseRating(review.rating || review.storeRatingScore || review.stars || review.score || 0);
            const count = review.reviewsCount || review.numberOfRatings || 0;

            content = `
                <div style="background: white; padding: 30px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="font-size: 40px; margin-bottom: 15px;">${createStarRating(rating)}</div>
                    <div style="font-size: 32px; font-weight: 700; margin-bottom: 8px; color: #333;">${rating.toFixed(1)}</div>
                    <div style="font-size: 14px; color: #666;">${count} Reviews</div>
                </div>
            `;
        } else {
            content = '<div style="display: grid; gap: 12px;">';
            reviews.forEach((review, idx) => {
                if (typeof review === 'object' && review !== null) {
                    console.log(`Review ${idx} keys:`, Object.keys(review));

                    const rating = parseRating(review.rating || review.storeRatingScore || review.stars || review.score || review.ratingValue || review.starRating || 0);
                    const text = review.text || review.comment || review.reviewText || review.message || review.body || review.description || '';

                    // Try more field variations for author name - hide if not found
                    const author = getAuthorName(review) || review.eaterName || '';
                    const when = [review.formattedDate, review.timeSinceReview]
                        .filter(Boolean)
                        .map(s => String(s))
                        .join(' • ');

                    content += `
                        <div style="background: white; padding: 16px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                ${author ? `<span style="font-weight: 600; color: #333; font-size: 14px;">${escapeHtml(author)}</span>` : '<span></span>'}
                                <span style="font-size: 16px;">${createStarRating(rating)}</span>
                            </div>
                            ${when ? `<div style=\"margin: 4px 0 0 0; color: #999; font-size: 12px;\">${escapeHtml(when)}</div>` : ''}
                            ${text ? `<p style=\"margin: 0; color: #666; line-height: 1.5; font-size: 14px;\">${escapeHtml(text)}</p>` : ''}
                        </div>
                    `;
                }
            });
            content += '</div>';
        }
    }
    // Default formatting for other data
    else if (Array.isArray(data)) {
        if (data.length === 0) {
            content = '<p style="color: var(--gemini-gray);">No data available</p>';
        } else {
            content = '<ul style="margin: 0; padding-left: 20px; line-height: 1.8;">';
            data.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                    content += `<li style="margin-bottom: 10px;"><pre style="margin: 5px 0; white-space: pre-wrap; background: #f5f5f5; padding: 10px; border-radius: 4px;">${JSON.stringify(item, null, 2)}</pre></li>`;
                } else {
                    content += `<li style="margin-bottom: 5px;">${escapeHtml(String(item))}</li>`;
                }
            });
            content += '</ul>';
        }
    } else if (typeof data === 'object' && data !== null) {
        content = `<pre style="white-space: pre-wrap; word-wrap: break-word; background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 0;">${JSON.stringify(data, null, 2)}</pre>`;
    } else {
        content = `<p>${escapeHtml(String(data))}</p>`;
    }

    modalBody.innerHTML = content;
    modal.classList.add('show');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
}

// Safer open helpers to avoid inline string quoting issues
window.openMenu = function(index) {
    const r = (window.restaurantsData || [])[index];
    if (!r) return;
    const title = `Menu - ${r.title || 'Restaurant'}`;
    showModal(title, r);
};

window.openReviews = function(index) {
    const r = (window.restaurantsData || [])[index];
    if (!r) return;
    const payload = r.storeReviews || r;
    const title = `Reviews - ${r.title || 'Restaurant'}`;
    showModal(title, payload);
};

window.openCategories = function(index) {
    const r = (window.restaurantsData || [])[index];
    if (!r) return;
    const title = `Categories - ${r.title || 'Restaurant'}`;
    showModal(title, r.categories || []);
};

window.openLocation = function(index) {
    const r = (window.restaurantsData || [])[index];
    if (!r) return;
    const title = `Location - ${r.title || 'Restaurant'}`;
    showModal(title, r.location || {});
};

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

// Modal Close
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') {
        closeModal();
    }
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

    // Sanitize categories (remove $/$$ etc.) and store globally
    const sanitizeCategories = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr
            .filter(v => typeof v === 'string')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !/^\$+$/.test(s));
    };

    window.restaurantsData = data.restaurants.map(r => ({
        ...r,
        categories: sanitizeCategories(r.categories)
    }));

    // Helpers to decide if data is present for menu/reviews
    const hasAnyData = (v) => {
        if (v == null) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'string') {
            const t = v.trim();
            if (!t || t === '[]' || t === '{}') return false;
            return true;
        }
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return false;
    };

    const hasMenuLike = (r) => {
        const cands = [r.menu, r.sections, r.menuItems, r.products, r.entries, r.cards];
        return cands.some(hasAnyData);
    };

    const hasReviewsLike = (r) => {
        const primary = r.storeReviews || r.reviews || r.reviewList || r.ratings || r.feedback || r.opinions;
        if (hasAnyData(primary)) return true;
        const obj = r.storeReviews || r;
        if (obj && typeof obj === 'object') {
            if (Array.isArray(obj.reviews) && obj.reviews.length) return true;
            if (Array.isArray(obj.items) && obj.items.length) return true;
            if (Array.isArray(obj.results) && obj.results.length) return true;
            if (obj.data && ((Array.isArray(obj.data.reviews) && obj.data.reviews.length) || (Array.isArray(obj.data.items) && obj.data.items.length))) return true;
        }
        return false;
    };

    data.restaurants.forEach((restaurant, index) => {
        const row = document.createElement('tr');

        // Image
        const imgSrc = restaurant.heroImageUrl || 'https://via.placeholder.com/80';

        // Categories - make clickable if available (using sanitized categories)
        const hasCategories = Array.isArray(window.restaurantsData[index].categories) && window.restaurantsData[index].categories.length > 0;
        const categoriesCell = hasCategories
            ? `<span class="clickable-cell" onclick="openCategories(${index})">View All</span>`
            : 'N/A';

        // Menu - make clickable only if content is detected. Pass whole restaurant to normalize within modal.
        const menuCell = hasMenuLike(restaurant)
            ? `<span class="clickable-cell" onclick="openMenu(${index})">View Menu</span>`
            : 'N/A';

        // Reviews - make clickable only if content is detected. Prefer storeReviews payload else fall back.
        const reviewsCell = hasReviewsLike(restaurant)
            ? `<span class="clickable-cell" onclick="openReviews(${index})">View Reviews</span>`
            : 'N/A';

        // Location - make clickable if available
        const locationCell = restaurant.location
            ? `<span class="clickable-cell" onclick="openLocation(${index})">View Location</span>`
            : 'N/A';

        row.innerHTML = `
            <td><img src="${imgSrc}" class="restaurant-img" alt="${restaurant.title}"></td>
            <td><strong>${restaurant.title || 'Unknown'}</strong></td>
            <td>${categoriesCell}</td>
            <td>${menuCell}</td>
            <td>${reviewsCell}</td>
            <td>${locationCell}</td>
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

// Google Maps Integration
let mapInstance = null;
let userMarker = null;
let restaurantMarkers = [];

// Show Map Button Click Handler
document.getElementById('showMapBtn').addEventListener('click', () => {
    if (!window.restaurantsData || window.restaurantsData.length === 0) {
        showError('No restaurants to display on map');
        return;
    }

    // Show map container
    document.getElementById('restaurantMapContainer').style.display = 'block';

    // Scroll to map smoothly
    document.getElementById('restaurantMapContainer').scrollIntoView({ behavior: 'smooth' });

    // Initialize or update map
    initializeMap();
});

async function initializeMap() {
    const mapDiv = document.getElementById('restaurantMap');

    // Clear previous markers
    restaurantMarkers.forEach(marker => marker.setMap(null));
    restaurantMarkers = [];

    // Get user location from geocoding the address
    const userLocation = await geocodeAddress(currentUser.address);

    if (!userLocation) {
        showError('Could not locate your address on the map');
        return;
    }

    // Create map centered on user location
    if (!mapInstance) {
        mapInstance = new google.maps.Map(mapDiv, {
            center: userLocation,
            zoom: 13,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true
        });
    } else {
        mapInstance.setCenter(userLocation);
    }

    // Add yellow marker for user location
    if (userMarker) {
        userMarker.setMap(null);
    }

    userMarker = new google.maps.Marker({
        position: userLocation,
        map: mapInstance,
        title: 'Your Location',
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#FBBC04',
            fillOpacity: 1,
            strokeColor: '#F9AB00',
            strokeWeight: 3,
            scale: 12
        }
    });

    // Add user info window
    const userInfoWindow = new google.maps.InfoWindow({
        content: `<div style="padding: 8px;"><strong>Your Location</strong><br/>${currentUser.address}</div>`
    });

    userMarker.addListener('click', () => {
        userInfoWindow.open(mapInstance, userMarker);
    });

    // Add red markers for each restaurant
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

        // Calculate distance from user
        const distance = calculateDistance(userLocation, restaurantLocation);

        // Create red marker for restaurant
        const marker = new google.maps.Marker({
            position: restaurantLocation,
            map: mapInstance,
            title: restaurant.title,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: '#EA4335',
                fillOpacity: 1,
                strokeColor: '#C5221F',
                strokeWeight: 3,
                scale: 10
            }
        });

        // Create info window with restaurant details
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="padding: 10px; max-width: 250px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #131314;">${restaurant.title}</h3>
                    <p style="margin: 4px 0; font-size: 13px; color: #5F6368;">📍 ${distance} from you</p>
                    ${restaurant.location.address ? `<p style="margin: 4px 0; font-size: 12px; color: #5F6368;">${restaurant.location.address}</p>` : ''}
                </div>
            `
        });

        marker.addListener('click', () => {
            infoWindow.open(mapInstance, marker);
        });

        restaurantMarkers.push(marker);
    }

    // Adjust map bounds to show all markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(userLocation);
    restaurantMarkers.forEach(marker => bounds.extend(marker.getPosition()));
    mapInstance.fitBounds(bounds);
}

// Geocode address to coordinates
async function geocodeAddress(address) {
    return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: address }, (results, status) => {
            if (status === 'OK' && results[0]) {
                resolve({
                    lat: results[0].geometry.location.lat(),
                    lng: results[0].geometry.location.lng()
                });
            } else {
                console.error('Geocoding failed for address:', address, status);
                resolve(null);
            }
        });
    });
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
