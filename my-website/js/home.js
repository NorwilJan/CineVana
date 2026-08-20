const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%23222"><rect width="100%" height="100%"/></svg>';

/*
 * IMPORTANT:
 * Put only video servers that you own, operate, or are licensed to use.
 *
 * The player will:
 * 1. Try the primary server.
 * 2. Wait 8 seconds.
 * 3. If it fails, automatically try the fallback.
 *
 * No server-selection UI is shown.
 */

const VIDEO_SERVERS = [
  {
    name: 'Primary',
    movie: id => `https://YOUR-PRIMARY-SERVER/movie/${id}`,
    tv: (id, season, episode) =>
      `https://YOUR-PRIMARY-SERVER/tv/${id}/${season}/${episode}`
  },
  {
    name: 'Fallback',
    movie: id => `https://YOUR-FALLBACK-SERVER/movie/${id}`,
    tv: (id, season, episode) =>
      `https://YOUR-FALLBACK-SERVER/tv/${id}/${season}/${episode}`
  }
];

let currentItem;
let bannerItem;
let currentSeason = 1;
let currentEpisode = 1;
let currentServerIndex = 0;
let playerTimeout = null;

let searchTimeout;
let showDetailsCache = {};

let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  kdrama: []
};


/* =========================
   VIDEO PLAYER / FAILOVER
========================= */

function getVideoURL(serverIndex = 0) {
  if (!currentItem || !VIDEO_SERVERS[serverIndex]) return '';

  const server = VIDEO_SERVERS[serverIndex];

  const isTv =
    currentItem.media_type === 'tv' ||
    !currentItem.title;

  if (isTv) {
    return server.tv(
      currentItem.id,
      currentSeason,
      currentEpisode
    );
  }

  return server.movie(currentItem.id);
}


function startPlayer() {
  clearTimeout(playerTimeout);

  currentServerIndex = 0;

  const iframe = document.getElementById('modal-video');

  if (!iframe || !currentItem) return;

  iframe.src = getVideoURL(currentServerIndex);

  /*
   * Give the primary player enough time to initialize.
   * Slow connections should not immediately trigger fallback.
   */
  playerTimeout = setTimeout(() => {
    switchToNextServer();
  }, 8000);
}


function switchToNextServer() {
  clearTimeout(playerTimeout);

  const nextIndex = currentServerIndex + 1;

  if (nextIndex >= VIDEO_SERVERS.length) {
    console.warn('All available video servers failed.');
    return;
  }

  currentServerIndex = nextIndex;

  const iframe = document.getElementById('modal-video');

  if (!iframe) return;

  iframe.src = getVideoURL(currentServerIndex);

  /*
   * Give the fallback server another 8 seconds.
   */
  playerTimeout = setTimeout(() => {
    switchToNextServer();
  }, 8000);
}


/*
 * Manual player error handler.
 * Some iframe providers don't expose errors to the parent page,
 * so the timeout above remains the main fallback mechanism.
 */
function handlePlayerError() {
  switchToNextServer();
}


/* =========================
   FETCHING
========================= */

async function fetchMultiplePages(endpoint, maxPages = 3) {
  let allResults = [];

  try {
    for (let page = 1; page <= maxPages; page++) {

      const res = await fetch(
        `${BASE_URL}${endpoint}&page=${page}&api_key=${API_KEY}`
      );

      if (!res.ok) continue;

      const data = await res.json();

      if (data.results) {
        allResults = allResults.concat(data.results);
      }
    }
  } catch (error) {
    console.error(
      'Error fetching multiple pages:',
      error
    );
  }

  return allResults;
}


async function fetchTrending(type) {
  return await fetchMultiplePages(
    `/trending/${type}/week?`,
    3
  );
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

        const filtered = data.results.filter(item =>
          item.original_language === 'ja' &&
          item.genre_ids &&
          item.genre_ids.includes(16)
        );

        allResults = allResults.concat(filtered);
      }
    }
  } catch (error) {
    console.error(
      'Error fetching anime:',
      error
    );
  }

  return allResults;
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


async function fetchByGenreId(genreId) {
  return await fetchMultiplePages(
    `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`,
    3
  );
}


/* =========================
   BANNER
========================= */

function displayBanner(item) {

  if (!item || !item.backdrop_path) return;

  bannerItem = item;

  const bannerEl =
    document.getElementById('banner');

  const titleEl =
    document.getElementById('banner-title');

  if (bannerEl) {
    bannerEl.style.backgroundImage =
      `url(${IMG_URL}${item.backdrop_path})`;
  }

  if (titleEl) {
    titleEl.textContent =
      item.title || item.name;
  }
}


function playBanner() {

  if (bannerItem) {
    showDetails(bannerItem);
  }
}


/* =========================
   LIST DISPLAY
========================= */

function displayList(
  items,
  containerId,
  mediaType
) {

  const container =
    document.getElementById(containerId);

  if (!container) return;

  container.innerHTML = '';

  items.slice(0, 20).forEach(item => {

    if (!item.poster_path) return;

    if (!item.media_type) {
      item.media_type = mediaType;
    }

    const img =
      document.createElement('img');

    img.src =
      `${IMG_URL}${item.poster_path}`;

    img.alt =
      item.title || item.name;

    img.loading = 'lazy';

    img.onerror = () => {
      img.src = PLACEHOLDER_IMG;
    };

    img.onclick = () =>
      showDetails(item);

    container.appendChild(img);
  });
}


/* =========================
   MOVIE / TV DETAILS
========================= */

async function showDetails(item) {

  currentItem = item;

  let continueList =
    getContinueWatching();

  let savedProgress =
    continueList.find(
      i => i.id === item.id
    );

  currentSeason =
    savedProgress
      ? (savedProgress.savedSeason || 1)
      : 1;

  currentEpisode =
    savedProgress
      ? (savedProgress.savedEpisode || 1)
      : 1;

  document.getElementById(
    'modal-title'
  ).textContent =
    item.title || item.name;

  document.getElementById(
    'modal-description'
  ).textContent =
    item.overview ||
    'No description available.';

  const imgEl =
    document.getElementById('modal-image');

  imgEl.src =
    `${IMG_URL}${item.poster_path}`;

  imgEl.onerror = () => {
    imgEl.src = PLACEHOLDER_IMG;
  };

  document.getElementById(
    'modal-rating'
  ).innerHTML =
    item.vote_average
      ? '★'.repeat(
          Math.round(item.vote_average / 2)
        )
      : '';

  updateWatchlistButton();
  saveCurrentProgress();

  const isTv =
    currentItem.media_type === 'tv' ||
    !currentItem.title;

  const seriesOptions =
    document.getElementById(
      'series-options'
    );

  if (isTv) {

    seriesOptions.style.display = 'flex';

    await loadTVSeasons(
      currentItem.id,
      currentSeason,
      currentEpisode
    );

  } else {

    seriesOptions.style.display = 'none';

    startPlayer();
  }

  document.getElementById(
    'modal'
  ).classList.add('active');

  document.body.classList.add(
    'modal-open'
  );
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
    document.getElementById(
      'season-select'
    );

  if (!seasonSelect) return;

  seasonSelect.innerHTML = '';

  try {

    let data =
      showDetailsCache[tvId];

    if (!data) {

      const res =
        await fetch(
          `${BASE_URL}/tv/${tvId}?api_key=${API_KEY}`
        );

      if (res.ok) {

        data =
          await res.json();

        showDetailsCache[tvId] =
          data;
      }
    }

    if (data && data.seasons) {

      data.seasons.forEach(
        season => {

          if (
            season.season_number > 0
          ) {

            const option =
              document.createElement(
                'option'
              );

            option.value =
              season.season_number;

            option.textContent =
              season.name ||
              `Season ${season.season_number}`;

            if (
              season.season_number ===
              targetSeason
            ) {
              option.selected = true;
            }

            seasonSelect.appendChild(
              option
            );
          }
        }
      );
    }

    currentSeason =
      targetSeason;

    currentEpisode =
      targetEpisode;

    await loadEpisodes(
      tvId,
      targetSeason
    );

  } catch (error) {

    console.error(
      'Error loading TV seasons:',
      error
    );
  }
}


/* =========================
   EPISODES
========================= */

async function loadEpisodes(
  tvId,
  seasonNumber
) {

  const previousSeason =
    currentSeason;

  currentSeason =
    seasonNumber;

  const episodesContainer =
    document.getElementById(
      'episodes-container'
    );

  if (!episodesContainer) return;

  episodesContainer.innerHTML = '';

  try {

    const res =
      await fetch(
        `${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`
      );

    if (!res.ok) return;

    const data =
      await res.json();

    if (
      data.episodes &&
      data.episodes.length > 0
    ) {

      /*
       * When changing season,
       * automatically select Episode 1.
       */
      if (
        previousSeason !== seasonNumber ||
        !currentEpisode
      ) {

        currentEpisode =
          data.episodes[0]
            .episode_number;
      }

      data.episodes.forEach(
        ep => {

          const btn =
            document.createElement(
              'button'
            );

          btn.className =
            `episode-btn ${
              ep.episode_number ===
              currentEpisode
                ? 'active'
                : ''
            }`;

          btn.textContent =
            `Ep ${ep.episode_number}`;

          btn.onclick = () => {

            document
              .querySelectorAll(
                '.episode-btn'
              )
              .forEach(
                b =>
                  b.classList.remove(
                    'active'
                  )
              );

            btn.classList.add(
              'active'
            );

            currentEpisode =
              ep.episode_number;

            startPlayer();

            saveCurrentProgress();
          };

          episodesContainer.appendChild(
            btn
          );
        }
      );
    }

    startPlayer();

  } catch (error) {

    console.error(
      'Error loading episodes:',
      error
    );
  }
}


function onSeasonChange() {

  const selectedSeason =
    document.getElementById(
      'season-select'
    ).value;

  currentEpisode = 1;

  loadEpisodes(
    currentItem.id,
    parseInt(selectedSeason)
  );
}


/* =========================
   CLOSE MODAL
========================= */

function closeModal() {

  clearTimeout(playerTimeout);

  const iframe =
    document.getElementById(
      'modal-video'
    );

  if (iframe) {
    iframe.src = 'about:blank';
  }

  document.getElementById(
    'modal'
  ).classList.remove('active');

  document.body.classList.remove(
    'modal-open'
  );
}


/* =========================
   WATCHLIST
========================= */

function getWatchlist() {

  return JSON.parse(
    localStorage.getItem(
      'myList'
    )
  ) || [];
}


function isItemInWatchlist(id) {

  return getWatchlist()
    .some(item => item.id === id);
}


function toggleWatchlist() {

  if (!currentItem) return;

  let list =
    getWatchlist();

  const index =
    list.findIndex(
      item =>
        item.id === currentItem.id
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
    document.getElementById(
      'watchlist-btn'
    );

  if (!btn || !currentItem) return;

  if (
    isItemInWatchlist(
      currentItem.id
    )
  ) {

    btn.textContent =
      'Remove from List';

    btn.classList.add(
      'remove'
    );

  } else {

    btn.textContent =
      'Add to List';

    btn.classList.remove(
      'remove'
    );
  }
}


function renderWatchlistRow() {

  const list =
    getWatchlist();

  const row =
    document.getElementById(
      'watchlist-row'
    );

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

  return JSON.parse(
    localStorage.getItem(
      'continueWatching'
    )
  ) || [];
}


function saveCurrentProgress() {

  if (!currentItem) return;

  let list =
    getContinueWatching();

  let existingIndex =
    list.findIndex(
      i =>
        i.id === currentItem.id
    );

  const itemData = {

    ...currentItem,

    savedSeason:
      currentSeason,

    savedEpisode:
      currentEpisode,

    lastWatched:
      Date.now()
  };

  if (existingIndex > -1) {
    list.splice(
      existingIndex,
      1
    );
  }

  list.unshift(
    itemData
  );

  if (list.length > 15) {
    list.pop();
  }

  localStorage.setItem(
    'continueWatching',
    JSON.stringify(list)
  );

  renderContinueWatchingRow();
}


function renderContinueWatchingRow() {

  const list =
    getContinueWatching();

  const row =
    document.getElementById(
      'continue-row'
    );

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
    .querySelectorAll(
      '.tab-btn'
    )
    .forEach(
      btn =>
        btn.classList.remove(
          'active'
        )
    );

  eventElement.classList.add(
    'active'
  );

  const rows = {

    continue:
      document.getElementById(
        'continue-row'
      ),

    watchlist:
      document.getElementById(
        'watchlist-row'
      ),

    movies:
      document.getElementById(
        'movies-row'
      ),

    tv:
      document.getElementById(
        'tvshows-row'
      ),

    anime:
      document.getElementById(
        'anime-row'
      ),

    tagalog:
      document.getElementById(
        'tagalog-row'
      ),

    kdrama:
      document.getElementById(
        'kdrama-row'
      )
  };

  const hasWatchlist =
    getWatchlist().length > 0;

  const hasContinue =
    getContinueWatching().length > 0;

  Object.values(rows).forEach(
    r => {
      if (r)
        r.style.display =
          'none';
    }
  );

  if (category === 'all') {

    if (
      hasContinue &&
      rows.continue
    )
      rows.continue.style.display =
        'block';

    if (
      hasWatchlist &&
      rows.watchlist
    )
      rows.watchlist.style.display =
        'block';

    if (rows.movies)
      rows.movies.style.display =
        'block';

    if (rows.tv)
      rows.tv.style.display =
        'block';

    if (rows.anime)
      rows.anime.style.display =
        'block';

    if (rows.tagalog)
      rows.tagalog.style.display =
        'block';

    if (rows.kdrama)
      rows.kdrama.style.display =
        'block';

  } else if (category === 'movie') {

    if (rows.movies)
      rows.movies.style.display =
        'block';

    if (rows.tagalog)
      rows.tagalog.style.display =
        'block';

  } else if (category === 'tv') {

    if (rows.tv)
      rows.tv.style.display =
        'block';

    if (rows.kdrama)
      rows.kdrama.style.display =
        'block';

  } else if (category === 'anime') {

    if (rows.anime)
      rows.anime.style.display =
        'block';
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
    .querySelectorAll(
      '.genre-btn'
    )
    .forEach(
      btn =>
        btn.classList.remove(
          'active'
        )
    );

  eventElement.classList.add(
    'active'
  );

  if (genreId === 'all') {

    init();

    return;
  }

  const genreResults =
    await fetchByGenreId(
      genreId
    );

  [
    'continue-row',
    'watchlist-row',
    'tvshows-row',
    'anime-row',
    'tagalog-row',
    'kdrama-row'
  ].forEach(id => {

    const el =
      document.getElementById(id);

    if (el)
      el.style.display =
        'none';
  });

  const moviesRow =
    document.getElementById(
      'movies-row'
    );

  if (moviesRow) {

    moviesRow.style.display =
      'block';

    moviesRow.querySelector(
      'h2'
    ).textContent =
      `${eventElement.textContent} Movies`;

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
    document.getElementById(
      'grid-modal'
    );

  const titleEl =
    document.getElementById(
      'grid-modal-title'
    );

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  container.innerHTML = '';

  const titles = {

    movies:
      'Trending Movies',

    tv:
      'Trending TV Shows',

    anime:
      'Trending Anime',

    tagalog:
      'Trending Tagalog Movies',

    kdrama:
      'Trending K-Dramas'
  };

  if (titleEl) {

    titleEl.textContent =
      titles[category] ||
      'Category';
  }

  (
    fullDataCache[category] ||
    []
  ).forEach(item => {

    if (!item.poster_path)
      return;

    const img =
      document.createElement(
        'img'
      );

    img.src =
      `${IMG_URL}${item.poster_path}`;

    img.alt =
      item.title ||
      item.name;

    img.loading = 'lazy';

    img.onerror = () => {
      img.src =
        PLACEHOLDER_IMG;
    };

    img.onclick = () => {

      closeGridModal();

      showDetails(item);
    };

    container.appendChild(
      img
    );
  });

  modal.classList.add(
    'active'
  );

  document.body.classList.add(
    'modal-open'
  );
}


function closeGridModal() {

  document.getElementById(
    'grid-modal'
  ).classList.remove(
    'active'
  );

  document.body.classList.remove(
    'modal-open'
  );
}


/* =========================
   SEARCH
========================= */

function openSearchModal() {

  document.getElementById(
    'search-modal'
  ).classList.add(
    'active'
  );

  document.getElementById(
    'search-input'
  ).focus();
}


function closeSearchModal() {

  document.getElementById(
    'search-modal'
  ).classList.remove(
    'active'
  );

  document.getElementById(
    'search-results'
  ).innerHTML = '';

  document.getElementById(
    'search-input'
  ).value = '';
}


function debounceSearch() {

  clearTimeout(
    searchTimeout
  );

  searchTimeout =
    setTimeout(
      searchTMDB,
      300
    );
}


async function searchTMDB() {

  const query =
    document.getElementById(
      'search-input'
    ).value;

  const container =
    document.getElementById(
      'search-results'
    );

  if (!query.trim()) {

    container.innerHTML = '';

    return;
  }

  const res =
    await fetch(
      `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`
    );

  if (!res.ok) return;

  const data =
    await res.json();

  container.innerHTML = '';

  data.results.forEach(
    item => {

      if (
        !item.poster_path ||
        item.media_type === 'person'
      )
        return;

      if (!item.media_type) {

        item.media_type =
          item.title
            ? 'movie'
            : 'tv';
      }

      const img =
        document.createElement(
          'img'
        );

      img.src =
        `${IMG_URL}${item.poster_path}`;

      img.alt =
        item.title ||
        item.name;

      img.loading = 'lazy';

      img.onerror = () => {
        img.src =
          PLACEHOLDER_IMG;
      };

      img.onclick = () => {

        closeSearchModal();

        showDetails(item);
      };

      container.appendChild(
        img
      );
    }
  );
}


/* =========================
   INITIALIZATION
========================= */

async function init() {

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

    fetchTagalogContent(),

    fetchKDramas()
  ]);

  fullDataCache = {

    movies,

    tv: tvShows,

    anime,

    tagalog:
      tagalogMovies,

    kdrama:
      kDramas
  };

  if (movies.length > 0) {

    displayBanner(
      movies[
        Math.floor(
          Math.random() *
          movies.length
        )
      ]
    );
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
    movies,
    'movies-list',
    'movie'
  );

  displayList(
    tvShows,
    'tvshows-list',
    'tv'
  );

  displayList(
    anime,
    'anime-list',
    'tv'
  );

  displayList(
    tagalogMovies,
    'tagalog-list',
    'movie'
  );

  displayList(
    kDramas,
    'kdrama-list',
    'tv'
  );

  renderWatchlistRow();

  renderContinueWatchingRow();
}


init();