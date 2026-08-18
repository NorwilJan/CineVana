const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';
let currentItem;
let searchTimeout;

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

function displayBanner(item) {
  document.getElementById('banner').style.backgroundImage = `url(${IMG_URL}${item.backdrop_path})`;
  document.getElementById('banner-title').textContent = item.title || item.name;
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

function showDetails(item) {
  currentItem = item;
  document.getElementById('modal-title').textContent = item.title || item.name;
  document.getElementById('modal-description').textContent = item.overview;
  document.getElementById('modal-image').src = `${IMG_URL}${item.poster_path}`;
  document.getElementById('modal-rating').innerHTML = '★'.repeat(Math.round(item.vote_average / 2));
  
  updateWatchlistButton();
  loadVideo();
  
  document.getElementById('modal').style.display = 'flex';
  document.body.classList.add('modal-open');
}

function loadVideo() {
  const type = currentItem.media_type === "movie" ? "movie" : "tv";
  const embedURL = `https://player.videasy.net/${type}/${currentItem.id}`;
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

// Category Tab Filtering
function filterContent(category, eventElement) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  eventElement.classList.add('active');

  const watchlistRow = document.getElementById('watchlist-row');
  const moviesRow = document.getElementById('movies-row');
  const tvRow = document.getElementById('tvshows-row');
  const animeRow = document.getElementById('anime-row');

  const hasWatchlist = getWatchlist().length > 0;

  if (category === 'all') {
    if (hasWatchlist) watchlistRow.style.display = 'block';
    moviesRow.style.display = 'block';
    tvRow.style.display = 'block';
    animeRow.style.display = 'block';
  } else if (category === 'movie') {
    watchlistRow.style.display = 'none';
    moviesRow.style.display = 'block';
    tvRow.style.display = 'none';
    animeRow.style.display = 'none';
  } else if (category === 'tv') {
    watchlistRow.style.display = 'none';
    moviesRow.style.display = 'none';
    tvRow.style.display = 'block';
    animeRow.style.display = 'none';
  } else if (category === 'anime') {
    watchlistRow.style.display = 'none';
    moviesRow.style.display = 'none';
    tvRow.style.display = 'none';
    animeRow.style.display = 'block';
  }
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

  if (movies.length > 0) {
    displayBanner(movies[Math.floor(Math.random() * movies.length)]);
  }
  displayList(movies, 'movies-list', 'movie');
  displayList(tvShows, 'tvshows-list', 'tv');
  displayList(anime, 'anime-list', 'tv');
  
  renderWatchlistRow();
}

init();
