const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%23222"><rect width="100%" height="100%"/></svg>';

let currentItem = null;
let bannerItem = null;
let currentSeason = 1;
let currentEpisode = 1;
let searchTimeout = null;

let showDetailsCache = {};
let seasonDetailsCache = {};

let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  kdrama: [],
  vivamax: []
};

/* =========================
   API HELPERS
========================= */

async function fetchMultiplePages(endpoint, maxPages = 3) {
  let allResults = [];

  try {
    for (let page = 1; page <= maxPages; page++) {
      const separator = endpoint.includes('?') ? '&' : '?';

      const res = await fetch(
        `${BASE_URL}${endpoint}${separator}page=${page}&api_key=${API_KEY}`
      );

      if (!res.ok) {
        console.warn(`TMDB request failed: ${res.status}`);
        continue;
      }

      const data = await res.json();

      if (data.results) {
        allResults = allResults.concat(data.results);
      }

      if (data.total_pages && page >= data.total_pages) {
        break;
      }
    }
  } catch (error) {
    console.error('Error fetching multiple pages:', error);
  }

  return allResults;
}

/* =========================
   CONTENT FETCHERS
========================= */

async function fetchTrending(type) {
  return await fetchMultiplePages(`/trending/${type}/week?`, 3);
}

async function fetchTrendingAnime() {
  let allResults = [];

  try {
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(
        `${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${page}`
      );

      if (!res.ok) continue;

      const data = await res.json();

      if (data.results) {
        const filtered = data.results.filter(
          item =>
            item.original_language === 'ja' &&
            item.genre_ids &&
            item.genre_ids.includes(16) &&
            item.poster_path
        );

        allResults = allResults.concat(filtered);
      }
    }
  } catch (error) {
    console.error('Error fetching anime:', error);
  }

  return removeDuplicates(allResults);
}

async function fetchTagalogContent() {
  return await fetchMultiplePages(
    `/discover/movie?with_original_language=tl&sort_by=popularity.desc`,
    3
  );
}

async function fetchKDramas() {
  return await fetchMultiplePages(
    `/discover/tv?with_original_language=ko&sort_by=popularity.desc`,
    3
  );
}

/*
 * Vivamax production company:
 * TMDB company ID = 149142
 *
 * Minimum vote count helps prevent movies with only
 * a tiny number of votes from dominating the ranking.
 */
async function fetchTopRatedVivamax() {
  const results = await fetchMultiplePages(
    `/discover/movie?with_companies=149142&sort_by=vote_average.desc&vote_count.gte=10`,
    5
  );

  const cleaned = results.filter(
    item => item.poster_path && item.vote_average
  );

  return cleaned.sort((a, b) => {
    const ratingDifference =
      (b.vote_average || 0) - (a.vote_average || 0);

    if (ratingDifference !== 0) {
      return ratingDifference;
    }

    const voteDifference =
      (b.vote_count || 0) - (a.vote_count || 0);

    if (voteDifference !== 0) {
      return voteDifference;
    }

    return (b.popularity || 0) - (a.popularity || 0);
  });
}

async function fetchByGenreId(genreId) {
  return await fetchMultiplePages(
    `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`,
    3
  );
}

/* =========================
   UTILITIES
========================= */

function removeDuplicates(items) {
  const seen = new Set();

  return items.filter(item => {
    if (!item || !item.id || seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function getItemTitle(item) {
  return item?.title || item?.name || 'Untitled';
}

function getMediaType(item, fallback = 'movie') {
  if (item?.media_type) {
    return item.media_type;
  }

  return item?.title ? 'movie' : item?.name ? 'tv' : fallback;
}

function isTV(item) {
  return getMediaType(item) === 'tv' || !item?.title;
}

/* =========================
   BANNER
========================= */

function displayBanner(items) {
  if (!Array.isArray(items) || items.length === 0) return;

  const candidates = items.filter(
    item => item && item.backdrop_path
  );

  if (candidates.length === 0) return;

  /*
   * Prefer movies with good ratings/popularity.
   * This avoids an ugly/random banner when possible.
   */
  const sorted = [...candidates].sort((a, b) => {
    const scoreA =
      (a.vote_average || 0) * 2 +
      Math.log10((a.popularity || 1) + 1);

    const scoreB =
      (b.vote_average || 0) * 2 +
      Math.log10((b.popularity || 1) + 1);

    return scoreB - scoreA;
  });

  const topCandidates = sorted.slice(0, Math.min(10, sorted.length));

  bannerItem =
    topCandidates[Math.floor(Math.random() * topCandidates.length)];

  const bannerEl = document.getElementById('banner');
  const titleEl = document.getElementById('banner-title');

  if (bannerEl) {
    bannerEl.style.backgroundImage =
      `url("${IMG_URL}${bannerItem.backdrop_path}")`;
  }

  if (titleEl) {
    titleEl.textContent = getItemTitle(bannerItem);
  }
}

function playBanner() {
  if (bannerItem) {
    showDetails(bannerItem);
  }
}

/* =========================
   DISPLAY LIST
========================= */

function displayList(items, containerId, mediaType = 'movie') {
  const container = document.getElementById(containerId);

  if (!container) return;

  container.innerHTML = '';

  const uniqueItems = removeDuplicates(items || []);

  uniqueItems.slice(0, 20).forEach(item => {
    if (!item || !item.poster_path) return;

    if (!item.media_type) {
      item.media_type = mediaType;
    }

    const img = document.createElement('img');

    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = getItemTitle(item);
    img.loading = 'lazy';

    img.onerror = () => {
      img.onerror = null;
      img.src = PLACEHOLDER_IMG;
    };

    img.onclick = () => showDetails(item);

    container.appendChild(img);
  });
}

/* =========================
   DETAILS MODAL
========================= */

async function showDetails(item) {
  if (!item || !item.id) return;

  currentItem = item;

  const continueList = getContinueWatching();

  const savedProgress = continueList.find(
    i => i.id === item.id
  );

  currentSeason = savedProgress?.savedSeason || 1;
  currentEpisode = savedProgress?.savedEpisode || 1;

  const titleEl = document.getElementById('modal-title');
  const descriptionEl = document.getElementById('modal-description');
  const imgEl = document.getElementById('modal-image');
  const ratingEl = document.getElementById('modal-rating');
  const seriesOptions = document.getElementById('series-options');

  if (titleEl) {
    titleEl.textContent = getItemTitle(item);
  }

  if (descriptionEl) {
    descriptionEl.textContent =
      item.overview || 'No description available.';
  }

  if (imgEl) {
    imgEl.src = item.poster_path
      ? `${IMG_URL}${item.poster_path}`
      : PLACEHOLDER_IMG;

    imgEl.alt = getItemTitle(item);

    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = PLACEHOLDER_IMG;
    };
  }

  if (ratingEl) {
    const rating = Number(item.vote_average || 0);
    const stars = Math.round(rating / 2);

    ratingEl.innerHTML =
      stars > 0
        ? `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} <span style="color:#aaa">${rating.toFixed(1)}/10</span>`
        : '';
  }

  updateWatchlistButton();

  const tv = isTV(item);

  if (tv) {
    if (seriesOptions) {
      seriesOptions.style.display = 'flex';
    }

    await loadTVSeasons(
      item.id,
      currentSeason,
      currentEpisode
    );
  } else {
    if (seriesOptions) {
      seriesOptions.style.display = 'none';
    }

    loadVideo();
  }

  const modal = document.getElementById('modal');

  if (modal) {
    modal.classList.add('active');
  }

  document.body.classList.add('modal-open');

  saveCurrentProgress();
}

/* =========================
   TV SEASONS
========================= */

async function loadTVSeasons(
  tvId,
  targetSeason = 1,
  targetEpisode = 1
) {
  const seasonSelect =
    document.getElementById('season-select');

  if (!seasonSelect) return;

  seasonSelect.innerHTML = '';

  try {
    let data = showDetailsCache[tvId];

    if (!data) {
      const res = await fetch(
        `${BASE_URL}/tv/${tvId}?api_key=${API_KEY}`
      );

      if (!res.ok) {
        throw new Error(`TMDB TV request failed: ${res.status}`);
      }

      data = await res.json();
      showDetailsCache[tvId] = data;
    }

    if (data?.seasons?.length) {
      data.seasons.forEach(season => {
        if (season.season_number <= 0) return;

        const option = document.createElement('option');

        option.value = season.season_number;
        option.textContent =
          season.name || `Season ${season.season_number}`;

        seasonSelect.appendChild(option);
      });
    }

    const availableSeasonNumbers =
      Array.from(seasonSelect.options).map(
        option => Number(option.value)
      );

    if (!availableSeasonNumbers.includes(Number(targetSeason))) {
      targetSeason =
        availableSeasonNumbers[0] || 1;
    }

    seasonSelect.value = targetSeason;

    currentSeason = Number(targetSeason);
    currentEpisode = Number(targetEpisode) || 1;

    await loadEpisodes(
      tvId,
      currentSeason,
      currentEpisode
    );
  } catch (error) {
    console.error('Error loading TV seasons:', error);
  }
}

/* =========================
   TV EPISODES
========================= */

async function loadEpisodes(
  tvId,
  seasonNumber,
  targetEpisode = 1
) {
  currentSeason = Number(seasonNumber);

  const episodesContainer =
    document.getElementById('episodes-container');

  if (!episodesContainer) return;

  episodesContainer.innerHTML = '';

  try {
    const cacheKey = `${tvId}_${seasonNumber}`;

    let data = seasonDetailsCache[cacheKey];

    if (!data) {
      const res = await fetch(
        `${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`
      );

      if (!res.ok) {
        throw new Error(
          `TMDB season request failed: ${res.status}`
        );
      }

      data = await res.json();

      seasonDetailsCache[cacheKey] = data;
    }

    if (!data?.episodes?.length) {
      currentEpisode = 1;
      loadVideo();
      return;
    }

    const episodeExists = data.episodes.some(
      ep => ep.episode_number === Number(targetEpisode)
    );

    currentEpisode = episodeExists
      ? Number(targetEpisode)
      : data.episodes[0].episode_number;

    data.episodes.forEach(ep => {
      const btn = document.createElement('button');

      btn.className =
        `episode-btn ${
          ep.episode_number === currentEpisode
            ? 'active'
            : ''
        }`;

      btn.textContent =
        `Ep ${ep.episode_number}`;

      btn.onclick = () => {
        document
          .querySelectorAll('.episode-btn')
          .forEach(b =>
            b.classList.remove('active')
          );

        btn.classList.add('active');

        currentEpisode =
          ep.episode_number;

        loadVideo();
        saveCurrentProgress();
      };

      episodesContainer.appendChild(btn);
    });

    loadVideo();
  } catch (error) {
    console.error('Error loading episodes:', error);
  }
}

function onSeasonChange() {
  if (!currentItem || !isTV(currentItem)) return;

  const select =
    document.getElementById('season-select');

  if (!select) return;

  const selectedSeason =
    Number(select.value);

  currentSeason = selectedSeason;

  /*
   * Always start at episode 1 when changing seasons.
   */
  currentEpisode = 1;

  loadEpisodes(
    currentItem.id,
    currentSeason,
    currentEpisode
  );

  saveCurrentProgress();
}

/* =========================
   VIDEO PLAYER
========================= */

function loadVideo() {
  if (!currentItem) return;

  const video =
    document.getElementById('modal-video');

  if (!video) return;

  let embedURL = '';

  if (isTV(currentItem)) {
    embedURL =
      `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;
  } else {
    embedURL =
      `https://player.videasy.net/movie/${currentItem.id}`;
  }

  if (video.src !== embedURL) {
    video.src = embedURL;
  }
}

/* =========================
   CLOSE MODAL
========================= */

function closeModal() {
  const modal =
    document.getElementById('modal');

  const video =
    document.getElementById('modal-video');

  if (modal) {
    modal.classList.remove('active');
  }

  if (video) {
    video.src = 'about:blank';
  }

  document.body.classList.remove('modal-open');
}

/* =========================
   WATCHLIST
========================= */

function getWatchlist() {
  try {
    return JSON.parse(
      localStorage.getItem('myList')
    ) || [];
  } catch {
    return [];
  }
}

function isItemInWatchlist(id) {
  return getWatchlist().some(
    item => item.id === id
  );
}

function toggleWatchlist() {
  if (!currentItem) return;

  let list = getWatchlist();

  const index = list.findIndex(
    item => item.id === currentItem.id
  );

  if (index > -1) {
    list.splice(index, 1);
  } else {
    list.push(currentItem);
  }

  localStorage.setItem(
    'myList',
    JSON.stringify(list)
  );

  updateWatchlistButton();
  renderWatchlistRow();
}

function updateWatchlistButton() {
  const btn =
    document.getElementById('watchlist-btn');

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

  const row =
    document.getElementById('watchlist-row');

  if (!row) return;

  row.style.display =
    list.length === 0
      ? 'none'
      : 'block';

  if (list.length > 0) {
    displayList(
      list,
      'watchlist-list',
      'movie'
    );
  }
}

/* =========================
   CONTINUE WATCHING
========================= */

function getContinueWatching() {
  try {
    return JSON.parse(
      localStorage.getItem('continueWatching')
    ) || [];
  } catch {
    return [];
  }
}

function saveCurrentProgress() {
  if (!currentItem) return;

  let list = getContinueWatching();

  const existingIndex =
    list.findIndex(
      i => i.id === currentItem.id
    );

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

  if (list.length > 15) {
    list = list.slice(0, 15);
  }

  localStorage.setItem(
    'continueWatching',
    JSON.stringify(list)
  );

  renderContinueWatchingRow();
}

function renderContinueWatchingRow() {
  const list = getContinueWatching();

  const row =
    document.getElementById('continue-row');

  if (!row) return;

  row.style.display =
    list.length === 0
      ? 'none'
      : 'block';

  if (list.length > 0) {
    displayList(
      list,
      'continue-list',
      'movie'
    );
  }
}

/* =========================
   CATEGORY FILTER
========================= */

function filterContent(
  category,
  eventElement
) {
  document
    .querySelectorAll('.tab-btn')
    .forEach(btn =>
      btn.classList.remove('active')
    );

  if (eventElement) {
    eventElement.classList.add('active');
  }

  const rows = {
    continue: document.getElementById('continue-row'),
    watchlist: document.getElementById('watchlist-row'),
    movies: document.getElementById('movies-row'),
    tv: document.getElementById('tvshows-row'),
    anime: document.getElementById('anime-row'),
    tagalog: document.getElementById('tagalog-row'),
    kdrama: document.getElementById('kdrama-row'),
    vivamax: document.getElementById('vivamax-row')
  };

  const hasWatchlist =
    getWatchlist().length > 0;

  const hasContinue =
    getContinueWatching().length > 0;

  Object.values(rows).forEach(row => {
    if (row) {
      row.style.display = 'none';
    }
  });

  if (category === 'all') {
    if (hasContinue && rows.continue) {
      rows.continue.style.display = 'block';
    }

    if (hasWatchlist && rows.watchlist) {
      rows.watchlist.style.display = 'block';
    }

    if (rows.movies) {
      rows.movies.style.display = 'block';
    }

    if (rows.tv) {
      rows.tv.style.display = 'block';
    }

    if (rows.anime) {
      rows.anime.style.display = 'block';
    }

    if (rows.tagalog) {
      rows.tagalog.style.display = 'block';
    }

    if (rows.kdrama) {
      rows.kdrama.style.display = 'block';
    }

    if (rows.vivamax) {
      rows.vivamax.style.display = 'block';
    }

  } else if (category === 'movie') {

    if (rows.movies) {
      rows.movies.style.display = 'block';
    }

    if (rows.tagalog) {
      rows.tagalog.style.display = 'block';
    }

    if (rows.vivamax) {
      rows.vivamax.style.display = 'block';
    }

  } else if (category === 'tv') {

    if (rows.tv) {
      rows.tv.style.display = 'block';
    }

    if (rows.kdrama) {
      rows.kdrama.style.display = 'block';
    }

  } else if (category === 'anime') {

    if (rows.anime) {
      rows.anime.style.display = 'block';
    }
  }
}

/* =========================
   GENRE FILTER
========================= */

async function filterByGenre(
  genreId,
  eventElement
) {
  document
    .querySelectorAll('.genre-btn')
    .forEach(btn =>
      btn.classList.remove('active')
    );

  if (eventElement) {
    eventElement.classList.add('active');
  }

  if (genreId === 'all') {
    await init();
    return;
  }

  const genreResults =
    await fetchByGenreId(genreId);

  [
    'continue-row',
    'watchlist-row',
    'tvshows-row',
    'anime-row',
    'tagalog-row',
    'kdrama-row',
    'vivamax-row'
  ].forEach(id => {
    const el =
      document.getElementById(id);

    if (el) {
      el.style.display = 'none';
    }
  });

  const moviesRow =
    document.getElementById('movies-row');

  if (moviesRow) {
    moviesRow.style.display = 'block';

    const heading =
      moviesRow.querySelector('h2');

    if (heading) {
      heading.textContent =
        `${eventElement.textContent} Movies`;
    }

    displayList(
      genreResults,
      'movies-list',
      'movie'
    );
  }
}

/* =========================
   GRID MODAL
========================= */

function openGridModal(category) {
  const modal =
    document.getElementById('grid-modal');

  const titleEl =
    document.getElementById('grid-modal-title');

  const container =
    document.getElementById('grid-modal-results');

  if (!modal || !container) return;

  container.innerHTML = '';

  const titles = {
    movies: 'Trending Movies',
    tv: 'Trending TV Shows',
    anime: 'Trending Anime',
    tagalog: 'Trending Tagalog Movies',
    kdrama: 'Trending K-Dramas',
    vivamax: 'Top Rated Vivamax Movies'
  };

  if (titleEl) {
    titleEl.textContent =
      titles[category] || 'Category';
  }

  const items =
    fullDataCache[category] || [];

  items.forEach(item => {
    if (!item || !item.poster_path) return;

    const img =
      document.createElement('img');

    img.src =
      `${IMG_URL}${item.poster_path}`;

    img.alt =
      getItemTitle(item);

    img.loading = 'lazy';

    img.onerror = () => {
      img.onerror = null;
      img.src = PLACEHOLDER_IMG;
    };

    img.onclick = () => {
      closeGridModal();
      showDetails(item);
    };

    container.appendChild(img);
  });

  modal.classList.add('active');
  document.body.classList.add('modal-open');
}

function closeGridModal() {
  const modal =
    document.getElementById('grid-modal');

  if (modal) {
    modal.classList.remove('active');
  }

  document.body.classList.remove('modal-open');
}

/* =========================
   SEARCH MODAL
========================= */

function openSearchModal() {
  const modal =
    document.getElementById('search-modal');

  const input =
    document.getElementById('search-input');

  if (!modal || !input) return;

  modal.classList.add('active');

  document.body.classList.add('modal-open');

  setTimeout(() => {
    input.focus();
  }, 100);
}

function closeSearchModal() {
  const modal =
    document.getElementById('search-modal');

  const results =
    document.getElementById('search-results');

  const input =
    document.getElementById('search-input');

  if (modal) {
    modal.classList.remove('active');
  }

  if (results) {
    results.innerHTML = '';
  }

  if (input) {
    input.value = '';
  }

  document.body.classList.remove('modal-open');
}

function debounceSearch() {
  clearTimeout(searchTimeout);

  searchTimeout =
    setTimeout(searchTMDB, 300);
}

async function searchTMDB() {
  const input =
    document.getElementById('search-input');

  const container =
    document.getElementById('search-results');

  if (!input || !container) return;

  const query =
    input.value.trim();

  if (!query) {
    container.innerHTML = '';
    return;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`
    );

    if (!res.ok) {
      console.error(
        `Search failed: ${res.status}`
      );
      return;
    }

    const data =
      await res.json();

    container.innerHTML = '';

    const results =
      removeDuplicates(
        data.results || []
      );

    results.forEach(item => {
      if (
        !item.poster_path ||
        item.media_type === 'person'
      ) {
        return;
      }

      if (!item.media_type) {
        item.media_type =
          item.title
            ? 'movie'
            : 'tv';
      }

      const img =
        document.createElement('img');

      img.src =
        `${IMG_URL}${item.poster_path}`;

      img.alt =
        getItemTitle(item);

      img.loading = 'lazy';

      img.onerror = () => {
        img.onerror = null;
        img.src = PLACEHOLDER_IMG;
      };

      img.onclick = () => {
        closeSearchModal();
        showDetails(item);
      };

      container.appendChild(img);
    });

  } catch (error) {
    console.error(
      'Search error:',
      error
    );
  }
}

/* =========================
   INITIALIZE
========================= */

async function init() {
  try {
    const [
      movies,
      tvShows,
      anime,
      tagalogMovies,
      kDramas,
      vivamaxMovies
    ] = await Promise.all([
      fetchTrending('movie'),
      fetchTrending('tv'),
      fetchTrendingAnime(),
      fetchTagalogContent(),
      fetchKDramas(),
      fetchTopRatedVivamax()
    ]);

    fullDataCache = {
      movies: removeDuplicates(movies),
      tv: removeDuplicates(tvShows),
      anime: removeDuplicates(anime),
      tagalog: removeDuplicates(tagalogMovies),
      kdrama: removeDuplicates(kDramas),
      vivamax: removeDuplicates(vivamaxMovies)
    };

    if (movies.length > 0) {
      displayBanner(movies);
    }

    const movieRowH2 =
      document.querySelector(
        '#movies-row h2'
      );

    if (movieRowH2) {
      movieRowH2.textContent =
        'Trending Movies';
    }

    displayList(
      fullDataCache.movies,
      'movies-list',
      'movie'
    );

    displayList(
      fullDataCache.tv,
      'tvshows-list',
      'tv'
    );

    displayList(
      fullDataCache.anime,
      'anime-list',
      'tv'
    );

    displayList(
      fullDataCache.tagalog,
      'tagalog-list',
      'movie'
    );

    displayList(
      fullDataCache.kdrama,
      'kdrama-list',
      'tv'
    );

    displayList(
      fullDataCache.vivamax,
      'vivamax-list',
      'movie'
    );

    renderWatchlistRow();
    renderContinueWatchingRow();

  } catch (error) {
    console.error(
      'Homepage initialization error:',
      error
    );
  }
}

/* =========================
   KEYBOARD CONTROLS
========================= */

document.addEventListener(
  'keydown',
  event => {
    if (event.key !== 'Escape') return;

    const modal =
      document.getElementById('modal');

    const gridModal =
      document.getElementById('grid-modal');

    const searchModal =
      document.getElementById('search-modal');

    if (
      modal?.classList.contains('active')
    ) {
      closeModal();
    } else if (
      gridModal?.classList.contains('active')
    ) {
      closeGridModal();
    } else if (
      searchModal?.classList.contains('active')
    ) {
      closeSearchModal();
    }
  }
);

init();