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

let currentItem = null;
let bannerItem = null;

let currentSeason = 1;
let currentEpisode = 1;
let currentTabCategory = 'all'; 

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
  kdrama: []
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
 * LOCALSTORAGE CACHING (API)
 * =========================
 */

const CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

function getCachedApiData(key) {
  try {
    const cachedItem = localStorage.getItem(`cache_${key}`);
    if (!cachedItem) return null;
    const { data, timestamp } = JSON.parse(cachedItem);
    if (Date.now() - timestamp < CACHE_DURATION_MS) {
      return data;
    }
    localStorage.removeItem(`cache_${key}`);
  } catch (e) {
    console.error('Error reading API cache:', e);
  }
  return null;
}

function setCachedApiData(key, data) {
  try {
    const cachePayload = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(`cache_${key}`, JSON.stringify(cachePayload));
  } catch (e) {
    console.error('Error setting API cache:', e);
  }
}

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
  const cacheKey = `trending_${type}`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const results = await fetchMultiplePages(`/trending/${type}/week`, 1);
  if (results.length > 0) setCachedApiData(cacheKey, results);
  return results;
}

async function fetchTrendingAnime() {
  const cacheKey = `trending_anime`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'ja',
    with_genres: 16,
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'tv'; });
    setCachedApiData(cacheKey, data.results);
    return data.results;
  }
  return [];
}

async function fetchTagalog() {
  const cacheKey = `trending_tagalog`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/movie', {
    with_original_language: 'tl',
    sort_by: 'popularity.desc',
    page: 1
  });
  const results = data && Array.isArray(data.results) ? data.results : [];
  if (results.length > 0) setCachedApiData(cacheKey, results);
  return results;
}

async function fetchKDramas() {
  const cacheKey = `trending_kdrama`;
  const cached = getCachedApiData(cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch('/discover/tv', {
    with_original_language: 'ko',
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'tv'; });
    setCachedApiData(cacheKey, data.results);
    return data.results;
  }
  return [];
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
 * HORIZONTAL LIST & TOUCH/DRAG SCROLLING
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
    img.draggable = false;
    img.onerror = () => {
      img.onerror = null;
      img.src = PLACEHOLDER_IMG;
    };
    img.onclick = (e) => {
      if (img.dataset.didDrag === 'true') return;
      openedFromGrid = false;
      showDetails(item);
    };
    container.appendChild(img);
  });

  setupListInteractions(container);
}

function setupListInteractions(listEl) {
  if (listEl.dataset.interactiveInitialized === 'true') return;
  listEl.dataset.interactiveInitialized = 'true';

  let isDown = false;
  let startX;
  let scrollLeft;
  let hasMoved = false;

  listEl.addEventListener('mousedown', (e) => {
    isDown = true;
    hasMoved = false;
    listEl.classList.add('dragging');
    startX = e.pageX - listEl.offsetLeft;
    scrollLeft = listEl.scrollLeft;
  });

  listEl.addEventListener('mouseleave', () => {
    isDown = false;
    listEl.classList.remove('dragging');
  });

  listEl.addEventListener('mouseup', (e) => {
    isDown = false;
    listEl.classList.remove('dragging');
    const images = listEl.querySelectorAll('img');
    images.forEach(img => {
      img.dataset.didDrag = hasMoved ? 'true' : 'false';
    });
  });

  listEl.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    hasMoved = true;
    const x = e.pageX - listEl.offsetLeft;
    const walk = (x - startX) * 1.5;
    listEl.scrollLeft = scrollLeft - walk;
  });
}

function scrollList(containerId, direction) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const scrollAmount = container.clientWidth * 0.75;
  container.scrollBy({
    left: direction * scrollAmount,
    behavior: 'smooth'
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

  renderExtraDetails(item);
}

function loadVideo() {
  if (!currentItem) return;

  const iframe = document.getElementById('modal-video');
  if (!iframe) return;

  const isTv = currentItem.media_type === 'tv' || !currentItem.title;
  let embedURL = '';

  if (isTv) {
    embedURL = `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
  } else {
    embedURL = `https://player.videasy.net/movie/${currentItem.id}`;
  }

  if (iframe.src === embedURL) return;
  iframe.src = embedURL;
}

/*
 * =========================
 * TRAILERS & CAST
 * =========================
 */

async function fetchDetailsExtra(item) {
  const isTv = item.media_type === 'tv' || !item.title;
  const endpoint = isTv ? `/tv/${item.id}` : `/movie/${item.id}`;
  const data = await tmdbFetch(endpoint, { append_to_response: 'credits,videos' });
  return data;
}

async function renderExtraDetails(item) {
  const trailerContainer = document.getElementById('modal-trailer-container');
  const castContainer = document.getElementById('modal-cast-container');
  
  if (trailerContainer) trailerContainer.innerHTML = '';
  if (castContainer) castContainer.innerHTML = '';

  const data = await fetchDetailsExtra(item);
  if (!data) return;

  // 1. Render Trailer
  if (data.videos && data.videos.results) {
    const trailer = data.videos.results.find(
      v => v.type === 'Trailer' && v.site === 'YouTube'
    ) || data.videos.results.find(v => v.site === 'YouTube');

    if (trailer && trailerContainer) {
      trailerContainer.innerHTML = `
        <h3>Official Trailer</h3>
        <div class="trailer-box">
          <iframe src="https://www.youtube-nocookie.com/embed/${trailer.key}" allowfullscreen></iframe>
        </div>
      `;
    }
  }

  // 2. Render Cast
  if (data.credits && data.credits.cast && castContainer) {
    const topCast = data.credits.cast.slice(0, 10);
    if (topCast.length > 0) {
      const castItems = topCast.map(actor => {
        const profileImg = actor.profile_path 
          ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` 
          : PLACEHOLDER_IMG;
        return `
          <div class="cast-item">
            <img src="${profileImg}" alt="${actor.name}" loading="lazy" />
            <span>${actor.name}</span>
          </div>
        `;
      }).join('');

      castContainer.innerHTML = `<h3>Top Cast</h3><div class="cast-grid">${castItems}</div>`;
    }
  }
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

  const trailerContainer = document.getElementById('modal-trailer-container');
  if (trailerContainer) trailerContainer.innerHTML = '';

  const castContainer = document.getElementById('modal-cast-container');
  if (castContainer) castContainer.innerHTML = '';

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
 * SHARE FEATURE (NEW)
 * =========================
 */

function shareCurrentItem() {
  if (!currentItem) return;

  const title = currentItem.title || currentItem.name || 'Check this out on StreamVault';
  const overview = currentItem.overview ? currentItem.overview.substring(0, 100) + '...' : '';
  const shareData = {
    title: title,
    text: `Watch "${title}" on StreamVault!\n\n${overview}`,
    url: window.location.href
  };

  if (navigator.share) {
    navigator.share(shareData).catch((err) => {
      console.log('Error sharing:', err);
    });
  } else {
    const textToCopy = `${shareData.text}\n${shareData.url}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert('Link and details copied to clipboard!');
    }).catch(() => {
      alert('Unable to share.');
    });
  }
}

/*
 * =========================
 * WATCHLIST, CONTINUE WATCHING & CLEAR ACTIONS
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

function clearWatchlist() {
  if (confirm('Are you sure you want to clear your My List?')) {
    localStorage.removeItem('myList');
    const row = document.getElementById('watchlist-row');
    const list = document.getElementById('watchlist-list');
    if (list) list.innerHTML = '';
    if (row) row.style.display = 'none';
  }
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

function clearContinueWatching() {
  if (confirm('Are you sure you want to clear your watch history?')) {
    localStorage.removeItem('continueWatching');
    const row = document.getElementById('continue-row');
    const list = document.getElementById('continue-list');
    if (list) list.innerHTML = '';
    if (row) row.style.display = 'none';
  }
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
    kdrama: document.getElementById('kdrama-row')
  };

  const hasWatchlist = getWatchlist().length > 0;
  const hasContinue = getContinueWatching().length > 0;

  Object.values(rows).forEach(row => {
    if (row) row.style.display = 'none';
  });

  if (category === 'all') {
    if (hasContinue && rows.continue) rows.continue.style.display = 'block';
    if (hasWatchlist && rows.watchlist) rows.watchlist.style.display = 'block';
    ['movies', 'tv', 'anime', 'tagalog', 'kdrama'].forEach(key => {
      if (rows[key]) rows[key].style.display = 'block';
    });
  } else if (category === 'movie') {
    ['movies', 'tagalog'].forEach(key => {
      if (rows[key]) rows[key].style.display = 'block';
    });
  } else if (category === 'tv') {
    ['tv', 'kdrama'].forEach(key => {
      if (rows[key]) rows[key].style.display = 'block';
    });
  } else if (category === 'anime') {
    if (rows.anime) rows.anime.style.display = 'block';
  }
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
    kdrama: 'Trending K-Dramas'
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
      if (gridCategory === 'movies' || gridCategory === 'tagalog') {
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
      kDramas
    ] = await Promise.all([
      fetchTrending('movie'),
      fetchTrending('tv'),
      fetchTrendingAnime(),
      fetchTagalog(),
      fetchKDramas()
    ]);

    fullDataCache = {
      movies,
      tv: tvShows,
      anime,
      tagalog: tagalogMovies,
      kdrama: kDramas
    };

    if (movies.length > 0) {
      displayBanner(movies[Math.floor(Math.random() * movies.length)]);
    }

    displayList(movies, 'movies-list', 'movie');
    displayList(tvShows, 'tvshows-list', 'tv');
    displayList(anime, 'anime-list', 'tv');
    displayList(tagalogMovies, 'tagalog-list', 'movie');
    displayList(kDramas, 'kdrama-list', 'tv');

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
