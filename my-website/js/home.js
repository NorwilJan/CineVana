const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';
let currentItem;
let searchTimeout;
let deferredPrompt;

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
      item.original_language === 'ja' && item.genre_ids.includes(16)
    );
    allResults = allResults.concat(filtered);
  }
  return allResults;
}

async function fetchByGenre(genreId, btnElement) {
  document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  const res = await fetch(`${BASE_URL}/discover/movie?api_key=${API_KEY}&with_genres=${genreId}`);
  const data = await res.json();
  
  displayList(data.results, 'movies-list');
  document.getElementById('movies-title').textContent = `${btnElement.textContent} Movies`;
  document.getElementById('tvshows-row').style.display = 'none';
  document.getElementById('anime-row').style.display = 'none';
}

function resetHomeView(btnElement) {
  document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  
  document.getElementById('tvshows-row').style.display = 'block';
  document.getElementById('anime-row').style.display = 'block';
  document.getElementById('movies-title').textContent = "Trending Movies";
  initContent();
}

function displayBanner(item) {
  if (!item) return;
  document.getElementById('banner').style.backgroundImage = `url(${IMG_URL}${item.backdrop_path})`;
  document.getElementById('banner-title').textContent = item.title || item.name;
}

function displayList(items, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  items.forEach(item => {
    if (!item.poster_path) return;
    const img = document.createElement('img');
    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.loading = 'lazy';
    img.onclick = () => showDetails(item);
    container.appendChild(img);
  });
}

async function showDetails(item) {
  currentItem = item;
  document.getElementById('modal-title').textContent = item.title || item.name;
  document.getElementById('modal-description').textContent = item.overview;
  document.getElementById('modal-image').src = `${IMG_URL}${item.poster_path}`;
  document.getElementById('modal-rating').innerHTML = '★'.repeat(Math.round(item.vote_average / 2));

  saveToWatchHistory(item);
  loadVideoSelectors(item);

  document.getElementById('modal').style.display = 'flex';
}

async function loadVideoSelectors(item) {
  const type = item.media_type === "movie" || item.title ? "movie" : "tv";
  const selectorsContainer = document.getElementById('episode-selectors-container');
  selectorsContainer.innerHTML = '';

  if (type === 'tv') {
    selectorsContainer.style.display = 'flex';
    try {
      const res = await fetch(`${BASE_URL}/tv/${item.id}?api_key=${API_KEY}`);
      const data = await res.json();
      
      const seasons = data.seasons.filter(s => s.season_number > 0);
      
      let seasonSelect = document.createElement('select');
      seasonSelect.id = 'season-select';
      seasons.forEach(s => {
        let opt = document.createElement('option');
        opt.value = s.season_number;
        opt.textContent = `Season ${s.season_number}`;
        seasonSelect.appendChild(opt);
      });

      let episodeSelect = document.createElement('select');
      episodeSelect.id = 'episode-select';

      async function updateEpisodes(seasonNum) {
        const epRes = await fetch(`${BASE_URL}/tv/${item.id}/season/${seasonNum}?api_key=${API_KEY}`);
        const epData = await epRes.json();
        episodeSelect.innerHTML = '';
        if (epData.episodes) {
          epData.episodes.forEach(ep => {
            let opt = document.createElement('option');
            opt.value = ep.episode_number;
            opt.textContent = `Episode ${ep.episode_number}: ${ep.name}`;
            episodeSelect.appendChild(opt);
          });
        }
        loadVideoURL('tv', item.id, seasonSelect.value, episodeSelect.value);
      }

      seasonSelect.onchange = (e) => updateEpisodes(e.target.value);
      episodeSelect.onchange = () => loadVideoURL('tv', item.id, seasonSelect.value, episodeSelect.value);

      selectorsContainer.appendChild(seasonSelect);
      selectorsContainer.appendChild(episodeSelect);

      if (seasons.length > 0) {
        await updateEpisodes(seasons[0].season_number);
      }
    } catch {
      loadVideoURL('tv', item.id, 1, 1);
    }
  } else {
    selectorsContainer.style.display = 'none';
    loadVideoURL('movie', item.id);
  }
}

function loadVideoURL(type, id, season = 1, episode = 1) {
  let embedURL = type === 'movie' 
    ? `https://player.videasy.net/movie/${id}`
    : `https://player.videasy.net/tv/${id}/${season}/${episode}`;
  
  document.getElementById('modal-video').src = embedURL;
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  document.getElementById('modal-video').src = '';
}

function saveToWatchHistory(item) {
  let history = JSON.parse(localStorage.getItem('watch_history') || '[]');
  history = history.filter(i => i.id !== item.id);
  history.unshift(item);
  if (history.length > 15) history.pop();
  localStorage.setItem('watch_history', JSON.stringify(history));
  loadWatchHistoryUI();
}

function loadWatchHistoryUI() {
  const history = JSON.parse(localStorage.getItem('watch_history') || '[]');
  const row = document.getElementById('continue-watching-row');
  if (history.length > 0) {
    row.style.display = 'block';
    displayList(history, 'history-list');
  } else {
    row.style.display = 'none';
  }
}

function changeTheme(color) {
  document.documentElement.style.setProperty('--accent-color', color);
  localStorage.setItem('site_theme', color);
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

function handleSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(searchTMDB, 400);
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
    if (!item.poster_path) return;
    const img = document.createElement('img');
    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.loading = 'lazy';
    img.onclick = () => {
      closeSearchModal();
      showDetails(item);
    };
    container.appendChild(img);
  });
}

window.onclick = function(event) {
  if (event.target === document.getElementById('modal')) closeModal();
  if (event.target === document.getElementById('search-modal')) closeSearchModal();
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-btn').style.display = 'block';
});

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      document.getElementById('install-btn').style.display = 'none';
    });
  }
}

async function initContent() {
  const movies = await fetchTrending('movie');
  const tvShows = await fetchTrending('tv');
  const anime = await fetchTrendingAnime();

  displayBanner(movies[Math.floor(Math.random() * movies.length)]);
  displayList(movies, 'movies-list');
  displayList(tvShows, 'tvshows-list');
  displayList(anime, 'anime-list');
}

async function init() {
  document.getElementById('copyright-year').textContent = new Date().getFullYear();
  
  const savedTheme = localStorage.getItem('site_theme');
  if (savedTheme) {
    document.documentElement.style.setProperty('--accent-color', savedTheme);
    document.getElementById('theme-select').value = savedTheme;
  }

  loadWatchHistoryUI();
  await initContent();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
}

init();
