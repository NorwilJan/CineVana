const TMDB_API_KEY = '5a4436ae184be5296839bb2f354f9a74'; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const PLACEHOLDER_IMG = 'https://via.placeholder.com/300x450/1f1f1f/777777?text=No+Image';

let fullDataCache = {
  movies: [],
  tagalog: [],
  vivamax: [],
  tv: [],
  kdrama: []
};

let currentItem = null;
let currentSeason = 1;
let currentEpisode = 1;
let currentServer = 'videasy';

window.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupNavbarScroll();
});

async function initApp() {
  await loadHeroBanner();
  await loadAllRows();
  renderWatchlistRow();
  renderContinueWatchingRow();
}

function setupNavbarScroll() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

async function fetchTMDB(endpoint) {
  try {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${TMDB_BASE_URL}${endpoint}${separator}api_key=${TMDB_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("API Fetch Error:", error);
    return null;
  }
}

async function loadHeroBanner() {
  const data = await fetchTMDB('/trending/all/day');
  if (data && data.results && data.results.length > 0) {
    const items = data.results.filter(item => item.backdrop_path);
    const randomItem = items[Math.floor(Math.random() * items.length)];
    
    document.getElementById('hero-banner').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${randomItem.backdrop_path})`;
    document.getElementById('hero-title').innerText = randomItem.title || randomItem.name;
    document.getElementById('hero-overview').innerText = randomItem.overview;
    
    document.getElementById('hero-play-btn').onclick = () => showDetails(randomItem);
    document.getElementById('hero-info-btn').onclick = () => showDetails(randomItem);
  }
}

async function loadAllRows() {
  // 1. Trending Movies
  const trendingMovies = await fetchTMDB('/trending/movie/week');
  if (trendingMovies) {
    fullDataCache.movies = trendingMovies.results;
    renderRow('trending-movies-row', trendingMovies.results);
  }

  // 2. Tagalog / Local Movies (Language code 'tl')
  const tagalogData = await fetchTMDB('/discover/movie?with_original_language=tl&sort_by=popularity.desc');
  if (tagalogData) {
    fullDataCache.tagalog = tagalogData.results;
    renderRow('tagalog-row', tagalogData.results);
  }

  // 3. Vivamax style curation (Tagalog drama/thriller/romance focus)
  const vivamaxData = await fetchTMDB('/discover/movie?with_original_language=tl&with_genres=18,53,10749&sort_by=vote_count.desc');
  if (vivamaxData && vivamaxData.results.length > 0) {
    fullDataCache.vivamax = vivamaxData.results;
    renderRow('vivamax-row', vivamaxData.results);
  } else {
    fullDataCache.vivamax = tagalogData ? tagalogData.results : [];
    renderRow('vivamax-row', fullDataCache.vivamax);
  }

  // 4. Popular TV Shows
  const tvData = await fetchTMDB('/tv/popular');
  if (tvData) {
    fullDataCache.tv = tvData.results;
    renderRow('tv-row', tvData.results);
  }

  // 5. K-Drama Favorites (Korean TV series)
  const kdramaData = await fetchTMDB('/discover/tv?with_original_language=ko&sort_by=popularity.desc');
  if (kdramaData) {
    fullDataCache.kdrama = kdramaData.results;
    renderRow('kdrama-row', kdramaData.results);
  }
}

function renderRow(rowId, items) {
  const scroller = document.getElementById(rowId);
  if (!scroller) return;
  
  scroller.innerHTML = '';
  items.forEach(item => {
    if (!item.poster_path) return;
    const card = createMovieCard(item);
    scroller.appendChild(card);
  });
}

function createMovieCard(item) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  
  const img = document.createElement('img');
  img.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
  img.alt = item.title || item.name;
  img.onerror = () => { img.src = PLACEHOLDER_IMG; };
  
  card.appendChild(img);
  card.onclick = () => showDetails(item);
  return card;
}

function scrollRow(rowId, direction) {
  const scroller = document.getElementById(rowId);
  if (scroller) {
    const scrollAmount = scroller.clientWidth * 0.75;
    scroller.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
  }
}

async function showDetails(item) {
  currentItem = item;
  currentSeason = 1;
  currentEpisode = 1;
  currentServer = 'videasy'; // Reset to default server

  // Reset active state on server buttons
  document.querySelectorAll('.server-btn').forEach((btn, idx) => {
    if (idx === 0) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  const isTv = getMediaType(item) === 'tv';

  document.getElementById('modal-title').innerText = item.title || item.name;
  document.getElementById('modal-overview').innerText = item.overview || 'No description available.';
  document.getElementById('modal-year').innerText = (item.release_date || item.first_air_date || '').substring(0, 4) || '2026';
  document.getElementById('modal-banner').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${item.backdrop_path || item.poster_path})`;

  updateWatchlistButtonState();

  const tvSelectors = document.getElementById('tv-selectors');
  if (isTv) {
    tvSelectors.style.display = 'block';
    await loadTVSeasons(item.id);
  } else {
    tvSelectors.style.display = 'none';
  }

  loadVideo();
  saveToContinueWatching(item);

  document.getElementById('details-modal').classList.add('active');
}

function closeDetailsModal() {
  document.getElementById('details-modal').classList.remove('active');
  document.getElementById('modal-video').src = ''; 
  renderContinueWatchingRow();
}

function getMediaType(item) {
  if (item.media_type) return item.media_type;
  return item.first_air_date || item.name ? 'tv' : 'movie';
}

function loadVideo() {
  if (!currentItem) return;

  const iframe = document.getElementById('modal-video');
  const serverSelector = document.getElementById('server-selector');
  if (!iframe) return;

  const isTv = getMediaType(currentItem) === 'tv';

  if (serverSelector) {
    serverSelector.style.display = 'flex';
  }

  let embedURL = '';

  if (currentServer === 'vidsrc') {
    if (isTv) {
      embedURL = `https://vidsrc.xyz/embed/tv?tmdb=${currentItem.id}&season=${currentSeason}&episode=${currentEpisode}`;
    } else {
      embedURL = `https://vidsrc.xyz/embed/movie?tmdb=${currentItem.id}`;
    }
  } else {
    if (isTv) {
      embedURL = `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
    } else {
      embedURL = `https://player.videasy.net/movie/${currentItem.id}`;
    }
  }

  if (iframe.src !== embedURL) {
    iframe.src = embedURL;
  }
}

function switchServer(serverName, eventElement) {
  currentServer = serverName;

  document.querySelectorAll('.server-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  if (eventElement) {
    eventElement.classList.add('active');
  }

  loadVideo();
}

function scrollToPlayer() {
  const container = document.getElementById('video-container');
  if (container) {
    container.scrollIntoView({ behavior: 'smooth' });
  }
}

async function loadTVSeasons(tvId) {
  const data = await fetchTMDB(`/tv/${tvId}`);
  const seasonSelect = document.getElementById('season-select');
  seasonSelect.innerHTML = '';

  if (data && data.seasons) {
    data.seasons.forEach(season => {
      if (season.season_number > 0) {
        const opt = document.createElement('option');
        opt.value = season.season_number;
        opt.textContent = season.name || `Season ${season.season_number}`;
        seasonSelect.appendChild(opt);
      }
    });
    loadEpisodesForSeason(tvId, seasonSelect.value || 1);
  }
}

async function loadEpisodesForSeason(tvId, seasonNum) {
  currentSeason = seasonNum;
  const data = await fetchTMDB(`/tv/${tvId}/season/${seasonNum}`);
  const episodeList = document.getElementById('episode-list');
  episodeList.innerHTML = '';

  if (data && data.episodes) {
    data.episodes.forEach((ep, index) => {
      const btn = document.createElement('button');
      btn.className = `episode-btn ${index === 0 ? 'active' : ''}`;
      btn.textContent = `Ep ${ep.episode_number}`;
      btn.onclick = () => {
        document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentEpisode = ep.episode_number;
        loadVideo();
      };
      episodeList.appendChild(btn);
    });
    if (data.episodes.length > 0) {
      currentEpisode = data.episodes[0].episode_number;
      loadVideo();
    }
  }
}

function onSeasonChange() {
  const seasonSelect = document.getElementById('season-select');
  loadEpisodesForSeason(currentItem.id, seasonSelect.value);
}

// SURPRISE ME (RANDOM MOVIE) FUNCTION
function playRandomMovie() {
  const allItems = [
    ...(fullDataCache.movies || []),
    ...(fullDataCache.tagalog || []),
    ...(fullDataCache.vivamax || []),
    ...(fullDataCache.tv || []),
    ...(fullDataCache.kdrama || [])
  ];

  const validItems = allItems.filter(item => item && item.poster_path);

  if (validItems.length === 0) {
    alert("Still loading content, please try again in a moment!");
    return;
  }

  const randomIndex = Math.floor(Math.random() * validItems.length);
  const randomChosen = validItems[randomIndex];

  showDetails(randomChosen);
}

// WATCHLIST SYSTEM (LOCAL STORAGE)
function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem('streamvault_watchlist')) || [];
  } catch (e) {
    return [];
  }
}

function toggleWatchlistCurrent() {
  if (!currentItem) return;
  let watchlist = getWatchlist();
  const index = watchlist.findIndex(item => item.id === currentItem.id);

  if (index > -1) {
    watchlist.splice(index, 1);
  } else {
    watchlist.push(currentItem);
  }

  localStorage.setItem('streamvault_watchlist', JSON.stringify(watchlist));
  updateWatchlistButtonState();
  renderWatchlistRow();
}

function updateWatchlistButtonState() {
  if (!currentItem) return;
  const watchlist = getWatchlist();
  const btn = document.getElementById('modal-watchlist-btn');
  const exists = watchlist.some(item => item.id === currentItem.id);

  if (exists) {
    btn.innerHTML = `<i class="fa-solid fa-check"></i> In List`;
  } else {
    btn.innerHTML = `<i class="fa-solid fa-plus"></i> My List`;
  }
}

function renderWatchlistRow() {
  const watchlist = getWatchlist();
  const section = document.getElementById('watchlist-section');
  const row = document.getElementById('watchlist-row');

  if (watchlist.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  row.innerHTML = '';
  watchlist.forEach(item => {
    row.appendChild(createMovieCard(item));
  });
}

// CONTINUE WATCHING SYSTEM
function getContinueWatching() {
  try {
    return JSON.parse(localStorage.getItem('streamvault_continue')) || [];
  } catch (e) {
    return [];
  }
}

function saveToContinueWatching(item) {
  let list = getContinueWatching();
  list = list.filter(i => i.id !== item.id);
  list.unshift(item);
  if (list.length > 10) list.pop(); // Keep top 10
  localStorage.setItem('streamvault_continue', JSON.stringify(list));
}

function renderContinueWatchingRow() {
  const list = getContinueWatching();
  const section = document.getElementById('continue-watching-section');
  const row = document.getElementById('continue-row');

  if (list.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  row.innerHTML = '';
  list.forEach(item => {
    row.appendChild(createMovieCard(item));
  });
}

// SEARCH MODAL
function openSearchModal() {
  document.getElementById('search-modal').classList.add('active');
  document.getElementById('search-input').focus();
}

function closeSearchModal() {
  document.getElementById('search-modal').classList.remove('active');
}

let searchTimeout = null;
function handleSearchInput(event) {
  const query = event.target.value.trim();
  clearTimeout(searchTimeout);

  if (query.length < 2) {
    document.getElementById('search-results-grid').innerHTML = '<div class="search-placeholder">Type at least 2 characters to search...</div>';
    return;
  }

  searchTimeout = setTimeout(async () => {
    const data = await fetchTMDB(`/search/multi?query=${encodeURIComponent(query)}`);
    const grid = document.getElementById('search-results-grid');
    grid.innerHTML = '';

    if (data && data.results && data.results.length > 0) {
      const filtered = data.results.filter(item => item.poster_path && (item.media_type === 'movie' || item.media_type === 'tv'));
      if (filtered.length === 0) {
        grid.innerHTML = '<div class="search-placeholder">No matching titles found.</div>';
        return;
      }
      filtered.forEach(item => {
        const card = createMovieCard(item);
        // Close search modal when clicking card
        card.addEventListener('click', () => closeSearchModal());
        grid.appendChild(card);
      });
    } else {
      grid.innerHTML = '<div class="search-placeholder">No matching titles found.</div>';
    }
  }, 350);
}

// SEE ALL MODAL
async function openSeeAllModal(categoryKey, titleText) {
  document.getElementById('see-all-title').innerText = titleText;
  const grid = document.getElementById('see-all-grid');
  grid.innerHTML = '<div class="search-placeholder">Loading items...</div>';
  document.getElementById('see-all-modal').classList.add('active');

  let items = fullDataCache[categoryKey] || [];
  
  if (items.length === 0) {
    if (categoryKey === 'movies') {
      const res = await fetchTMDB('/movie/popular');
      items = res ? res.results : [];
    } else if (categoryKey === 'tv') {
      const res = await fetchTMDB('/tv/popular');
      items = res ? res.results : [];
    }
  }

  grid.innerHTML = '';
  items.forEach(item => {
    if (!item.poster_path) return;
    const card = createMovieCard(item);
    card.addEventListener('click', () => {
      closeSeeAllModal();
    });
    grid.appendChild(card);
  });
}

function closeSeeAllModal() {
  document.getElementById('see-all-modal').classList.remove('active');
}
