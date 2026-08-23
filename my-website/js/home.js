const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';

/*
 * PERFORMANCE
 */
const POSTER_URL = 'https://image.tmdb.org/t/p/w342';
const MODAL_POSTER_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_URL = 'https://image.tmdb.org/t/p/original';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%23222"><rect width="100%" height="100%"/></svg>';

const VIVAMAX_COMPANY_ID = 149142;

let currentItem = null;
let bannerItem = null;

let currentSeason = 1;
let currentEpisode = 1;
let currentTabCategory = 'all'; 
let currentServer = 'videasy';    

let searchTimeout = null;
let lastScrollPosition = 0;
let episodeFetchToken = 0;

const showDetailsCache = {};
const episodeCache = {};

/*
 * =========================
 * DATA CACHE
 * =========================
 */

let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  tagalogTV: [],
  kdrama: [],
  vivamax: []
};

/*
 * =========================
 * SEE ALL STATE
 * =========================
 */

let gridCategory = null;
let gridPage = 1;
let gridLoading = false;
let gridHasMore = true;
let gridScrollPosition = 0;
let openedFromGrid = false;

const gridPageCache = {};

/*
 * =========================
 * MODAL SCROLL LOCK HELPER
 * =========================
 */

function lockBodyScroll() {
  lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
  document.body.style.top = `-${lastScrollPosition}px`;
  document.body.classList.add('modal-open');
}

function unlockBodyScroll() {
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, lastScrollPosition);
}

/*
 * =========================
 * IMAGE HELPERS
 * =========================
 */

function getPosterUrl(path, size = 'normal') {
  if (!path) return PLACEHOLDER_IMG;
  if (size === 'modal') return `${MODAL_POSTER_URL}${path}`;
  return `${POSTER_URL}${path}`;
}

function getBackdropUrl(path) {
  if (!path) return '';
  return `${BACKDROP_URL}${path}`;
}

/*
 * =========================
 * API REQUEST HELPER
 * =========================
 */

async function tmdbFetch(endpoint, params = {}) {
  try {
    const url = new URL(`${BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', API_KEY);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`TMDB error ${response.status}:`, endpoint);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('TMDB request error:', error);
    return null;
  }
}

async function fetchMultiplePages(endpoint, maxPages = 1, params = {}) {
  const allResults = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await tmdbFetch(endpoint, { ...params, page });
    if (data && Array.isArray(data.results)) {
      allResults.push(...data.results);
    }
  }
  return allResults;
}

async function fetchTrending(type) {
  return await fetchMultiplePages(`/trending/${type}/week`, 1);
}

async function fetchTrendingAnime() {
  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'ja',
    with_genres: 16,
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'tv'; });
    return data.results;
  }
  return [];
}

async function fetchTagalog() {
  const data = await tmdbFetch('/discover/movie', {
    with_original_language: 'tl',
    sort_by: 'popularity.desc',
    page: 1
  });
  return data && Array.isArray(data.results) ? data.results : [];
}

async function fetchTagalogTV() {
  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'tl',
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'tv'; });
    return data.results;
  }
  return [];
}

async function fetchKDramas() {
  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'ko',
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'tv'; });
    return data.results;
  }
  return [];
}

async function fetchVivamax(page = 1) {
  const cacheKey = `vivamax_${page}`;
  if (gridPageCache[cacheKey]) return gridPageCache[cacheKey];

  const data = await tmdbFetch('/discover/movie', {
    with_companies: VIVAMAX_COMPANY_ID,
    sort_by: 'vote_average.desc',
    'vote_count.gte': 5,
    include_adult: true,
    page
  });

  const result = data || { results: [], total_pages: 0 };
  gridPageCache[cacheKey] = result;
  return result;
}

/*
 * =========================
 * BANNER
 * =========================
 */

function displayBanner(item) {
  if (!item || !item.backdrop_path) return;
  bannerItem = item;

  const bannerEl = document.getElementById('banner');
  const titleEl = document.getElementById('banner-title');

  if (bannerEl) {
    bannerEl.style.backgroundImage = `linear-gradient(to top, #111 10%, rgba(17,17,17,0.4) 60%, rgba(17,17,17,0.8)), url(${getBackdropUrl(item.backdrop_path)})`;
  }
  if (titleEl) {
    titleEl.textContent = item.title || item.name || '';
  }
}

function playBanner() {
  if (bannerItem) {
    openedFromGrid = false;
    showDetails(bannerItem);
  }
}

/*
 * =========================
 * HORIZONTAL LIST
 * =========================
 */

function displayList(items, containerId, mediaType) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const limitedItems = items.slice(0, 20);

  limitedItems.forEach(item => {
    if (!item.poster_path) return;
    if (!item.media_type) item.media_type = mediaType;

    const img = document.createElement('img');
    img.src = getPosterUrl(item.poster_path);
    img.alt = item.title || item.name || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      img.onerror = null;
      img.src = PLACEHOLDER_IMG;
    };
    img.onclick = () => {
      openedFromGrid = false;
      showDetails(item);
    };
    container.appendChild(img);
  });
}

/*
 * =========================
 * SHOW DETAILS & PLAYER
 * =========================
 */

async function showDetails(item) {
  currentItem = item;
  const continueList = getContinueWatching();
  const savedProgress = continueList.find(i => i.id === item.id);

  currentSeason = savedProgress ? (savedProgress.savedSeason || 1) : 1;
  currentEpisode = savedProgress ? (savedProgress.savedEpisode || 1) : 1;

  const title = document.getElementById('modal-title');
  const description = document.getElementById('modal-description');
  const image = document.getElementById('modal-image');
  const rating = document.getElementById('modal-rating');

  if (title) title.textContent = item.title || item.name || '';
  if (description) description.textContent = item.overview || 'No description available.';
  if (image) {
    image.src = getPosterUrl(item.poster_path, 'modal');
    image.onerror = () => {
      image.onerror = null;
      image.src = PLACEHOLDER_IMG;
    };
  }

  if (rating) {
    const stars = item.vote_average ? Math.round(item.vote_average / 2) : 0;
    rating.innerHTML = '★'.repeat(stars);
  }

  updateWatchlistButton();
  saveCurrentProgress();

  const isTv = item.media_type === 'tv' || !item.title;
  const seriesOptions = document.getElementById('series-options');
  if (seriesOptions) {
    seriesOptions.style.display = isTv ? 'flex' : 'none';
  }

  const modal = document.getElementById('modal');
  if (modal) {
    modal.classList.add('active');
    lockBodyScroll();
  }

  if (isTv) {
    await loadTVSeasons(item.id, currentSeason, currentEpisode);
  } else {
    requestAnimationFrame(() => { loadVideo(); });
  }
}

/*
 * =========================
 * MULTI-SERVER VIDEO PLAYER
 * =========================
 */

function switchServer(serverName, buttonElement) {
  currentServer = serverName;

  document.querySelectorAll('.server-btn').forEach(btn => btn.classList.remove('active'));
  if (buttonElement) {
    buttonElement.classList.add('active');
  }

  loadVideo();
}

function loadVideo() {
  if (!currentItem) return;

  const iframe = document.getElementById('modal-video');
  if (!iframe) return;

  const isTv = currentItem.media_type === 'tv' || !currentItem.title;
  let embedURL = '';

  switch (currentServer) {
    case 'vidsrc-cc':
      if (isTv) {
        embedURL = `https://vidsrc.cc/v2/embed/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
      } else {
        embedURL = `https://vidsrc.cc/v2/embed/movie/${currentItem.id}`;
      }
      break;

    case 'embed-su':
      if (isTv) {
        embedURL = `https://embed.su/embed/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
      } else {
        embedURL = `https://embed.su/embed/movie/${currentItem.id}`;
      }
      break;

    case 'videasy':
    default:
      if (isTv) {
        embedURL = `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
      } else {
        embedURL = `https://player.videasy.net/movie/${currentItem.id}`;
      }
      break;
  }

  if (iframe.src === embedURL) return;
  iframe.src = embedURL;
}

/*
 * =========================
 * TV SEASONS & EPISODES
 * =========================
 */

async function loadTVSeasons(tvId, targetSeason = 1, targetEpisode = 1) {
  const seasonSelect = document.getElementById('season-select');
  if (!seasonSelect) return;
  seasonSelect.innerHTML = '';

  try {
    let data = showDetailsCache[tvId];
    if (!data) {
      data = await tmdbFetch(`/tv/${tvId}`);
      if (data) showDetailsCache[tvId] = data;
    }

    if (data && data.seasons) {
      data.seasons.forEach(season => {
        if (season.season_number <= 0) return;
        const option = document.createElement('option');
        option.value = season.season_number;
        option.textContent = season.name || `Season ${season.season_number}`;
        if (season.season_number === targetSeason) option.selected = true;
        seasonSelect.appendChild(option);
      });
    }

    currentSeason = targetSeason;
    currentEpisode = targetEpisode;
    await loadEpisodes(tvId, targetSeason);
  } catch (error) {
    console.error('Error loading TV seasons:', error);
  }
}

async function loadEpisodes(tvId, seasonNumber) {
  const fetchToken = ++episodeFetchToken;
  const previousSeason = currentSeason;
  currentSeason = seasonNumber;

  const episodesContainer = document.getElementById('episodes-container');
  if (!episodesContainer) return;
  episodesContainer.innerHTML = '';

  const cacheKey = `${tvId}_${seasonNumber}`;

  try {
    let data = episodeCache[cacheKey];
    if (!data) {
      data = await tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
      if (data) episodeCache[cacheKey] = data;
    }

    if (fetchToken !== episodeFetchToken) return;

    if (data && data.episodes && data.episodes.length > 0) {
      if (previousSeason !== seasonNumber || !currentEpisode) {
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
    console.error('Error loading episodes:', error);
  }
}

function onSeasonChange() {
  const select = document.getElementById('season-select');
  if (!select) return;
  currentEpisode = 1;
  loadEpisodes(currentItem.id, parseInt(select.value, 10));
}

function closeModal() {
  const iframe = document.getElementById('modal-video');
  if (iframe) iframe.src = 'about:blank';

  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('active');
  unlockBodyScroll();

  if (openedFromGrid) {
    const gridModal = document.getElementById('grid-modal');
    if (gridModal) {
      gridModal.classList.add('active');
      lockBodyScroll();
      requestAnimationFrame(() => {
        const scrollArea = getGridScrollArea();
        if (scrollArea) scrollArea.scrollTop = gridScrollPosition;
      });
    }
  }
}

/*
 * =========================
 * WATCHLIST & CONTINUE WATCHING
 * =========================
 */

function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem('myList')) || [];
  } catch {
    return [];
  }
}

function isItemInWatchlist(id) {
  return getWatchlist().some(item => item.id === id);
}

function toggleWatchlist() {
  if (!currentItem) return;
  const list = getWatchlist();
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
  if (!row) return;

  row.style.display = list.length ? 'block' : 'none';
  if (list.length) displayList(list, 'watchlist-list', 'movie');
}

function getContinueWatching() {
  try {
    return JSON.parse(localStorage.getItem('continueWatching')) || [];
  } catch {
    return [];
  }
}

function saveCurrentProgress() {
  if (!currentItem) return;
  let list = getContinueWatching();
  const existingIndex = list.findIndex(item => item.id === currentItem.id);

  const itemData = {
    ...currentItem,
    savedSeason: currentSeason,
    savedEpisode: currentEpisode,
    lastWatched: Date.now()
  };

  if (existingIndex > -1) list.splice(existingIndex, 1);
  list.unshift(itemData);
  if (list.length > 15) list.pop();

  localStorage.setItem('continueWatching', JSON.stringify(list));
  renderContinueWatchingRow();
}

function renderContinueWatchingRow() {
  const list = getContinueWatching();
  const row = document.getElementById('continue-row');
  if (!row) return;

  row.style.display = list.length ? 'block' : 'none';
  if (list.length) displayList(list, 'continue-list', 'movie');
}

/*
 * =========================
 * CATEGORY FILTER
 * =========================
 */

function filterContent(category, eventElement) {
  currentTabCategory = category;

  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (eventElement) eventElement.classList.add('active');

  const rows = {
    continue: document.getElementById('continue-row'),
    watchlist: document.getElementById('watchlist-row'),
    movies: document.getElementById('movies-row'),
    tv: document.getElementById('tvshows-row'),
    anime: document.getElementById('anime-row'),
    tagalog: document.getElementById('tagalog-row'),
    tagalogTV: document.getElementById('tagalog-tv-row'),
    kdrama: document.getElementById('kdrama-row'),
    vivamax: document.getElementById('vivamax-row')
  };

  const hasWatchlist = getWatchlist().length > 0;
  const hasContinue = getContinueWatching().length > 0;

  Object.values(rows).forEach(row => {
    if (row) row.style.display = 'none';
  });

  if (category === 'all') {
    if (hasContinue && rows.continue) rows.continue.style.display = 'block';
    if (hasWatchlist && rows.watchlist) rows.watchlist.style.display = 'block';
    ['movies', 'tv', 'anime', 'tagalog', 'tagalogTV', 'kdrama', 'vivamax'].forEach(key => {
      if (rows[key]) rows[key].style.display = 'block';
    });
  } else if (category === 'movie') {
    ['movies', 'tagalog', 'vivamax'].forEach(key => {
      if (rows[key]) rows[key].style.display = 'block';
    });
  } else if (category === 'tv') {
    ['tv', 'tagalogTV', 'kdrama'].forEach(key => {
      if (rows[key]) rows[key].style.display = 'block';
    });
  } else if (category === 'anime') {
    if (rows.anime) rows.anime.style.display = 'block';
  }
}

/*
 * =========================
 * SMART CONTEXT-AWARE GENRE FILTER
 * =========================
 */

async function filterByGenre(genreId, eventElement) {
  document.querySelectorAll('.genre-btn').forEach(btn => btn.classList.remove('active'));
  if (eventElement) eventElement.classList.add('active');

  if (genreId === 'all') {
    restoreAllRows();
    filterContent(currentTabCategory, document.querySelector('.tab-btn.active'));
    return;
  }

  let endpoint = '/discover/movie';
  let params = { with_genres: genreId, sort_by: 'popularity.desc', page: 1 };
  let targetRowId = 'movies-row';
  let targetListId = 'movies-list';
  let targetMediaType = 'movie';

  if (currentTabCategory === 'tv') {
    endpoint = '/discover/tv';
    targetRowId = 'tvshows-row';
    targetListId = 'tvshows-list';
    targetMediaType = 'tv';
  } else if (currentTabCategory === 'anime') {
    endpoint = '/discover/tv';
    params.with_original_language = 'ja';
    params.with_genres = `${genreId},16`;
    targetRowId = 'anime-row';
    targetListId = 'anime-list';
    targetMediaType = 'tv';
  }

  const data = await tmdbFetch(endpoint, params);
  const results = data && Array.isArray(data.results) ? data.results : [];

  if (targetMediaType === 'tv') {
    results.forEach(item => { item.media_type = 'tv'; });
  }

  [
    'continue-row',
    'watchlist-row',
    'movies-row',
    'tvshows-row',
    'anime-row',
    'tagalog-row',
    'tagalog-tv-row',
    'kdrama-row',
    'vivamax-row'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const targetRow = document.getElementById(targetRowId);
  if (targetRow) {
    targetRow.style.display = 'block';
    const heading = targetRow.querySelector('h2');
    if (heading) {
      const genreName = eventElement ? eventElement.textContent : 'Genre';
      heading.textContent = `${genreName} ${currentTabCategory === 'anime' ? 'Anime' : currentTabCategory === 'tv' ? 'TV Shows' : 'Movies'}`;
    }
    displayList(results, targetListId, targetMediaType);
  }
}

function restoreAllRows() {
  const ids = ['movies-row', 'tvshows-row', 'anime-row', 'tagalog-row', 'tagalog-tv-row', 'kdrama-row', 'vivamax-row'];
  ids.forEach(id => {
    const row = document.getElementById(id);
    if (row) row.style.display = 'block';
  });
  renderWatchlistRow();
  renderContinueWatchingRow();
}

/*
 * =========================
 * SEE ALL GRID MODAL
 * =========================
 */

function getGridScrollArea() {
  return document.getElementById('grid-scroll-area') || document.getElementById('grid-modal');
}

function openGridModal(category) {
  const modal = document.getElementById('grid-modal');
  const titleEl = document.getElementById('grid-modal-title');
  const container = document.getElementById('grid-modal-results');
  if (!modal || !container) return;

  gridCategory = category;
  gridPage = 1;
  gridLoading = false;
  gridHasMore = true;
  gridScrollPosition = 0;
  openedFromGrid = true;

  const scrollArea = getGridScrollArea();
  if (scrollArea) scrollArea.scrollTop = 0;

  const titles = {
    movies: 'Trending Movies',
    tv: 'Trending TV Shows',
    anime: 'Trending Anime',
    tagalog: 'Trending Tagalog Movies',
    tagalogTV: 'Trending Tagalog TV Shows',
    kdrama: 'Trending K-Dramas',
    vivamax: 'Top Rated Vivamax'
  };

  if (titleEl) titleEl.textContent = titles[category] || 'Category';
  container.innerHTML = '';
  modal.classList.add('active');
  lockBodyScroll();

  loadGridPage();
}

async function fetchGridPage(category, page) {
  const cacheKey = `grid_${category}_${page}`;
  if (gridPageCache[cacheKey]) return gridPageCache[cacheKey];

  let data = null;
  switch (category) {
    case 'movies':
      data = await tmdbFetch('/trending/movie/week', { page });
      break;
    case 'tv':
      data = await tmdbFetch('/trending/tv/week', { page });
      break;
    case 'anime':
      data = await tmdbFetch('/discover/tv', {
        with_original_language: 'ja',
        with_genres: 16,
        sort_by: 'popularity.desc',
        page
      });
      if (data && Array.isArray(data.results)) {
        data.results.forEach(item => { item.media_type = 'tv'; });
      }
      break;
    case 'tagalog':
      data = await tmdbFetch('/discover/movie', {
        with_original_language: 'tl',
        sort_by: 'popularity.desc',
        page
      });
      break;
    case 'tagalogTV':
      data = await tmdbFetch('/discover/tv', {
        with_original_language: 'tl',
        sort_by: 'popularity.desc',
        page
      });
      if (data && Array.isArray(data.results)) {
        data.results.forEach(item => { item.media_type = 'tv'; });
      }
      break;
    case 'kdrama':
      data = await tmdbFetch('/discover/tv', {
        with_original_language: 'ko',
        sort_by: 'popularity.desc',
        page
      });
      if (data && Array.isArray(data.results)) {
        data.results.forEach(item => { item.media_type = 'tv'; });
      }
      break;
    case 'vivamax':
      data = await fetchVivamax(page);
      break;
    default:
      data = { results: [], total_pages: 0 };
  }

  if (!data) data = { results: [], total_pages: 0 };
  gridPageCache[cacheKey] = data;
  return data;
}

async function loadGridPage() {
  if (gridLoading || !gridHasMore || !gridCategory) return;
  gridLoading = true;

  const container = document.getElementById('grid-modal-results');
  if (!container) {
    gridLoading = false;
    return;
  }

  const loading = document.createElement('div');
  loading.className = 'grid-loading active';
  loading.textContent = 'Loading...';
  container.appendChild(loading);

  try {
    const data = await fetchGridPage(gridCategory, gridPage);
    loading.remove();

    const results = data.results || [];
    if (results.length === 0) {
      gridHasMore = false;
      showGridEnd();
      return;
    }

    results.forEach(item => {
      if (!item.poster_path) return;
      if (gridCategory === 'movies' || gridCategory === 'tagalog' || gridCategory === 'vivamax') {
        item.media_type = 'movie';
      } else {
        item.media_type = 'tv';
      }

      const img = document.createElement('img');
      img.src = getPosterUrl(item.poster_path);
      img.alt = item.title || item.name || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = () => {
        img.onerror = null;
        img.src = PLACEHOLDER_IMG;
      };
      img.onclick = () => {
        const scrollArea = getGridScrollArea();
        if (scrollArea) gridScrollPosition = scrollArea.scrollTop;

        const gridModal = document.getElementById('grid-modal');
        if (gridModal) gridModal.classList.remove('active');

        openedFromGrid = true;
        showDetails(item);
      };
      container.appendChild(img);
    });

    const totalPages = data.total_pages || 1;
    if (gridPage >= totalPages) {
      gridHasMore = false;
      showGridEnd();
    } else {
      gridPage++;
    }
  } catch (error) {
    console.error('Grid loading error:', error);
    loading.remove();
  } finally {
    gridLoading = false;
  }
}

function showGridEnd() {
  const container = document.getElementById('grid-modal-results');
  if (!container || container.querySelector('.grid-end')) return;

  const end = document.createElement('div');
  end.className = 'grid-end';
  end.textContent = 'You have reached the end.';
  container.appendChild(end);
}

function handleGridScroll() {
  const scrollArea = getGridScrollArea();
  if (!scrollArea) return;

  const distanceFromBottom = scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
  if (distanceFromBottom < 700 && !gridLoading && gridHasMore) {
    loadGridPage();
  }
}

function closeGridModal() {
  const modal = document.getElementById('grid-modal');
  if (modal) modal.classList.remove('active');
  unlockBodyScroll();
  openedFromGrid = false;
}

/*
 * =========================
 * SEARCH MODAL
 * =========================
 */

function openSearchModal() {
  const modal = document.getElementById('search-modal');
  const input = document.getElementById('search-input');
  if (modal) modal.classList.add('active');
  lockBodyScroll();
  if (input) input.focus();
}

function closeSearchModal() {
  const modal = document.getElementById('search-modal');
  const results = document.getElementById('search-results');
  const input = document.getElementById('search-input');

  if (modal) modal.classList.remove('active');
  unlockBodyScroll();
  if (results) results.innerHTML = '';
  if (input) input.value = '';
}

function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(searchTMDB, 350);
}

async function searchTMDB() {
  const input = document.getElementById('search-input');
  const container = document.getElementById('search-results');
  if (!input || !container) return;

  const query = input.value.trim();
  if (!query) {
    container.innerHTML = '';
    return;
  }

  try {
    const data = await tmdbFetch('/search/multi', { query });
    if (!data) return;

    container.innerHTML = '';
    (data.results || []).forEach(item => {
      if (!item.poster_path || item.media_type === 'person') return;
      if (!item.media_type) {
        item.media_type = item.title ? 'movie' : 'tv';
      }

      const img = document.createElement('img');
      img.src = getPosterUrl(item.poster_path);
      img.alt = item.title || item.name || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = () => {
        img.onerror = null;
        img.src = PLACEHOLDER_IMG;
      };
      img.onclick = () => {
        closeSearchModal();
        openedFromGrid = false;
        showDetails(item);
      };
      container.appendChild(img);
    });
  } catch (error) {
    console.error('Search error:', error);
  }
}

/*
 * =========================
 * INITIALIZATION
 * =========================
 */

async function init() {
  try {
    const [
      movies,
      tvShows,
      anime,
      tagalogMovies,
      tagalogTVShows,
      kDramas,
      vivamaxData
    ] = await Promise.all([
      fetchTrending('movie'),
      fetchTrending('tv'),
      fetchTrendingAnime(),
      fetchTagalog(),
      fetchTagalogTV(),
      fetchKDramas(),
      fetchVivamax(1)
    ]);

    const vivamax = vivamaxData.results || [];

    fullDataCache = {
      movies,
      tv: tvShows,
      anime,
      tagalog: tagalogMovies,
      tagalogTV: tagalogTVShows,
      kdrama: kDramas,
      vivamax
    };

    if (movies.length > 0) {
      displayBanner(movies[Math.floor(Math.random() * movies.length)]);
    }

    const movieRowH2 = document.querySelector('#movies-row h2');
    if (movieRowH2) movieRowH2.textContent = 'Trending Movies';

    displayList(movies, 'movies-list', 'movie');
    displayList(tvShows, 'tvshows-list', 'tv');
    displayList(anime, 'anime-list', 'tv');
    displayList(tagalogMovies, 'tagalog-list', 'movie');
    displayList(tagalogTVShows, 'tagalog-tv-list', 'tv');
    displayList(kDramas, 'kdrama-list', 'tv');
    displayList(vivamax, 'vivamax-list', 'movie');

    renderWatchlistRow();
    renderContinueWatchingRow();
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const scrollArea = getGridScrollArea();
  if (scrollArea) {
    scrollArea.addEventListener('scroll', handleGridScroll, { passive: true });
  }
});

init();
