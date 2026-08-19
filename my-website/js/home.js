const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

let currentItem;
let bannerItem;
let currentSeason = 1;
let currentEpisode = 1;
let currentServer = 'videasy';
let searchTimeout;
let showDetailsCache = {};
let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  kdrama: []
};

// Smart Cache Wrapper for API Requests (Expires in 1 hour)
async function cachedFetch(endpoint, maxPages = 3) {
  const cacheKey = `tmdb_cache_${endpoint}_pages_${maxPages}`;
  const cachedData = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(`${cacheKey}_time`);
  
  const ONE_HOUR = 60 * 60 * 1000;
  
  if (cachedData && cachedTime && (Date.now() - parseInt(cachedTime) < ONE_HOUR)) {
    return JSON.parse(cachedData);
  }

  let allResults = [];
  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(`${BASE_URL}${endpoint}&page=${page}&api_key=${API_KEY}`);
      const data = await res.json();
      if (data.results) {
        allResults = allResults.concat(data.results);
      }
    }
    localStorage.setItem(cacheKey, JSON.stringify(allResults));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
  } catch (error) {
    console.error("Error fetching multiple pages:", error);
    if (cachedData) return JSON.parse(cachedData);
  }
  return allResults;
}

async function fetchTrending(type) {
  return await cachedFetch(`/trending/${type}/week?`, 3);
}

async function fetchTrendingAnime() {
  let allResults = [];
  try {
    const cacheKey = `tmdb_cache_trending_anime`;
    const cachedData = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem(`${cacheKey}_time`);
    const ONE_HOUR = 60 * 60 * 1000;

    if (cachedData && cachedTime && (Date.now() - parseInt(cachedTime) < ONE_HOUR)) {
      return JSON.parse(cachedData);
    }

    for (let page = 1; page <= 5; page++) {
      const res = await fetch(`${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${page}`);
      const data = await res.json();
      if (data.results) {
        const filtered = data.results.filter(item =>
          item.original_language === 'ja' && item.genre_ids && item.genre_ids.includes(16)
        );
        allResults = allResults.concat(filtered);
      }
    }
    localStorage.setItem(cacheKey, JSON.stringify(allResults));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
  } catch (error) {
    console.error("Error fetching anime:", error);
  }
  return allResults;
}

async function fetchTagalogContent() {
  return await cachedFetch(`/discover/movie?with_original_language=tl&sort_by=popularity.desc`, 3);
}

async function fetchKDramas() {
  return await cachedFetch(`/discover/tv?with_original_language=ko&sort_by=popularity.desc`, 3);
}

async function fetchByGenreId(genreId) {
  return await cachedFetch(`/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`, 3);
}

function displayBanner(item) {
  bannerItem = item;
  document.getElementById('banner').style.backgroundImage = `url(${IMG_URL}${item.backdrop_path})`;
  document.getElementById('banner-title').textContent = item.title || item.name;
}

function playBanner() {
  if (bannerItem) showDetails(bannerItem);
}

function displayList(items, containerId, mediaType) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const slicedItems = items.slice(0, 20);
  
  slicedItems.forEach(item => {
    if (!item.poster_path) return;
    if (!item.media_type) item.media_type = mediaType;
    
    const img = document.createElement('img');
    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.onclick = () => showDetails(item);
    container.appendChild(img);
  });
}

// Show Details with Progress Restoration
async function showDetails(item) {
  currentItem = item;
  
  let continueList = getContinueWatching();
  let savedProgress = continueList.find(i => i.id === item.id);
  
  currentSeason = savedProgress ? (savedProgress.savedSeason || 1) : 1;
  currentEpisode = savedProgress ? (savedProgress.savedEpisode || 1) : 1;
  
  document.getElementById('modal-title').textContent = item.title || item.name;
  document.getElementById('modal-description').textContent = item.overview;
  document.getElementById('modal-image').src = `${IMG_URL}${item.poster_path}`;
  document.getElementById('modal-rating').innerHTML = '★'.repeat(Math.round(item.vote_average / 2));
  
  updateWatchlistButton();
  saveCurrentProgress();

  const isTv = currentItem.media_type === "tv" || !currentItem.title;
  const seriesOptions = document.getElementById('series-options');

  if (isTv) {
    seriesOptions.style.display = 'flex';
    await loadTVSeasons(currentItem.id, currentSeason, currentEpisode);
  } else {
    seriesOptions.style.display = 'none';
    loadVideo();
  }
  
  document.getElementById('modal').style.display = 'flex';
  document.body.classList.add('modal-open');
}

async function loadTVSeasons(tvId, targetSeason = 1, targetEpisode = 1) {
  const seasonSelect = document.getElementById('season-select');
  seasonSelect.innerHTML = '';

  try {
    let data = showDetailsCache[tvId];
    if (!data) {
      const res = await fetch(`${BASE_URL}/tv/${tvId}?api_key=${API_KEY}`);
      data = await res.json();
      showDetailsCache[tvId] = data;
    }

    if (data.seasons) {
      data.seasons.forEach(season => {
        if (season.season_number > 0) {
          const option = document.createElement('option');
          option.value = season.season_number;
          option.textContent = season.name || `Season ${season.season_number}`;
          if (season.season_number === targetSeason) {
            option.selected = true;
          }
          seasonSelect.appendChild(option);
        }
      });
    }

    currentSeason = targetSeason;
    currentEpisode = targetEpisode;
    await loadEpisodes(tvId, targetSeason);
  } catch (error) {
    console.error("Error loading TV seasons:", error);
  }
}

async function loadEpisodes(tvId, seasonNumber) {
  currentSeason = seasonNumber;
  const episodesContainer = document.getElementById('episodes-container');
  episodesContainer.innerHTML = '';

  try {
    const res = await fetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`);
    const data = await res.json();

    if (data.episodes && data.episodes.length > 0) {
      if (!currentEpisode || currentSeason !== seasonNumber) {
        currentEpisode = data.episodes[0].episode_number;
      }

      data.episodes.forEach(ep => {
        const btn = document.createElement('button');
        btn.className = `episode-btn ${ep.episode_number === currentEpisode ? 'active' : ''}`;
        btn.textContent = `Ep ${ep.episode_number}`;
        btn.onclick = () => {
          document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentEpisode = ep.episode_number;
          loadVideo();
          saveCurrentProgress();
        };
        episodesContainer.appendChild(btn);
      });
    }
    loadVideo();
  } catch (error) {
    console.error("Error loading episodes:", error);
  }
}

function onSeasonChange() {
  const selectedSeason = document.getElementById('season-select').value;
  loadEpisodes(currentItem.id, parseInt(selectedSeason));
}

function loadVideo() {
  const isTv = currentItem.media_type === "tv" || !currentItem.title;
  let embedURL = '';

  if (currentServer === 'videasy') {
    if (isTv) {
      embedURL = `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
    } else {
      embedURL = `https://player.videasy.net/movie/${currentItem.id}`;
    }
  } else if (currentServer === 'vidsrc') {
    // Fixed working backup provider format (vidsrc.cc)
    if (isTv) {
      embedURL = `https://vidsrc.cc/v2/embed/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
    } else {
      embedURL = `https://vidsrc.cc/v2/embed/movie/${currentItem.id}`;
    }
  }

  document.getElementById('modal-video').src = embedURL;
}

function switchServer(serverName, eventElement) {
  currentServer = serverName;
  
  document.querySelectorAll('.server-btn').forEach(btn => {
    btn.style.background = '#222';
    btn.style.color = '#aaa';
    btn.style.borderColor = '#444';
  });
  eventElement.style.background = '#e50914';
  eventElement.style.color = '#fff';
  eventElement.style.borderColor = '#e50914';

  loadVideo();
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  document.getElementById('modal-video').src = 'about:blank';
  document.body.classList.remove('modal-open');
}

// Watchlist Logic & Toast Notifications
function getWatchlist() {
  return JSON.parse(localStorage.getItem('myList')) || [];
}

function isItemInWatchlist(id) {
  const list = getWatchlist();
  return list.some(item => item.id === id);
}

function toggleWatchlist() {
  if (!currentItem) return;
  let list = getWatchlist();
  const index = list.findIndex(item => item.id === currentItem.id);
  const title = currentItem.title || currentItem.name;
  
  if (index > -1) {
    list.splice(index, 1);
    showToast(`Removed "${title}" from your list`);
  } else {
    list.push(currentItem);
    showToast(`Added "${title}" to your list`);
  }
  
  localStorage.setItem('myList', JSON.stringify(list));
  updateWatchlistButton();
  renderWatchlistRow();
}

function updateWatchlistButton() {
  const btn = document.getElementById('watchlist-btn');
  if (!btn || !currentItem) return;
  if (isItemInWatchlist(currentItem.id)) {
    btn.textContent = 'Remove from List';
    btn.classList.add('remove');
  } else {
    btn.textContent = 'Add to List';
    btn.classList.remove('remove');
  }
}

function renderWatchlistRow() {
  const list = getWatchlist();
  const row = document.getElementById('watchlist-row');
  if (list.length === 0) {
    row.style.display = 'none';
  } else {
    row.style.display = 'block';
    displayList(list, 'watchlist-list', 'movie');
  }
}

// Continue Watching Logic
function getContinueWatching() {
  return JSON.parse(localStorage.getItem('continueWatching')) || [];
}

function saveCurrentProgress() {
  if (!currentItem) return;
  let list = getContinueWatching();
  let existingIndex = list.findIndex(i => i.id === currentItem.id);
  
  const itemData = {
    ...currentItem,
    savedSeason: currentSeason,
    savedEpisode: currentEpisode,
    lastWatched: Date.now()
  };

  if (existingIndex > -1) {
    list.splice(existingIndex, 1);
  }
  
  list.unshift(itemData);
  if (list.length > 15) list.pop();
  
  localStorage.setItem('continueWatching', JSON.stringify(list));
  renderContinueWatchingRow();
}

function renderContinueWatchingRow() {
  const list = getContinueWatching();
  const row = document.getElementById('continue-row');
  if (list.length === 0) {
    row.style.display = 'none';
  } else {
    row.style.display = 'block';
    displayList(list, 'continue-list', 'movie');
  }
}

// Toast Notification System
function showToast(message) {
  const toast = document.getElementById('toast-container');
  if (!toast) return;
  
  toast.textContent = message;
  toast.classList.add('show');
  
  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Category Tab Filtering
function filterContent(category, eventElement) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  eventElement.classList.add('active');

  const continueRow = document.getElementById('continue-row');
  const watchlistRow = document.getElementById('watchlist-row');
  const moviesRow = document.getElementById('movies-row');
  const tvRow = document.getElementById('tvshows-row');
  const animeRow = document.getElementById('anime-row');
  const tagalogRow = document.getElementById('tagalog-row');
  const kdramaRow = document.getElementById('kdrama-row');

  const hasWatchlist = getWatchlist().length > 0;
  const hasContinue = getContinueWatching().length > 0;

  if (category === 'all') {
    if (hasContinue) continueRow.style.display = 'block';
    if (hasWatchlist) watchlistRow.style.display = 'block';
    moviesRow.style.display = 'block';
    tvRow.style.display = 'block';
    animeRow.style.display = 'block';
    tagalogRow.style.display = 'block';
    kdramaRow.style.display = 'block';
  } else if (category === 'movie') {
    continueRow.style.display = 'none';
    watchlistRow.style.display = 'none';
    moviesRow.style.display = 'block';
    tvRow.style.display = 'none';
    animeRow.style.display = 'none';
    tagalogRow.style.display = 'block';
    kdramaRow.style.display = 'none';
  } else if (category === 'tv') {
    continueRow.style.display = 'none';
    watchlistRow.style.display = 'none';
    moviesRow.style.display = 'none';
    tvRow.style.display = 'block';
    animeRow.style.display = 'none';
    tagalogRow.style.display = 'none';
    kdramaRow.style.display = 'block';
  } else if (category === 'anime') {
    continueRow.style.display = 'none';
    watchlistRow.style.display = 'none';
    moviesRow.style.display = 'none';
    tvRow.style.display = 'none';
    animeRow.style.display = 'block';
    tagalogRow.style.display = 'none';
    kdramaRow.style.display = 'none';
  }
}

async function filterByGenre(genreId, eventElement) {
  document.querySelectorAll('.genre-btn').forEach(btn => btn.classList.remove('active'));
  eventElement.classList.add('active');

  if (genreId === 'all') {
    init();
    return;
  }

  const genreResults = await fetchByGenreId(genreId);
  
  document.getElementById('continue-row').style.display = 'none';
  document.getElementById('watchlist-row').style.display = 'none';
  document.getElementById('tvshows-row').style.display = 'none';
  document.getElementById('anime-row').style.display = 'none';
  document.getElementById('tagalog-row').style.display = 'none';
  document.getElementById('kdrama-row').style.display = 'none';

  const moviesRow = document.getElementById('movies-row');
  moviesRow.style.display = 'block';
  moviesRow.querySelector('h2').textContent = `${eventElement.textContent} Movies`;
  displayList(genreResults, 'movies-list', 'movie');
}

// See All Grid Modal Logic
function openGridModal(category) {
  const modal = document.getElementById('grid-modal');
  const titleEl = document.getElementById('grid-modal-title');
  const container = document.getElementById('grid-modal-results');
  container.innerHTML = '';

  let items = fullDataCache[category] || [];
  
  if (category === 'movies') titleEl.textContent = 'Trending Movies';
  if (category === 'tv') titleEl.textContent = 'Trending TV Shows';
  if (category === 'anime') titleEl.textContent = 'Trending Anime';
  if (category === 'tagalog') titleEl.textContent = 'Trending Tagalog Movies';
  if (category === 'kdrama') titleEl.textContent = 'Trending K-Dramas';

  items.forEach(item => {
    if (!item.poster_path) return;
    const img = document.createElement('img');
    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.onclick = () => {
      closeGridModal();
      showDetails(item);
    };
    container.appendChild(img);
  });

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

function closeGridModal() {
  document.getElementById('grid-modal').style.display = 'none';
  document.body.classList.remove('modal-open');
}

function openSearchModal() {
  document.getElementById('search-modal').style.display = 'flex';
  document.getElementById('search-input').focus();
}

function closeSearchModal() {
  document.getElementById('search-modal').style.display = 'none';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = '';
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    searchTMDB();
  }, 300);
}

async function searchTMDB() {
  const query = document.getElementById('search-input').value;
  if (!query.trim()) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }

  const res = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&query=${query}`);
  const data = await res.json();

  const container = document.getElementById('search-results');
  container.innerHTML = '';
  data.results.forEach(item => {
    if (!item.poster_path || item.media_type === 'person') return;
    if (!item.media_type) {
      item.media_type = item.title ? 'movie' : 'tv';
    }
    const img = document.createElement('img');
    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.onclick = () => {
      closeSearchModal();
      showDetails(item);
    };
    container.appendChild(img);
  });
}

async function init() {
  const movies = await fetchTrending('movie');
  const tvShows = await fetchTrending('tv');
  const anime = await fetchTrendingAnime();
  const tagalogMovies = await fetchTagalogContent();
  const kDramas = await fetchKDramas();

  fullDataCache.movies = movies;
  fullDataCache.tv = tvShows;
  fullDataCache.anime = anime;
  fullDataCache.tagalog = tagalogMovies;
  fullDataCache.kdrama = kDramas;

  if (movies.length > 0) {
    displayBanner(movies[Math.floor(Math.random() * movies.length)]);
  }
  
  document.querySelector('#movies-row h2').textContent = 'Trending Movies';
  displayList(movies, 'movies-list', 'movie');
  displayList(tvShows, 'tvshows-list', 'tv');
  displayList(anime, 'anime-list', 'tv');
  displayList(tagalogMovies, 'tagalog-list', 'movie');
  displayList(kDramas, 'kdrama-list', 'tv');
  
  renderWatchlistRow();
  renderContinueWatchingRow();
}

init();
