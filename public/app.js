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

// Contextual loading message helper
function setLoadingMessage(context = 'default', detail = '') {
    const el = document.getElementById('loadingMessage');
    if (!el) return;
    const clean = (s) => (s || '').toString().trim();
    const what = clean(detail);
    switch (context) {
        case 'restaurants':
            el.textContent = `Thinking… finding ${what ? what + ' ' : ''}restaurants near you.`;
            break;
        case 'analysis':
            el.textContent = 'Thinking… analyzing your statement and summarizing transactions.';
            break;
        case 'fetchResult':
            el.textContent = 'Thinking… retrieving your analysis.';
            break;
        default:
            el.textContent = 'Thinking… working on it.';
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
    // Clear banks table when switching users or logging in/out
    const banksTableContainer = document.getElementById('banksTableContainer');
    if (banksTableContainer) {
        banksTableContainer.style.display = 'none';
    }

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

    setLoadingMessage('analysis');
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
        window.lastAnalysisHtml = data.analysis;

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

// Find Financial Institutions Button
document.getElementById('gmailFetchBtn').addEventListener('click', async () => {
    // Check if user has address
    if (!currentUser || !currentUser.address) {
        showError('Please update your address in your profile before searching for banks');
        // Open profile dropdown
        document.getElementById('profileDropdown').classList.add('show');
        return;
    }

    const banksTableContainer = document.getElementById('banksTableContainer');
    const banksTableContent = document.getElementById('banksTableContent');

    // Show loading state
    banksTableContainer.style.display = 'block';
    banksTableContent.innerHTML = `
        <div class="loading-container" style="padding: 30px 10px;">
            <div class="spinner large-spinner"></div>
            <p>Searching for financial institutions near you...</p>
        </div>
    `;

    try {
        const data = await apiCall('/banks/search', {
            method: 'POST',
            body: JSON.stringify({
                address: currentUser.address
            })
        });

        displayBanksTable(data.banks);
        showSuccess(`Found ${data.count} financial institutions near you`);
    } catch (error) {
        showError(error.message);
        banksTableContainer.style.display = 'none';
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
    setLoadingMessage('analysis');
    showPage('loading');

    try {
        const data = await apiCall(`/process/${docId}`, {
            method: 'POST'
        });

        document.getElementById('resultsContainer').innerHTML = data.analysis;
        window.lastAnalysisHtml = data.analysis;

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
    setLoadingMessage('fetchResult');
    showPage('loading');

    try {
        const data = await apiCall(`/result/${docId}`);
        document.getElementById('resultsContainer').innerHTML = data.analysis;
        window.lastAnalysisHtml = data.analysis;

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
    // Keep last query for downstream recommendation filtering
    window.lastRestaurantQuery = data.query || '';

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
            ? `<div class="clickable-cell" onclick="openCategories(${index})"><span>View All</span></div>`
            : 'N/A';

        // Menu - make clickable only if content is detected. Pass whole restaurant to normalize within modal.
        const menuCell = hasMenuLike(restaurant)
            ? `<div class="clickable-cell" onclick="openMenu(${index})"><span>View Menu</span></div>`
            : 'N/A';

        // Reviews - make clickable only if content is detected. Prefer storeReviews payload else fall back.
        const reviewsCell = hasReviewsLike(restaurant)
            ? `<div class="clickable-cell" onclick="openReviews(${index})"><span>View Reviews</span></div>`
            : 'N/A';

        // Location - make clickable if available
        const locationCell = restaurant.location
            ? `<div class="clickable-cell" onclick="openLocation(${index})"><span>View Location</span></div>`
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

    setLoadingMessage('restaurants', query);
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

// Keep the last analysis HTML for downstream prompts
window.lastAnalysisHtml = window.lastAnalysisHtml || null;

// Maps Integration (Google primary, Leaflet fallback)
let mapInstance = null;
let userMarker = null;
let restaurantMarkers = [];
let mapsProvider = 'auto'; // 'google' | 'leaflet' | 'auto'

// Load config and the right map library on demand
let mapsLoadingPromise = null;
async function ensureMapsLibraryLoaded() {
    if (window.google && window.google.maps) return; // Google already loaded
    if (window.L && typeof window.L.map === 'function') return; // Leaflet already loaded

    if (!mapsLoadingPromise) {
        mapsLoadingPromise = (async () => {
            // Fetch public config (provider preference + API key)
            let key = '';
            try {
                const resp = await fetch(`${API_URL}/config`);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const cfg = await resp.json();
                mapsProvider = (cfg.mapsProvider || 'auto').toLowerCase();
                key = cfg.googleMapsApiKey || '';
            } catch (e) {
                console.warn('Config fetch failed; falling back to Leaflet:', e);
                mapsProvider = 'leaflet';
            }

            // Decide provider
            let providerToUse = mapsProvider;
            if (providerToUse === 'auto') {
                providerToUse = key ? 'google' : 'leaflet';
            }

            if (providerToUse === 'google') {
                if (!key) throw new Error('Missing Google Maps API key');
                await loadGoogleMaps(key);
                mapsProvider = 'google';
            } else {
                await loadLeaflet();
                mapsProvider = 'leaflet';
            }
        })();
    }
    return mapsLoadingPromise;
}

function loadGoogleMaps(key) {
    return new Promise((resolve, reject) => {
        if (window.google && window.google.maps) return resolve();
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Google Maps library'));
        document.head.appendChild(script);
    });
}

function loadLeaflet() {
    return new Promise((resolve, reject) => {
        if (window.L && typeof window.L.map === 'function') return resolve();

        // Inject CSS
        const cssId = 'leaflet-css';
        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        // Inject JS
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Leaflet library'));
        document.head.appendChild(script);
    });
}

// ------- Recommendations (Coffee spend -> menu alternatives) -------

// Extract a compact menu catalog from restaurants data
function extractMenuCatalog(restaurants, query = '') {
    const q = (query || '').toLowerCase().trim();
    const buildKeywords = (q) => {
        const base = q.split(/\s+/).filter(Boolean);
        const set = new Set(base);
        const addAll = (arr) => arr.forEach(w => set.add(w));
        // Light synonyms by intent
        if (q.includes('fish') || q.includes('seafood')) {
            addAll(['fish','seafood','salmon','tuna','cod','haddock','tilapia','trout','bass','halibut','sardine','mackerel','snapper','sole','catfish','shrimp','prawn','lobster','crab','scallop','oyster','clam','mussel']);
        }
        if (q.includes('pizza')) addAll(['pizza','margherita','pepperoni','slice']);
        if (q.includes('burger')) addAll(['burger','cheeseburger','patty']);
        if (q.includes('chicken')) addAll(['chicken','tenders','wings','nuggets']);
        if (q.includes('shawarma')) addAll(['shawarma']);
        if (q.includes('sushi')) addAll(['sushi','maki','sashimi','nigiri']);
        if (q.includes('pasta')) addAll(['pasta','spaghetti','fettuccine','penne','lasagna']);
        if (q.includes('salad')) addAll(['salad']);
        if (q.includes('steak')) addAll(['steak','ribeye','sirloin']);
        if (q.includes('taco')) addAll(['taco','quesadilla','burrito']);
        return Array.from(set).filter(Boolean);
    };
    const keywords = buildKeywords(q);
    const hasIntent = keywords.length > 0;
    const beverageWords = ['coffee','tea','latte','mocha','espresso','americano','cappuccino','frapp','macchiato','drink','beverage','soda','coke','pepsi','juice','water'];
    const nameKeys = ['itemName','productName','dishName','title','name','label','sectionTitle','shortName','longName','heading'];
    const priceKeys = ['price','priceTagline','formattedPrice','priceText','amount','value','priceCents','centAmount','cents'];

    const parsePriceNumber = (val) => {
        if (val == null) return null;
        if (typeof val === 'number') {
            // If integer and reasonably small, treat as cents (e.g., 2124 => 21.24)
            if (Number.isInteger(val) && val >= 100 && val <= 100000) return val / 100;
            return val >= 0 ? Number(val) : null;
        }
        if (typeof val === 'string') {
            let s = val.trim();
            // Detect if value denotes cents explicitly
            const mentionsCents = /\bcent(s)?\b/i.test(s) || /\bcents?\b/i.test(s);
            // Keep only digits and separators for parsing logic
            let numeric = s.replace(/[^0-9.,]/g, '');
            if (!numeric) return null;
            // If both separators present and last comma after last dot => comma is decimal
            const lastDot = numeric.lastIndexOf('.')
            const lastComma = numeric.lastIndexOf(',');
            if (lastComma > -1 && (lastDot === -1 || lastComma > lastDot)) {
                // European style: use comma as decimal, remove dots as thousand
                numeric = numeric.replace(/\./g, '').replace(/,/g, '.');
            } else if (numeric.includes(',') && !numeric.includes('.')) {
                // Only comma present: treat as decimal
                numeric = numeric.replace(/,/g, '.');
            } else {
                // Dot is decimal; remove thousands commas
                numeric = numeric.replace(/,/g, '');
            }
            const n = parseFloat(numeric);
            if (!isFinite(n)) return null;
            // If the string mentions cents or looks like an integer with 3–5 digits, treat as cents
            if (mentionsCents || (/^\d{3,5}$/.test(numeric) && Math.abs(n) >= 100)) {
                return n / 100;
            }
            return n;
        }
        if (typeof val === 'object') {
            for (const k of ['price','amount','value','centAmount','cents','formatted','text']) {
                if (val[k] != null) {
                    const r = parsePriceNumber(val[k]);
                    if (r != null) return r;
                }
            }
        }
        return null;
    };

    const getName = (obj) => {
        for (const k of nameKeys) {
            const v = obj[k];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        return '';
    };

    const getPrice = (obj) => {
        for (const k of priceKeys) {
            if (obj[k] != null) {
                const n = parsePriceNumber(obj[k]);
                if (n != null) return n;
            }
        }
        return null;
    };

    const results = [];
    const visit = (node, pushItem) => {
        if (!node) return;
        if (typeof node === 'string') {
            try {
                const parsed = JSON.parse(node);
                visit(parsed, pushItem);
            } catch (_) {}
            return;
        }
        if (Array.isArray(node)) { node.forEach(n => visit(n, pushItem)); return; }
        if (typeof node === 'object') {
            const name = getName(node);
            const price = getPrice(node);
            if (name && price != null) pushItem({ name, price, description: node.description || node.itemDescription || '' });
            // Explore common containers
            ['sectionItems','items','menuItems','products','entries','children','sections','categories','groups','cards','catalogItems','menu','menus','data'].forEach(k => visit(node[k], pushItem));
            for (const v of Object.values(node)) {
                if (typeof v === 'string') {
                    try { visit(JSON.parse(v), pushItem); } catch (_) {}
                }
            }
        }
    };

    for (const r of restaurants || []) {
        const allItems = [];
        visit(r, (it) => allItems.push(it));
        const dedup = new Map();
        allItems.forEach(it => {
            if (typeof it.price !== 'number' || !isFinite(it.price)) return;
            // Clamp unrealistic menu prices; treat values above $200 or below $1 as likely bad parse
            if (it.price < 1 || it.price > 200) return;
            const nameLc = String(it.name || '').toLowerCase();
            const descLc = String(it.description || '').toLowerCase();
            // Skip obvious beverages
            if (beverageWords.some(w => nameLc.includes(w) || descLc.includes(w))) return;
            // If user intent is present, require a keyword match in name/description
            if (hasIntent && !keywords.some(k => nameLc.includes(k) || descLc.includes(k))) return;
            const key = `${it.name.toLowerCase().trim()}|${it.price.toFixed(2)}`;
            if (!dedup.has(key)) dedup.set(key, it);
        });
        const items = Array.from(dedup.values()).slice(0, 200);
        if (items.length) results.push({ name: r.title || r.name || 'Restaurant', items });
    }
    return results.slice(0, 10);
}

async function requestRecommendations() {
    const recommendationsContainer = document.getElementById('recommendationsContainer');
    const recommendationsContent = document.getElementById('recommendationsContent');

    // Ensure we have an analysis HTML: use cached one or fetch latest processed
    if (!window.lastAnalysisHtml) {
        try {
            window.lastAnalysisHtml = await ensureLastAnalysisLoaded();
        } catch (e) {
            showError('No analyzed statement found. Please analyze a statement first.');
            return;
        }
    }
    if (!window.restaurantsData || !window.restaurantsData.length) {
        showError('Search restaurants first to build menu recommendations.');
        return;
    }

    // Build menu catalog
    const catalog = extractMenuCatalog(window.restaurantsData, window.lastRestaurantQuery || '');
    if (!catalog.length) {
        showError('No menu items with prices found to generate recommendations.');
        return;
    }

    // Show container with a thinking spinner
    recommendationsContainer.style.display = 'block';
    // Smoothly bring the recommendations into view (below the map container)
    try {
        const target = recommendationsContainer;
        const y = target.getBoundingClientRect().top + window.scrollY - 12;
        window.scrollTo({ top: y, behavior: 'smooth' });
    } catch {}
    recommendationsContent.innerHTML = `
        <div class="loading-container" style="padding: 30px 10px;">
            <div class="spinner large-spinner"></div>
            <p>Thinking… crafting your meal alternatives</p>
        </div>
    `;

    try {
        const data = await apiCall('/recommendations/coffee', {
            method: 'POST',
            body: JSON.stringify({
                analysisHtml: window.lastAnalysisHtml,
                restaurants: catalog,
                query: window.lastRestaurantQuery || ''
            })
        });
        renderRecommendationsTable(data.recommendations);
        // Ensure final content is visible after render
        try {
            const target = recommendationsContainer;
            const y = target.getBoundingClientRect().top + window.scrollY - 12;
            window.scrollTo({ top: y, behavior: 'smooth' });
        } catch {}
    } catch (err) {
        console.error('Recommendations failed:', err);
        showError('Failed to get recommendations: ' + (err.message || err));
        recommendationsContainer.style.display = 'none';
    }
}

// Pull the latest processed analysis from the inbox if none is cached
async function ensureLastAnalysisLoaded() {
    const inbox = await apiCall('/inbox'); // { documents: [...] }
    if (!inbox || !Array.isArray(inbox.documents)) throw new Error('No inbox');
    // Already sorted by receivedAt desc on backend; find first processed
    const latestProcessed = inbox.documents.find(d => d.processed);
    if (!latestProcessed) throw new Error('No processed documents');
    const res = await apiCall(`/result/${latestProcessed.id}`);
    if (!res || !res.analysis) throw new Error('No analysis');
    return res.analysis;
}

function renderRecommendationsTable(rec) {
    const recommendationsContainer = document.getElementById('recommendationsContainer');
    const recommendationsContent = document.getElementById('recommendationsContent');
    if (!rec || !Array.isArray(rec.allocations) || rec.allocations.length === 0) {
        recommendationsContent.innerHTML = '<p style="color: var(--gemini-gray);">No recommendations available.</p>';
        recommendationsContainer.style.display = 'block';
        return;
    }

    const currency = '$';
    const rows = rec.allocations.map(a => {
        const itemsList = a.items.map(it => `${escapeHtml(it.name)} <span style="color:#5F6368">(${currency}${it.price.toFixed(2)})</span>`).join('<br>');
        return `
            <tr>
                <td style="font-weight:600;">${escapeHtml(a.restaurant)}</td>
                <td>${itemsList}</td>
                <td style="text-align:right; font-weight:600;">${currency}${(a.subtotal || 0).toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    recommendationsContent.innerHTML = `
        <div style="margin-bottom: 10px; color: #5F6368;">Detected coffee spend: <strong>${currency}${(rec.coffeeSpend || 0).toFixed(2)}</strong></div>
        <table class="inbox-table" style="margin-top: 10px;">
            <thead>
                <tr>
                    <th>Restaurant</th>
                    <th>Items</th>
                    <th style="text-align:right;">Subtotal</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        ${rec.notes ? `<div style="margin-top: 12px; color: #5F6368; font-size: 0.95em;">${escapeHtml(rec.notes)}</div>` : ''}
    `;
    recommendationsContainer.style.display = 'block';
}

// Wire up Recommend button
document.getElementById('recommendBtn').addEventListener('click', requestRecommendations);

// Show Map Button Click Handler
document.getElementById('showMapBtn').addEventListener('click', async () => {
    if (!window.restaurantsData || window.restaurantsData.length === 0) {
        showError('No restaurants to display on map');
        return;
    }

    // Show map container
    const container = document.getElementById('restaurantMapContainer');
    container.style.display = 'block';

    // Do not auto-scroll on map display; keep focus on current position

    try {
        await ensureMapsLibraryLoaded();
        await initializeMap(); // dispatches to provider-specific implementation
    } catch (err) {
        console.error(err);
        showError(`Map failed to load: ${err.message || err}`);
    }
});

async function initializeMap() {
    if (mapsProvider === 'leaflet') return initializeMapLeaflet();
    return initializeMapGoogle();
}

// Provider-specific implementations
async function initializeMapGoogle() {
    if (!window.google || !google.maps) {
        throw new Error('Google Maps library not available');
    }
    const mapDiv = document.getElementById('restaurantMap');
    // Clear any previous placeholder content
    mapDiv.innerHTML = '';

    // Clear previous markers
    restaurantMarkers.forEach(marker => marker.setMap && marker.setMap(null));
    restaurantMarkers = [];

    // Get user location with fallback strategies
    const userLocation = await getUserLocationForMap();
    if (!userLocation) {
        showError('Could not locate your address on the map');
        return;
    }

    if (!mapInstance) {
        mapInstance = new google.maps.Map(mapDiv, {
            center: userLocation,
            zoom: 13,
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true
        });
    } else if (mapInstance.setCenter) {
        mapInstance.setCenter(userLocation);
    }

    // Force a resize in case the map div was previously hidden
    try {
        if (google && google.maps && google.maps.event && mapInstance) {
            setTimeout(() => {
                google.maps.event.trigger(mapInstance, 'resize');
                mapInstance.setCenter(userLocation);
            }, 50);
        }
    } catch (e) {
        console.warn('Map resize trigger failed:', e);
    }

    if (userMarker && userMarker.setMap) userMarker.setMap(null);

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

    const userInfoWindow = new google.maps.InfoWindow({
        content: `<div style="padding: 8px;"><strong>Your Location</strong><br/>${currentUser.address}</div>`
    });
    userMarker.addListener('click', () => userInfoWindow.open(mapInstance, userMarker));

    for (const restaurant of window.restaurantsData) {
        if (!restaurant.location) continue;
        const restaurantLocation = await normalizeRestaurantLocation(restaurant, geocodeAddressGoogle);
        if (!restaurantLocation) continue;

        const distance = calculateDistance(userLocation, restaurantLocation);
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

        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="padding: 10px; max-width: 250px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #131314;">${restaurant.title}</h3>
                    <p style="margin: 4px 0; font-size: 13px; color: #5F6368;">📍 ${distance} from you</p>
                    ${restaurant.location.address ? `<p style=\"margin: 4px 0; font-size: 12px; color: #5F6368;\">${restaurant.location.address}</p>` : ''}
                </div>
            `
        });
        marker.addListener('click', () => infoWindow.open(mapInstance, marker));
        restaurantMarkers.push(marker);
    }

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(userLocation);
    restaurantMarkers.forEach(marker => bounds.extend(marker.getPosition()));
    mapInstance.fitBounds(bounds);

    // Verify that Google actually rendered. If not, fall back to Leaflet automatically.
    setTimeout(async () => {
        try {
            const hasGm = !!mapDiv.querySelector('.gm-style');
            const sized = mapDiv.offsetWidth > 0 && mapDiv.offsetHeight > 0;
            if (!hasGm || !sized) {
                console.warn('Google map did not render; falling back to Leaflet.');
                await loadLeaflet();
                mapsProvider = 'leaflet';
                await initializeMapLeaflet();
            }
        } catch (e) {
            console.warn('Map render check failed:', e);
        }
    }, 800);
}

// Best-effort user location resolution for Google Maps
async function getUserLocationForMap() {
    // 1) Try Google geocoder if available
    try {
        const byGoogle = await geocodeAddressGoogle(currentUser.address);
        if (byGoogle) return byGoogle;
    } catch (e) {
        console.warn('Google geocode failed:', e);
    }
    // 2) Fallback to Nominatim
    try {
        const byOsm = await geocodeAddressLeaflet(currentUser.address);
        if (byOsm) return byOsm;
    } catch (e) {
        console.warn('OSM geocode failed:', e);
    }
    // 3) Use first restaurant with coordinates
    if (Array.isArray(window.restaurantsData)) {
        for (const r of window.restaurantsData) {
            const loc = r && r.location;
            if (!loc) continue;
            if (loc.latitude && loc.longitude) return { lat: parseFloat(loc.latitude), lng: parseFloat(loc.longitude) };
            if (loc.lat && loc.lng) return { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) };
        }
    }
    // 4) Fallback to default city center (Ottawa, CA ~ as example)
    return { lat: 45.4215, lng: -75.6972 };
}

async function initializeMapLeaflet() {
    const mapDiv = document.getElementById('restaurantMap');
    mapDiv.innerHTML = '';

    // Clear previous markers
    restaurantMarkers.forEach(marker => marker.remove && marker.remove());
    restaurantMarkers = [];

    // Remove previous map instance if exists (Leaflet)
    if (mapInstance && mapInstance.remove) {
        try { mapInstance.remove(); } catch (e) {}
        mapInstance = null;
    }

    const userLocation = await geocodeAddressLeaflet(currentUser.address);
    if (!userLocation) {
        showError('Could not locate your address on the map');
        return;
    }

    mapInstance = L.map(mapDiv).setView([userLocation.lat, userLocation.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    }).addTo(mapInstance);

    const yellowIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: #FBBC04; border: 3px solid #F9AB00; width: 24px; height: 24px; border-radius: 50%;"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    if (userMarker && userMarker.remove) userMarker.remove();
    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: yellowIcon })
        .addTo(mapInstance)
        .bindPopup(`<div style="padding: 8px;"><strong>Your Location</strong><br/>${currentUser.address}</div>`);

    const redIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: #EA4335; border: 3px solid #C5221F; width: 20px; height: 20px; border-radius: 50%;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const allMarkers = [[userLocation.lat, userLocation.lng]];
    for (const restaurant of window.restaurantsData) {
        if (!restaurant.location) continue;
        const restaurantLocation = await normalizeRestaurantLocation(restaurant, geocodeAddressLeaflet);
        if (!restaurantLocation) continue;
        allMarkers.push([restaurantLocation.lat, restaurantLocation.lng]);
        const distance = calculateDistance(userLocation, restaurantLocation);
        const marker = L.marker([restaurantLocation.lat, restaurantLocation.lng], { icon: redIcon })
            .addTo(mapInstance)
            .bindPopup(`
                <div style="padding: 10px; max-width: 250px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #131314;">${restaurant.title}</h3>
                    <p style="margin: 4px 0; font-size: 13px; color: #5F6368;">📍 ${distance} from you</p>
                    ${restaurant.location.address ? `<p style=\"margin: 4px 0; font-size: 12px; color: #5F6368;\">${restaurant.location.address}</p>` : ''}
                </div>
            `);
        restaurantMarkers.push(marker);
    }

    if (allMarkers.length > 1) {
        const bounds = L.latLngBounds(allMarkers);
        mapInstance.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Normalizes restaurant location input and geocodes if necessary
async function normalizeRestaurantLocation(restaurant, geocodeFn) {
    let restaurantLocation = null;
    const loc = restaurant.location || {};
    if (loc.latitude && loc.longitude) {
        restaurantLocation = { lat: parseFloat(loc.latitude), lng: parseFloat(loc.longitude) };
    } else if (loc.lat && loc.lng) {
        restaurantLocation = { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) };
    } else if (loc.address) {
        restaurantLocation = await geocodeFn(loc.address);
    }
    return restaurantLocation;
}

// Geocoders per provider
async function geocodeAddressGoogle(address) {
    return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
                resolve({
                    lat: results[0].geometry.location.lat(),
                    lng: results[0].geometry.location.lng(),
                });
            } else {
                console.error('Geocoding failed for address:', address, status);
                resolve(null);
            }
        });
    });
}

async function geocodeAddressLeaflet(address) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const results = await response.json();
        if (results && results.length > 0) {
            return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
        }
        console.error('Geocoding failed for address:', address);
        return null;
    } catch (err) {
        console.error('Geocoding error:', err);
        return null;
    }
}

// Display Banks Table
function displayBanksTable(banks) {
    const banksTableContent = document.getElementById('banksTableContent');

    if (!banks || banks.length === 0) {
        banksTableContent.innerHTML = '<p style="color: var(--gemini-gray);">No financial institutions found nearby.</p>';
        return;
    }

    const createStarRating = (rating) => {
        const fullStars = Math.floor(rating);
        const emptyStars = 5 - fullStars;
        let stars = '<span style="color: #FBBC04; letter-spacing: 2px;">';
        stars += '★'.repeat(fullStars);
        stars += '</span>';
        stars += '<span style="color: #E0E0E0; letter-spacing: 2px;">';
        stars += '★'.repeat(emptyStars);
        stars += '</span>';
        return stars;
    };

    let tableHTML = `
        <table class="inbox-table" style="width: 100%;">
            <thead>
                <tr>
                    <th>Bank Name</th>
                    <th>Address</th>
                    <th>Phone</th>
                    <th>Rating</th>
                    <th>Working Hours</th>
                </tr>
            </thead>
            <tbody>
    `;

    banks.forEach(bank => {
        // Get today's working hours
        let todayHours = 'N/A';
        if (bank.workingHours && bank.workingHours.length > 0) {
            const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            // Google Places returns weekday_text in order: Monday, Tuesday, ..., Sunday
            // So we need to map our day index to the array index
            const googleDayIndex = today === 0 ? 6 : today - 1; // Convert Sunday from 0 to 6, others subtract 1

            if (bank.workingHours[googleDayIndex]) {
                todayHours = bank.workingHours[googleDayIndex];
            } else {
                // Fallback: try to find today's hours by matching day name
                const todayName = dayNames[today];
                const found = bank.workingHours.find(h => h.startsWith(todayName));
                todayHours = found || 'N/A';
            }
        }

        tableHTML += `
            <tr>
                <td><strong>${escapeHtml(bank.name)}</strong></td>
                <td>${escapeHtml(bank.address)}</td>
                <td>${escapeHtml(bank.phone)}</td>
                <td>
                    ${createStarRating(bank.rating)}
                    <div style="font-size: 12px; color: #5F6368; margin-top: 4px;">${bank.rating.toFixed(1)}</div>
                </td>
                <td style="font-size: 12px; line-height: 1.6;">${escapeHtml(todayHours)}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    banksTableContent.innerHTML = tableHTML;
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
