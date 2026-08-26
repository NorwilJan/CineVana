// TMDB API Configuration
const TMDB_API_KEY = '1f54bd990f1cd883081b4f49234172cd';
const BASE_URL = 'https://api.themoviedb.org/3';

// Strict K-Drama Endpoint: Origin Country South Korea (KR) + Drama Genre (18)
const KDRAMA_DISCOVER_URL = `${BASE_URL}/discover/tv?api_key=${TMDB_API_KEY}&with_origin_country=KR&with_genres=18&sort_by=popularity.desc`;
const SEARCH_URL = `${BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&with_origin_country=KR&query=`;

// Application State
let currentTmdbId = null;
let currentSeason = 1;
let currentEpisode = 1;
let activeServerId = 1;
let totalSeasons = 1;
let episodeCounts = {};

// DOM Elements
const mediaGrid = document.getElementById('mediaGrid');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const playerModal = document.getElementById('playerModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const videoPlayerIframe = document.getElementById('videoPlayerIframe');
const modalTitle = document.getElementById('modalTitle');
const seasonSelect = document.getElementById('seasonSelect');
const episodeSelect = document.getElementById('episodeSelect');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    fetchKDramas(KDRAMA_DISCOVER_URL);

    // Event Listeners
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    closeModalBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === playerModal) closeModal();
    });
});

// Fetch K-Dramas from TMDB
async function fetchKDramas(url) {
    try {
        mediaGrid.innerHTML = '<div class="loading">Loading K-Dramas...</div>';
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            displayKDramas(data.results);
        } else {
            mediaGrid.innerHTML = '<p class="no-results">No Korean dramas found.</p>';
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        mediaGrid.innerHTML = '<p class="no-results">Failed to load content. Please check your connection.</p>';
    }
}

// Display Grid Cards
function displayKDramas(shows) {
    mediaGrid.innerHTML = '';
    shows.forEach(show => {
        const title = show.name || show.original_name;
        const posterPath = show.poster_path 
            ? `https://image.tmdb.org/t/p/w500${show.poster_path}` 
            : 'https://via.placeholder.com/500x750?text=No+Image';
        const rating = show.vote_average ? show.vote_average.toFixed(1) : 'N/A';
        const releaseYear = show.first_air_date ? show.first_air_date.split('-')[0] : '';

        const card = document.createElement('div');
        card.className = 'media-card';
        card.innerHTML = `
            <div class="poster-container">
                <img src="${posterPath}" alt="${title}" loading="lazy">
                <span class="rating"><i class="fa-solid fa-star"></i> ${rating}</span>
            </div>
            <div class="media-info">
                <h3>${title}</h3>
                <span>${releaseYear}</span>
            </div>
        `;

        card.addEventListener('click', () => openPlayer(show.id, title));
        mediaGrid.appendChild(card);
    });
}

// Search Handler
function performSearch() {
    const query = searchInput.value.trim();
    if (query) {
        fetchKDramas(`${SEARCH_URL}${encodeURIComponent(query)}`);
    } else {
        fetchKDramas(KDRAMA_DISCOVER_URL);
    }
}

// Open Player Modal & Fetch Detailed Series Metadata
async function openPlayer(tmdbId, title) {
    currentTmdbId = tmdbId;
    modalTitle.textContent = title;
    currentSeason = 1;
    currentEpisode = 1;
    activeServerId = 1;

    updateServerButtonsUI();

    try {
        const res = await fetch(`${BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
        const showData = await res.json();
        
        if (showData.seasons) {
            const validSeasons = showData.seasons.filter(s => s.season_number > 0);
            totalSeasons = validSeasons.length > 0 ? validSeasons.length : 1;
            
            seasonSelect.innerHTML = '';
            validSeasons.forEach(season => {
                const opt = document.createElement('option');
                opt.value = season.season_number;
                opt.textContent = `Season ${season.season_number} (${season.episode_count} Eps)`;
                seasonSelect.appendChild(opt);
                episodeCounts[season.season_number] = season.episode_count || 16;
            });
        } else {
            totalSeasons = 1;
            seasonSelect.innerHTML = '<option value="1">Season 1</option>';
            episodeCounts[1] = 16;
        }

        updateEpisodeDropdown(currentSeason);
        loadIframeSource();
        playerModal.classList.remove('hidden');
    } catch (err) {
        console.error('Error fetching series details:', err);
        episodeCounts[1] = 16;
        updateEpisodeDropdown(1);
        loadIframeSource();
        playerModal.classList.remove('hidden');
    }
}

// Update Episode Dropdown
function updateEpisodeDropdown(seasonNum) {
    episodeSelect.innerHTML = '';
    const maxEps = episodeCounts[seasonNum] || 16;
    for (let i = 1; i <= maxEps; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `Episode ${i}`;
        episodeSelect.appendChild(opt);
    }
    episodeSelect.value = currentEpisode;
}

// Handle Season Change
function handleSeasonChange() {
    currentSeason = parseInt(seasonSelect.value);
    currentEpisode = 1;
    updateEpisodeDropdown(currentSeason);
    loadIframeSource();
}

// Handle Episode Change
function handleEpisodeChange() {
    currentEpisode = parseInt(episodeSelect.value);
    loadIframeSource();
}

// Server Switcher Logic
function switchServer(serverId) {
    activeServerId = serverId;
    updateServerButtonsUI();
    loadIframeSource();
}

function updateServerButtonsUI() {
    const buttons = document.querySelectorAll('.server-btn');
    buttons.forEach((btn, index) => {
        if (index + 1 === activeServerId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Get Stable Embed URLs for Servers (Updated working backups)
function loadIframeSource() {
    if (!currentTmdbId) return;
    let embedUrl = '';

    switch (activeServerId) {
        case 1:
            embedUrl = `https://vidsrc.cc/v2/embed/tv/${currentTmdbId}/${currentSeason}/${currentEpisode}`;
            break;
        case 2:
            embedUrl = `https://vidsrc.su/embed/tv/${currentTmdbId}/${currentSeason}/${currentEpisode}`;
            break;
        case 3:
            embedUrl = `https://www.2embed.cc/embedtv/${currentTmdbId}&s=${currentSeason}&e=${currentEpisode}`;
            break;
        default:
            embedUrl = `https://vidsrc.cc/v2/embed/tv/${currentTmdbId}/${currentSeason}/${currentEpisode}`;
    }

    videoPlayerIframe.src = embedUrl;
}

// Close Modal
function closeModal() {
    playerModal.classList.add('hidden');
    videoPlayerIframe.src = '';
}
