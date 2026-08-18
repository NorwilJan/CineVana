const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

let currentItem;
let bannerItem;
let currentSeason = 1;
let currentEpisode = 1;
let searchTimeout;
let showDetailsCache = {};

async function fetchTrending(type) {
  const res = await fetch(`${BASE_URL}/trending/${type}/week?api_key=${API_KEY}`);
  const data = await res.json();
  return data.results;
}

async function fetchTrendingAnime() {
  let allResults = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${page}`);
    const data = await res.json();
    const filtered = data.results.filter(item =>
      item.original_language === 'ja' && item.genre_ids && item.genre_ids.includes(16)
    );
    allResults = allResults.concat(filtered);
  }
  return allResults;
}

async function fetchTagalogContent() {
  const res = await fetch(`${BASE_URL}/discover/movie?api_key=${API_KEY}&with_original_language=tl&sort_by=popularity.desc`);
  const data = await res.json();
  return data.results;
}

async function fetchKDramas() {
  const res = await fetch(`${BASE_URL}/discover/tv?api_key=${API_KEY}&with_original_language=ko&sort_by=popularity.desc`);
  const data = await res.json();
  return data.results;
}

async function fetchByGenreId(genreId) {
  const res = await fetch(`${BASE_URL}/discover/movie?api_key=${API_KEY}&with_genres=${genreId}&sort_by=popularity.desc`);
  const data = await res.json();
  return data.results;
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
  items.forEach(item => {
    if (!item.poster_path) return;
    if (!item.media_type) item.media_type = mediaType;
    
    const img = document.createElement('img');
    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.onclick = () => showDetails(item);
    container.appendChild(img);
  });
}

async function showDetails(item) {
  currentItem = item;
  currentSeason = 1;
  currentEpisode = 1;
  
  document.getElementById('modal-title').textContent = item.title || item.name;
  document.getElementById('modal-description').textContent = item.overview;
  document.getElementById('modal-image').src = `${IMG_URL}${item.poster_path}`;
  document.getElementById('modal-rating').innerHTML = '★'.repeat(Math.round(item.vote_average / 2));
  
  updateWatchlistButton();
  addToContinueWatching(item);

  const isTv = currentItem.media_type === "tv" || !currentItem.title;
  const seriesOptions = document.getElementById('series-options');

  if (isTv) {
    seriesOptions.style.display = 'flex';
    await loadTVSeasons(currentItem.id);
  } else {
    seriesOptions.style.display = 'none';
    loadVideo();
  }
  
  document.getElementById('modal').style.display = 'flex';
  document.body.classList.add('modal-open');
}

async function loadTVSeasons(tvId) {
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
          seasonSelect.appendChild(option);
        }
      });
    }

    await loadEpisodes(tvId, 1);
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
      currentEpisode = data.episodes[0].episode_number;

      data.episodes.forEach(ep => {
        const btn = document.createElement('button');
        btn.className = `episode-btn ${ep.episode_number === currentEpisode ? 'active' : ''}`;
        btn.textContent = `Ep ${ep.episode_number}`;
        btn.onclick = () => {
          document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentEpisode = ep.episode_number;
          loadVideo();
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

  if (isTv) {
    embedURL = `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
  } else {
    embedURL = `https://player.videasy.net/movie/${currentItem.id}`;
  }

  document.getElementById('modal-video').src = embedURL;
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  document.getElementById('modal-video').src = 'about:blank';
  document.body.classList.remove('modal-open');
}

// Watchlist Logic
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
  
  if (index > -1) {
    list.splice(index, 1);
  } else {
    list.push(currentItem);
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

function addToContinueWatching(item) {
  let list = getContinueWatching();
  list = list.filter(i => i.id !== item.id);
  list.unshift(item);
  if (list.length > 10) list.pop();
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
