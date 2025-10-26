// Global variables
let allJobs = [];
let filteredJobs = [];
let favorites = new Set();
let showOnlyFavorites = false;

// API Configuration
const API_URL = 'https://merkava.mrp.gov.il/sap/opu/odata/ILG/GIUS_PUBLIC_AREA_SRV/SearchDataIdSet?$filter=isPublis+eq+true';
const CACHE_KEY = 'jobsData';
const CACHE_TIMESTAMP_KEY = 'jobsDataTimestamp';
const FAVORITES_KEY = 'favoriteJobs';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadFavorites();
    loadJobs();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', applyFilters);
    document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
    document.getElementById('searchInput').addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });
    
    document.getElementById('locationFilter').addEventListener('change', applyFilters);
    document.getElementById('officeFilter').addEventListener('change', applyFilters);
    document.getElementById('areaFilter').addEventListener('change', applyFilters);
    document.getElementById('publishTypeFilter').addEventListener('change', applyFilters);
    document.getElementById('sortBy').addEventListener('change', applyFilters);
    document.getElementById('sortOrder').addEventListener('change', applyFilters);
    
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
    document.getElementById('showFavoritesBtn').addEventListener('click', toggleFavoritesView);
    document.getElementById('exportBtn').addEventListener('click', exportToExcel);
    
    // Load theme preference
    loadTheme();
}

// Dark Mode Functions
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update icon
    const icon = document.getElementById('themeToggle');
    icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const icon = document.getElementById('themeToggle');
    if (icon) {
        icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
}

// Statistics Functions
let statsVisible = false;

function toggleStats() {
    statsVisible = !statsVisible;
    const content = document.getElementById('statsContent');
    const btn = document.getElementById('statsBtn');
    
    if (statsVisible) {
        content.style.display = 'block';
        btn.textContent = '📈';
        btn.title = 'הסתר סטטיסטיקות';
        generateStatistics();
        
        // Scroll to statistics
        setTimeout(() => {
            content.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    } else {
        content.style.display = 'none';
        btn.textContent = '📊';
        btn.title = 'הצג סטטיסטיקות';
    }
}

function generateStatistics() {
    const jobs = filteredJobs.length > 0 ? filteredJobs : allJobs;
    
    // By Office
    const byOffice = {};
    jobs.forEach(job => {
        const office = job.OfficeName || 'לא צוין';
        byOffice[office] = (byOffice[office] || 0) + 1;
    });
    
    // By Area
    const byArea = {};
    jobs.forEach(job => {
        const area = job.Area || 'לא צוין';
        byArea[area] = (byArea[area] || 0) + 1;
    });
    
    // By Type
    const byType = {};
    jobs.forEach(job => {
        const type = job.PublishmenTypeName || 'לא צוין';
        byType[type] = (byType[type] || 0) + 1;
    });
    
    // By Urgency
    const byUrgency = {
        'דחוף (עד 7 ימים)': 0,
        'בינוני (8-14 ימים)': 0,
        'רגיל (15+ ימים)': 0,
        'פג תוקף': 0
    };
    
    jobs.forEach(job => {
        const days = calculateDaysLeft(parseDateString(job.LastSubmittingDate));
        if (days < 0) byUrgency['פג תוקף']++;
        else if (days <= 7) byUrgency['דחוף (עד 7 ימים)']++;
        else if (days <= 14) byUrgency['בינוני (8-14 ימים)']++;
        else byUrgency['רגיל (15+ ימים)']++;
    });
    
    // Render statistics
    renderStatList('statsByOffice', byOffice);
    renderStatList('statsByArea', byArea);
    renderStatList('statsByType', byType);
    renderStatList('statsByUrgency', byUrgency);
}

function renderStatList(elementId, data) {
    const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    
    const html = sorted.map(([key, value]) => {
        const percentage = ((value / total) * 100).toFixed(1);
        return `
            <div class="stat-item">
                <div class="stat-bar-container">
                    <div class="stat-bar" style="width: ${percentage}%"></div>
                </div>
                <div class="stat-details">
                    <span class="stat-name">${key}</span>
                    <span class="stat-count">${value} (${percentage}%)</span>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById(elementId).innerHTML = html;
}

// Share Job Functions
let shareMenuVisible = false;

function toggleShareMenu() {
    shareMenuVisible = !shareMenuVisible;
    const menu = document.getElementById('shareMenu');
    const btn = document.getElementById('shareToggleBtn');
    
    if (shareMenuVisible) {
        menu.style.display = 'flex';
        btn.style.background = 'var(--primary-color)';
    } else {
        menu.style.display = 'none';
        btn.style.background = '';
    }
}

function shareJob(method) {
    if (!currentJobId) return;
    
    const job = allJobs.find(j => j.RequestId === currentJobId);
    if (!job) return;
    
    const url = `https://merkava.mrp.gov.il/giusp/index.html#/position/${job.RequestId}`;
    const text = `משרה: ${job.TenderName}\nמשרד: ${job.OfficeName || 'לא צוין'}\nמיקום: ${job.LocationName || 'לא צוין'}\n\nקישור להגשה: ${url}`;
    
    switch(method) {
        case 'whatsapp':
            const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
            window.open(whatsappUrl, '_blank');
            break;
            
        case 'email':
            const subject = `משרה: ${job.TenderName}`;
            const body = text;
            const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.location.href = mailtoUrl;
            break;
            
        case 'copy':
            navigator.clipboard.writeText(url).then(() => {
                alert('הקישור הועתק ללוח! 🎉');
            }).catch(() => {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = url;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                alert('הקישור הועתק ללוח! 🎉');
            });
            break;
    }
    
    // Close share menu after sharing
    toggleShareMenu();
}

// Export to Excel Function
function exportToExcel() {
    const jobsToExport = showOnlyFavorites ? 
        filteredJobs.filter(job => favorites.has(job.RequestId)) : 
        filteredJobs;
    
    if (jobsToExport.length === 0) {
        alert('אין משרות לייצא!');
        return;
    }
    
    // Create CSV content
    const headers = ['מספר משרה', 'שם המשרה', 'משרד', 'יחידה ארגונית', 'מיקום', 'אזור', 'תאריך פרסום', 'תאריך הגשה אחרון', 'ימים נותרו', 'קישור להגשה'];
    
    const rows = jobsToExport.map(job => {
        const lastDate = parseDateString(job.LastSubmittingDate);
        const publishDate = parseDateString(job.TenderPublicationDate);
        const daysLeft = calculateDaysLeft(lastDate);
        
        return [
            job.TenderNumber || '',
            job.TenderName || '',
            job.OfficeName || '',
            job.OfficeUnitName || '',
            job.LocationName || '',
            job.Area || '',
            formatDate(publishDate),
            formatDate(lastDate),
            daysLeft >= 0 ? daysLeft : 'פג תוקף',
            `https://merkava.mrp.gov.il/giusp/index.html#/position/${job.RequestId}`
        ];
    });
    
    // Add BOM for Hebrew support
    let csv = '\uFEFF';
    csv += headers.join(',') + '\n';
    csv += rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `משרות_אל_הדגל_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(`✅ ${jobsToExport.length} משרות יוצאו בהצלחה!`);
}

// Load jobs from JSON file
async function loadJobs() {
    try {
        console.log('Loading from publicNezivut.json');
        const response = await fetch('./publicNezivut.json');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.d && data.d.results) {
            allJobs = data.d.results;
            processJobs();
            console.log(`Successfully loaded ${allJobs.length} jobs`);
            return;
        }
        
        throw new Error('Invalid JSON structure');
        
    } catch (error) {
        console.error('Error loading jobs:', error);
        showError('שגיאה בטעינת המשרות. אנא ודא שהאתר רץ דרך שרת HTTP (ראה הוראות ב-README)');
    }
}

// Optional: Refresh from API (can be called manually if needed)
async function refreshFromAPI() {
    try {
        console.log('Fetching from API');
        
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'he,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': 'https://merkava.mrp.gov.il/giusp/index.html',
                'sap-language': 'he',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            mode: 'cors',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.d && data.d.results) {
            allJobs = data.d.results;
            cacheData(allJobs);
            processJobs();
            alert(`הנתונים עודכנו בהצלחה! נמצאו ${allJobs.length} משרות.`);
            console.log('Successfully refreshed from API');
        } else {
            throw new Error('Invalid API response structure');
        }
    } catch (error) {
        console.error('Failed to refresh from API:', error);
        alert(`לא ניתן לעדכן מהשרת: ${error.message}\n\nהסיבה: השרת דורש אימות וקוקיז שרק דפדפן עם כניסה לאתר הממשלתי יכול לספק.\n\nהמלצה: השתמש בקובץ ה-JSON המקומי או הורד JSON עדכני ידנית מהאתר הממשלתי.`);
    }
}

// Cache management
function getCachedData() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        
        if (cached && timestamp) {
            const age = Date.now() - parseInt(timestamp);
            if (age < CACHE_DURATION) {
                return JSON.parse(cached);
            }
        }
        return null;
    } catch (error) {
        console.error('Error reading cache:', error);
        return null;
    }
}

function cacheData(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
        console.error('Error caching data:', error);
    }
}

// Process jobs and setup filters
function processJobs() {
    filteredJobs = [...allJobs];
    populateFilters();
    applyFilters();
    updateStats();
    updateLastUpdateTime();
}

// Populate filter dropdowns
function populateFilters() {
    const locations = new Set();
    const offices = new Set();
    const areas = new Set();
    const publishTypes = new Set();
    
    allJobs.forEach(job => {
        if (job.LocationName) locations.add(job.LocationName);
        if (job.OfficeName) offices.add(job.OfficeName);
        if (job.Area) areas.add(job.Area);
        if (job.PublishmenTypeName) publishTypes.add(job.PublishmenTypeName);
    });
    
    populateSelect('locationFilter', Array.from(locations).sort());
    populateSelect('officeFilter', Array.from(offices).sort());
    populateSelect('areaFilter', Array.from(areas).sort());
    populateSelect('publishTypeFilter', Array.from(publishTypes).sort());
}

function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    const currentValue = select.value;
    
    // Keep first option (all)
    select.innerHTML = select.options[0].outerHTML;
    
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        select.appendChild(optionElement);
    });
    
    if (currentValue) select.value = currentValue;
}

// Apply filters and sorting
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const location = document.getElementById('locationFilter').value;
    const office = document.getElementById('officeFilter').value;
    const area = document.getElementById('areaFilter').value;
    const publishType = document.getElementById('publishTypeFilter').value;
    
    filteredJobs = allJobs.filter(job => {
        // Search filter
        if (searchTerm) {
            const searchFields = [
                job.TenderName,
                job.OfficeName,
                job.OfficeUnitName,
                job.LocationName,
                job.TenderNumber
            ].join(' ').toLowerCase();
            
            if (!searchFields.includes(searchTerm)) return false;
        }
        
        // Location filter
        if (location && job.LocationName !== location) return false;
        
        // Office filter
        if (office && job.OfficeName !== office) return false;
        
        // Area filter
        if (area && job.Area !== area) return false;
        
        // Publish type filter
        if (publishType && job.PublishmenTypeName !== publishType) return false;
        
        // Favorites filter
        if (showOnlyFavorites && !favorites.has(job.RequestId)) return false;
        
        return true;
    });
    
    sortJobs();
    renderJobs();
    updateDisplayCount();
}

// Sort jobs
function sortJobs() {
    const sortBy = document.getElementById('sortBy').value;
    const sortOrder = document.getElementById('sortOrder').value;
    
    filteredJobs.sort((a, b) => {
        let valueA, valueB;
        
        switch(sortBy) {
            case 'lastDate':
                valueA = parseDateString(a.LastSubmittingDate);
                valueB = parseDateString(b.LastSubmittingDate);
                break;
            case 'publishDate':
                valueA = parseDateString(a.TenderPublicationDate);
                valueB = parseDateString(b.TenderPublicationDate);
                break;
            case 'name':
                valueA = a.TenderName || '';
                valueB = b.TenderName || '';
                break;
            case 'office':
                valueA = a.OfficeName || '';
                valueB = b.OfficeName || '';
                break;
            case 'location':
                valueA = a.LocationName || '';
                valueB = b.LocationName || '';
                break;
            default:
                valueA = a.TenderName || '';
                valueB = b.TenderName || '';
        }
        
        let comparison = 0;
        if (valueA > valueB) comparison = 1;
        if (valueA < valueB) comparison = -1;
        
        return sortOrder === 'asc' ? comparison : -comparison;
    });
}

// Render jobs table and cards
function renderJobs() {
    const tbody = document.getElementById('jobsTableBody');
    const cardsContainer = document.getElementById('jobsCards');
    const noResults = document.getElementById('noResults');
    
    if (filteredJobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">לא נמצאו משרות</td></tr>';
        cardsContainer.innerHTML = '<div class="loading">לא נמצאו משרות</div>';
        noResults.style.display = 'block';
        return;
    }
    
    noResults.style.display = 'none';
    
    // Render desktop table
    tbody.innerHTML = filteredJobs.map(job => {
        const isFavorite = favorites.has(job.RequestId);
        const lastDate = parseDateString(job.LastSubmittingDate);
        const publishDate = parseDateString(job.TenderPublicationDate);
        const daysLeft = calculateDaysLeft(lastDate);
        
        return `
            <tr onclick="openJobModal('${job.RequestId}')" data-job-id="${job.RequestId}">
                <td onclick="event.stopPropagation()">
                    <button class="favorite-btn ${isFavorite ? 'active' : 'inactive'}" 
                            onclick="toggleFavorite('${job.RequestId}')">
                        ${isFavorite ? '⭐' : '☆'}
                    </button>
                </td>
                <td class="job-number">${job.TenderNumber || '-'}</td>
                <td class="job-name">${job.TenderName || '-'}</td>
                <td>${job.OfficeName || '-'}</td>
                <td>${job.OfficeUnitName || '-'}</td>
                <td>${job.LocationName || '-'}</td>
                <td>${job.Area || '-'}</td>
                <td>${formatDate(publishDate)}</td>
                <td>${formatDate(lastDate)}</td>
                <td>${renderDaysLeft(daysLeft)}</td>
                <td onclick="event.stopPropagation()">
                    <button class="btn btn-success" onclick="applyToJob('${job.RequestId}')">
                        הגש מועמדות
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Render mobile cards
    cardsContainer.innerHTML = filteredJobs.map(job => {
        const isFavorite = favorites.has(job.RequestId);
        const lastDate = parseDateString(job.LastSubmittingDate);
        const publishDate = parseDateString(job.TenderPublicationDate);
        const daysLeft = calculateDaysLeft(lastDate);
        
        return `
            <div class="job-card" onclick="openJobModal('${job.RequestId}')">
                <div class="job-card-header">
                    <div class="job-card-title">
                        <h3>${job.TenderName || 'ללא שם'}</h3>
                        <span class="job-card-number">מספר: ${job.TenderNumber || '-'}</span>
                    </div>
                    <div class="job-card-favorite" onclick="event.stopPropagation()">
                        <button class="favorite-btn ${isFavorite ? 'active' : 'inactive'}" 
                                onclick="toggleFavorite('${job.RequestId}')">
                            ${isFavorite ? '⭐' : '☆'}
                        </button>
                    </div>
                </div>
                
                <div class="job-card-info">
                    <div class="job-card-info-item">
                        <strong>🏢 משרד:</strong>
                        <span>${job.OfficeName || '-'}</span>
                    </div>
                    <div class="job-card-info-item">
                        <strong>🏛️ יחידה:</strong>
                        <span>${job.OfficeUnitName || '-'}</span>
                    </div>
                    <div class="job-card-info-item">
                        <strong>📍 מיקום:</strong>
                        <span>${job.LocationName || '-'} (${job.Area || '-'})</span>
                    </div>
                </div>
                
                <div class="job-card-footer">
                    <div class="job-card-date">
                        <div><strong>תאריך הגשה:</strong> ${formatDate(lastDate)}</div>
                        <div>${renderDaysLeft(daysLeft)}</div>
                    </div>
                    <div class="job-card-actions" onclick="event.stopPropagation()">
                        <button class="btn btn-success" onclick="applyToJob('${job.RequestId}')">
                            הגש
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Modal functions
let currentJobId = null;

function openJobModal(requestId) {
    const job = allJobs.find(j => j.RequestId === requestId);
    if (!job) return;
    
    currentJobId = requestId;
    
    // Set modal title
    document.getElementById('modalJobTitle').textContent = job.TenderName || 'פרטי המשרה';
    
    // Build modal content
    const lastDate = parseDateString(job.LastSubmittingDate);
    const publishDate = parseDateString(job.TenderPublicationDate);
    const daysLeft = calculateDaysLeft(lastDate);
    
    let modalHTML = `
        <div class="job-detail-section">
            <h3>מידע בסיסי</h3>
            <div class="job-detail-row">
                <div class="job-detail-label">מספר משרה:</div>
                <div class="job-detail-value">${job.TenderNumber || '-'}</div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">שם המשרה:</div>
                <div class="job-detail-value"><strong>${job.TenderName || '-'}</strong></div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">משרד:</div>
                <div class="job-detail-value">${job.OfficeName || '-'}</div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">יחידה ארגונית:</div>
                <div class="job-detail-value">${job.OfficeUnitName || '-'}</div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">דירוג משרה:</div>
                <div class="job-detail-value">${job.JobRatingName || '-'}</div>
            </div>
        </div>

        <div class="job-detail-section">
            <h3>מיקום ואזור</h3>
            <div class="job-detail-row">
                <div class="job-detail-label">מיקום:</div>
                <div class="job-detail-value">${job.LocationName || '-'}</div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">אזור:</div>
                <div class="job-detail-value">${job.Area || '-'}</div>
            </div>
        </div>

        <div class="job-detail-section">
            <h3>דרגה ותקן</h3>
            <div class="job-detail-row">
                <div class="job-detail-label">דרגה מ:</div>
                <div class="job-detail-value">${job.RankFrom || '-'}</div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">דרגה עד:</div>
                <div class="job-detail-value">${job.RankTo || '-'}</div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">מספר משרות:</div>
                <div class="job-detail-value">${job.NumberOfJobs || '-'}</div>
            </div>
        </div>

        <div class="job-detail-section">
            <h3>תאריכים חשובים</h3>
            <div class="job-detail-row">
                <div class="job-detail-label">תאריך פרסום:</div>
                <div class="job-detail-value">${formatDate(publishDate)}</div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">תאריך הגשה אחרון:</div>
                <div class="job-detail-value"><strong>${formatDate(lastDate)}</strong></div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">ימים נותרים:</div>
                <div class="job-detail-value">${renderDaysLeft(daysLeft)}</div>
            </div>
        </div>

        <div class="job-detail-section">
            <h3>פרטים נוספים</h3>
            <div class="job-detail-row">
                <div class="job-detail-label">סוג פרסום:</div>
                <div class="job-detail-value">${job.PublishmenTypeName || '-'}</div>
            </div>
            <div class="job-detail-row">
                <div class="job-detail-label">קוד משרד:</div>
                <div class="job-detail-value">${job.OfficeNumber || '-'}</div>
            </div>
        </div>
    `;
    
    // Add job requirements if exists
    if (job.JobRequirements && job.JobRequirements.trim()) {
        modalHTML += `
            <div class="job-requirements">
                <h4>📋 דרישות המשרה</h4>
                <p>${cleanHTML(job.JobRequirements)}</p>
            </div>
        `;
    }
    
    // Add job remarks if exists
    if (job.JobRemarks && job.JobRemarks.trim()) {
        modalHTML += `
            <div class="job-remarks">
                <h4>ℹ️ הערות והנחיות</h4>
                <p>${cleanHTML(job.JobRemarks)}</p>
            </div>
        `;
    }
    
    document.getElementById('modalJobDetails').innerHTML = modalHTML;
    document.getElementById('jobModal').style.display = 'block';
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
}

function closeJobModal() {
    document.getElementById('jobModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    currentJobId = null;
    
    // Close share menu if open
    if (shareMenuVisible) {
        toggleShareMenu();
    }
}

function applyFromModal() {
    if (currentJobId) {
        applyToJob(currentJobId);
    }
}

// Clean HTML tags and convert <br> to newlines
function cleanHTML(html) {
    if (!html) return '';
    
    // Replace <br> tags with newlines
    let cleaned = html.replace(/<br\s*\/?>/gi, '\n');
    
    // Remove other HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = cleaned;
    cleaned = textarea.value;
    
    return cleaned;
}

// Close modal when clicking outside
window.onclick = function(event) {
    const jobModal = document.getElementById('jobModal');
    const aboutModal = document.getElementById('aboutModal');
    const shareMenu = document.getElementById('shareMenu');
    const shareBtn = document.getElementById('shareToggleBtn');
    
    if (event.target === jobModal) {
        closeJobModal();
    }
    
    if (event.target === aboutModal) {
        closeAboutModal();
    }
    
    // Close share menu if clicking outside
    if (shareMenuVisible && shareMenu && !shareMenu.contains(event.target) && event.target !== shareBtn) {
        toggleShareMenu();
    }
}

// Close modal with ESC key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeJobModal();
        closeAboutModal();
    }
});

// About Modal functions
function openAboutModal() {
    document.getElementById('aboutModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeAboutModal() {
    document.getElementById('aboutModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Favorites management
function loadFavorites() {
    try {
        const stored = localStorage.getItem(FAVORITES_KEY);
        if (stored) {
            favorites = new Set(JSON.parse(stored));
        }
    } catch (error) {
        console.error('Error loading favorites:', error);
    }
}

function saveFavorites() {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
        updateStats();
    } catch (error) {
        console.error('Error saving favorites:', error);
    }
}

function toggleFavorite(requestId) {
    if (favorites.has(requestId)) {
        favorites.delete(requestId);
    } else {
        favorites.add(requestId);
    }
    saveFavorites();
    renderJobs();
}

function toggleFavoritesView() {
    showOnlyFavorites = !showOnlyFavorites;
    const btn = document.getElementById('showFavoritesBtn');
    
    if (showOnlyFavorites) {
        btn.textContent = '⭐ הצג את כל המשרות';
        btn.classList.add('btn-warning');
        btn.classList.remove('btn-secondary');
    } else {
        btn.innerHTML = '<span class="icon">⭐</span> הצג מועדפים בלבד';
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-secondary');
    }
    
    applyFilters();
}

// Apply to job
function applyToJob(requestId) {
    const url = `https://merkava.mrp.gov.il/giusp/index.html#/position/${requestId}`;
    window.open(url, '_blank');
}

// Date utilities
function parseDateString(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/\/Date\((\d+)\)\//);
    if (match) {
        return new Date(parseInt(match[1]));
    }
    return null;
}

function formatDate(date) {
    if (!date || !(date instanceof Date) || isNaN(date)) return '-';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
}

function calculateDaysLeft(date) {
    if (!date) return -1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function renderDaysLeft(days) {
    if (days < 0) {
        return '<span class="days-left urgent">פג תוקף</span>';
    } else if (days === 0) {
        return '<span class="days-left urgent">יום אחרון!</span>';
    } else if (days <= 7) {
        return `<span class="days-left urgent">${days} ימים</span>`;
    } else if (days <= 14) {
        return `<span class="days-left warning">${days} ימים</span>`;
    } else {
        return `<span class="days-left normal">${days} ימים</span>`;
    }
}

// UI updates
function updateStats() {
    document.getElementById('totalJobs').textContent = allJobs.length;
    document.getElementById('favoriteCount').textContent = favorites.size;
}

function updateDisplayCount() {
    document.getElementById('displayCount').textContent = filteredJobs.length;
    document.getElementById('totalCount').textContent = allJobs.length;
}

function updateLastUpdateTime() {
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (timestamp) {
        const date = new Date(parseInt(timestamp));
        document.getElementById('lastUpdate').textContent = formatDate(date) + ' ' + 
            date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    }
}

// Clear search
function clearSearch() {
    document.getElementById('searchInput').value = '';
    applyFilters();
}

// Reset filters
function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('locationFilter').value = '';
    document.getElementById('officeFilter').value = '';
    document.getElementById('areaFilter').value = '';
    document.getElementById('publishTypeFilter').value = '';
    document.getElementById('sortBy').value = 'lastDate';
    document.getElementById('sortOrder').value = 'asc';
    
    showOnlyFavorites = false;
    const btn = document.getElementById('showFavoritesBtn');
    btn.innerHTML = '<span class="icon">⭐</span> הצג מועדפים בלבד';
    btn.classList.remove('btn-warning');
    btn.classList.add('btn-secondary');
    
    applyFilters();
}

// Error handling
function showError(message) {
    const tbody = document.getElementById('jobsTableBody');
    tbody.innerHTML = `<tr><td colspan="11" class="loading" style="color: var(--danger-color);">${message}</td></tr>`;
}
