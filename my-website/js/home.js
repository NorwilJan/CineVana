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

let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  kdrama: [],
  vivamax: []
};

/* =========================================================
   INFINITE SCROLL STATE
========================================================= */

const infiniteState = {
  movies: {
    page: 1,
    totalPages: 1,
    loading: false,
    finished: false,
    ids: new Set()
  },

  tv: {
    page: 1,
    totalPages: 1,
    loading: false,
    finished: false,
    ids: new Set()
  },

  anime: {
    page: 1,
    totalPages: 1,
    loading: false,
    finished: false,
    ids: new Set()
  },

  tagalog: {
    page: 1,
    totalPages: 1,
    loading: false,
    finished: false,
    ids: new Set()
  },

  kdrama: {
    page: 1,
    totalPages: 1,
    loading: false,
    finished: false,
    ids: new Set()
  },

  vivamax: {
    page: 1,
    totalPages: 1,
    loading: false,
    finished: false,
    ids: new Set()
  }
};

let currentGridCategory = null;

/* =========================================================
   BASIC FETCH
========================================================= */

async function fetchPage(endpoint, page = 1) {
  try {
    const separator = endpoint.includes('?') ? '&' : '?';

    const res = await fetch(
      `${BASE_URL}${endpoint}${separator}page=${page}&api_key=${API_KEY}`
    );

    if (!res.ok) {
      console.error('TMDB request failed:', res.status);
      return {
        results: [],
        page,
        total_pages: 1,
        total_results: 0
      };
    }

    return await res.json();

  } catch (error) {
    console.error('TMDB fetch error:', error);

    return {
      results: [],
      page,
      total_pages: 1,
      total_results: 0
    };
  }
}

async function fetchMultiplePages(endpoint, maxPages = 3) {
  let allResults = [];

  try {
    for (let page = 1; page <= maxPages; page++) {
      const data = await fetchPage(endpoint, page);

      if (data.results) {
        allResults = allResults.concat(data.results);
      }

      if (page >= (data.total_pages || 1)) {
        break;
      }
    }
  } catch (error) {
    console.error('Error fetching multiple pages:', error);
  }

  return allResults;
}

/* =========================================================
   HOMEPAGE DATA
========================================================= */

async function fetchTrending(type) {
  return await fetchMultiplePages(`/trending/${type}/week?`, 3);
}

async function fetchTrendingAnime() {
  let allResults = [];

  try {
    for (let page = 1; page <= 5; page++) {

      const data = await fetchPage('/trending/tv/week?', page);

      if (!data.results) continue;

      const filtered = data.results.filter(item =>
        item.original_language === 'ja' &&
        item.genre_ids &&
        item.genre_ids.includes(16)
      );

      allResults = allResults.concat(filtered);

      if (page >= (data.total_pages || 1)) {
        break;
      }
    }
  } catch (error) {
    console.error('Error fetching anime:', error);
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

/*
   TMDB Vivamax company ID = 149142
   Sorted by rating with a minimum vote count
*/
async function fetchVivamax() {
  return await fetchMultiplePages(
    `/discover/movie?with_companies=149142&sort_by=vote_average.desc&vote_count.gte=10`,
    3
  );
}

async function fetchByGenreId(genreId) {
  return await fetchMultiplePages(
    `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`,
    3
  );
}

/* =========================================================
   BANNER
========================================================= */

function displayBanner(item) {
  if (!item || !item.backdrop_path) return;

  bannerItem = item;

  const bannerEl = document.getElementById('banner');
  const titleEl = document.getElementById('banner-title');

  if (bannerEl) {
    bannerEl.style.backgroundImage =
      `linear-gradient(to top, #111 10%, rgba(17,17,17,0.4) 60%, rgba(17,17,17,0.8)), url(${IMG_URL}${item.backdrop_path})`;
  }

  if (titleEl) {
    titleEl.textContent = item.title || item.name || '';
  }
}

function playBanner() {
  if (bannerItem) {
    showDetails(bannerItem);
  }
}

/* =========================================================
   DISPLAY HORIZONTAL ROW
========================================================= */

function displayList(items, containerId, mediaType) {
  const container = document.getElementById(containerId);

  if (!container) return;

  container.innerHTML = '';

  items.slice(0, 20).forEach(item => {

    if (!item.poster_path) return;

    if (!item.media_type) {
      item.media_type = mediaType;
    }

    const img = document.createElement('img');

    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name || 'Movie';
    img.loading = 'lazy';

    img.onerror = () => {
      img.src = PLACEHOLDER_IMG;
    };

    img.onclick = () => showDetails(item);

    container.appendChild(img);
  });
}

/* =========================================================
   DETAILS MODAL
========================================================= */

async function showDetails(item) {
  if (!item) return;

  currentItem = item;

  const continueList = getContinueWatching();

  const savedProgress = continueList.find(
    i => i.id === item.id
  );

  currentSeason = savedProgress
    ? (savedProgress.savedSeason || 1)
    : 1;

  currentEpisode = savedProgress
    ? (savedProgress.savedEpisode || 1)
    : 1;

  document.getElementById('modal-title').textContent =
    item.title || item.name || '';

  document.getElementById('modal-description').textContent =
    item.overview || 'No description available.';

  const imgEl = document.getElementById('modal-image');

  imgEl.src = item.poster_path
    ? `${IMG_URL}${item.poster_path}`
    : PLACEHOLDER_IMG;

  imgEl.onerror = () => {
    imgEl.src = PLACEHOLDER_IMG;
  };

  const rating = item.vote_average || 0;

  document.getElementById('modal-rating').innerHTML =
    rating
      ? `${'★'.repeat(Math.round(rating / 2))}${'☆'.repeat(5 - Math.round(rating / 2))} ${rating.toFixed(1)}`
      : '';

  updateWatchlistButton();
  saveCurrentProgress();

  const isTv =
    item.media_type === 'tv' ||
    !item.title;

  const seriesOptions =
    document.getElementById('series-options');

  if (isTv) {

    seriesOptions.style.display = 'flex';

    await loadTVSeasons(
      currentItem.id,
      currentSeason,
      currentEpisode
    );

  } else {

    seriesOptions.style.display = 'none';

    loadVideo();
  }

  document.getElementById('modal').classList.add('active');

  document.body.classList.add('modal-open');
}

/* =========================================================
   TV SEASONS
========================================================= */

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

      if (res.ok) {
        data = await res.json();
        showDetailsCache[tvId] = data;
      }
    }

    if (data && data.seasons) {

      data.seasons.forEach(season => {

        if (season.season_number > 0) {

          const option =
            document.createElement('option');

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

          seasonSelect.appendChild(option);
        }
      });
    }

    currentSeason = targetSeason;
    currentEpisode = targetEpisode;

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

async function loadEpisodes(
  tvId,
  seasonNumber
) {
  currentSeason = seasonNumber;

  const episodesContainer =
    document.getElementById(
      'episodes-container'
    );

  if (!episodesContainer) return;

  episodesContainer.innerHTML = '';

  try {

    const res = await fetch(
      `${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`
    );

    if (!res.ok) return;

    const data = await res.json();

    if (
      data.episodes &&
      data.episodes.length > 0
    ) {

      const episodeExists =
        data.episodes.some(
          ep =>
            ep.episode_number ===
            currentEpisode
        );

      if (!episodeExists) {
        currentEpisode =
          data.episodes[0].episode_number;
      }

      data.episodes.forEach(ep => {

        const btn =
          document.createElement('button');

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
    }

    loadVideo();

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

  loadEpisodes(
    currentItem.id,
    parseInt(selectedSeason)
  );
}

/* =========================================================
   VIDEO
========================================================= */

function loadVideo() {

  if (!currentItem) return;

  const isTv =
    currentItem.media_type === 'tv' ||
    !currentItem.title;

  const embedURL = isTv

    ? `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`

    : `https://player.videasy.net/movie/${currentItem.id}`;

  const iframe =
    document.getElementById('modal-video');

  if (iframe) {
    iframe.src = embedURL;
  }
}

/* =========================================================
   CLOSE DETAILS
========================================================= */

function closeModal() {

  const modal =
    document.getElementById('modal');

  if (modal) {
    modal.classList.remove('active');
  }

  const iframe =
    document.getElementById('modal-video');

  if (iframe) {
    iframe.src = 'about:blank';
  }

  document.body.classList.remove(
    'modal-open'
  );
}

/* =========================================================
   WATCHLIST
========================================================= */

function getWatchlist() {

  return JSON.parse(
    localStorage.getItem('myList')
  ) || [];
}

function isItemInWatchlist(id) {

  return getWatchlist().some(
    item => item.id === id
  );
}

function toggleWatchlist() {

  if (!currentItem) return;

  let list = getWatchlist();

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

    btn.classList.add('remove');

  } else {

    btn.textContent =
      'Add to List';

    btn.classList.remove('remove');
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

/* =========================================================
   CONTINUE WATCHING
========================================================= */

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

  const existingIndex =
    list.findIndex(
      i =>
        i.id === currentItem.id
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

/* =========================================================
   CATEGORY FILTER
========================================================= */

function filterContent(
  category,
  eventElement
) {

  document
    .querySelectorAll('.tab-btn')
    .forEach(btn =>
      btn.classList.remove('active')
    );

  eventElement.classList.add('active');

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
      ),

    vivamax:
      document.getElementById(
        'vivamax-row'
      )
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

    if (
      hasContinue &&
      rows.continue
    ) {
      rows.continue.style.display =
        'block';
    }

    if (
      hasWatchlist &&
      rows.watchlist
    ) {
      rows.watchlist.style.display =
        'block';
    }

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

    if (rows.vivamax)
      rows.vivamax.style.display =
        'block';

  } else if (category === 'movie') {

    if (rows.movies)
      rows.movies.style.display =
        'block';

    if (rows.tagalog)
      rows.tagalog.style.display =
        'block';

    if (rows.vivamax)
      rows.vivamax.style.display =
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

/* =========================================================
   GENRE FILTER
========================================================= */

async function filterByGenre(
  genreId,
  eventElement
) {

  document
    .querySelectorAll('.genre-btn')
    .forEach(btn =>
      btn.classList.remove('active')
    );

  eventElement.classList.add('active');

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
    document.getElementById(
      'movies-row'
    );

  if (moviesRow) {

    moviesRow.style.display =
      'block';

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

/* =========================================================
   GRID MODAL
========================================================= */

function getGridTitle(category) {

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
      'Trending K-Dramas',

    vivamax:
      'Top Rated Vivamax Movies'
  };

  return titles[category] ||
    'Category';
}

function resetInfiniteState(
  category
) {

  if (!infiniteState[category]) {
    infiniteState[category] = {
      page: 1,
      totalPages: 1,
      loading: false,
      finished: false,
      ids: new Set()
    };
  }

  infiniteState[category].page = 1;
  infiniteState[category].totalPages = 1;
  infiniteState[category].loading = false;
  infiniteState[category].finished = false;
  infiniteState[category].ids = new Set();
}

function addLoader(container) {

  removeLoader();

  const loader =
    document.createElement('div');

  loader.id =
    'infinite-loader';

  loader.className =
    'infinite-loader';

  loader.innerHTML = `
    <div class="infinite-spinner"></div>
    <span>Loading more...</span>
  `;

  container.appendChild(loader);
}

function removeLoader() {

  const loader =
    document.getElementById(
      'infinite-loader'
    );

  if (loader) {
    loader.remove();
  }
}

function addEndMessage(container) {

  removeLoader();

  const end =
    document.createElement('div');

  end.className =
    'infinite-end';

  end.textContent =
    'You have reached the end of this catalog.';

  container.appendChild(end);
}

/* =========================================================
   GET PAGE FOR EACH CATEGORY
========================================================= */

async function fetchGridPage(
  category,
  page
) {

  switch (category) {

    case 'movies':

      return await fetchPage(
        '/trending/movie/week?',
        page
      );

    case 'tv':

      return await fetchPage(
        '/trending/tv/week?',
        page
      );

    case 'anime': {

      const data =
        await fetchPage(
          '/trending/tv/week?',
          page
        );

      data.results =
        (data.results || [])
          .filter(item =>
            item.original_language === 'ja' &&
            item.genre_ids &&
            item.genre_ids.includes(16)
          );

      return data;
    }

    case 'tagalog':

      return await fetchPage(
        '/discover/movie?with_original_language=tl&sort_by=popularity.desc',
        page
      );

    case 'kdrama':

      return await fetchPage(
        '/discover/tv?with_original_language=ko&sort_by=popularity.desc',
        page
      );

    case 'vivamax':

      return await fetchPage(
        '/discover/movie?with_companies=149142&sort_by=vote_average.desc&vote_count.gte=10',
        page
      );

    default:

      return {
        results: [],
        page,
        total_pages: 1
      };
  }
}

/* =========================================================
   ADD GRID ITEMS
========================================================= */

function appendGridItems(
  items,
  category
) {

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  if (!container) return;

  const state =
    infiniteState[category];

  items.forEach(item => {

    if (!item.poster_path) {
      return;
    }

    if (state.ids.has(item.id)) {
      return;
    }

    state.ids.add(item.id);

    if (!item.media_type) {

      if (
        category === 'tv' ||
        category === 'anime' ||
        category === 'kdrama'
      ) {
        item.media_type = 'tv';
      } else {
        item.media_type = 'movie';
      }
    }

    const img =
      document.createElement('img');

    img.src =
      `${IMG_URL}${item.poster_path}`;

    img.alt =
      item.title ||
      item.name ||
      'Movie';

    img.loading = 'lazy';

    img.onerror = () => {
      img.src = PLACEHOLDER_IMG;
    };

    img.onclick = () => {

      closeGridModal();

      showDetails(item);
    };

    container.appendChild(img);
  });
}

/* =========================================================
   LOAD INFINITE PAGE
========================================================= */

async function loadMoreGrid(
  category
) {

  const state =
    infiniteState[category];

  if (!state) return;

  if (state.loading) return;

  if (state.finished) return;

  if (
    state.page >
    state.totalPages
  ) {

    state.finished = true;

    const container =
      document.getElementById(
        'grid-modal-results'
      );

    if (container) {
      addEndMessage(container);
    }

    return;
  }

  state.loading = true;

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  if (container) {
    addLoader(container);
  }

  try {

    const data =
      await fetchGridPage(
        category,
        state.page
      );

    state.totalPages =
      data.total_pages || 1;

    appendGridItems(
      data.results || [],
      category
    );

    state.page++;

    if (
      state.page >
      state.totalPages
    ) {

      state.finished = true;

      if (container) {
        addEndMessage(container);
      }

    } else {

      removeLoader();
    }

  } catch (error) {

    console.error(
      'Infinite scroll error:',
      error
    );

    removeLoader();

  } finally {

    state.loading = false;
  }
}

/* =========================================================
   OPEN SEE ALL
========================================================= */

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

  if (!modal || !container) {
    return;
  }

  currentGridCategory =
    category;

  resetInfiniteState(
    category
  );

  container.innerHTML = '';

  if (titleEl) {
    titleEl.textContent =
      getGridTitle(category);
  }

  modal.classList.add('active');

  document.body.classList.add(
    'modal-open'
  );

  /*
     Load the first page only.
     Additional pages load as the user scrolls.
  */
  loadMoreGrid(category);
}

/* =========================================================
   INFINITE SCROLL LISTENER
========================================================= */

function handleGridScroll() {

  const modal =
    document.getElementById(
      'grid-modal'
    );

  if (!modal) return;

  if (
    !modal.classList.contains(
      'active'
    )
  ) {
    return;
  }

  const distanceFromBottom =
    modal.scrollHeight -
    modal.scrollTop -
    modal.clientHeight;

  /*
     Start loading 700px before
     the user reaches the bottom.
  */
  if (
    distanceFromBottom < 700 &&
    currentGridCategory
  ) {

    loadMoreGrid(
      currentGridCategory
    );
  }
}

/* =========================================================
   CLOSE GRID
========================================================= */

function closeGridModal() {

  const modal =
    document.getElementById(
      'grid-modal'
    );

  if (modal) {
    modal.classList.remove(
      'active'
    );

    modal.scrollTop = 0;
  }

  currentGridCategory = null;

  document.body.classList.remove(
    'modal-open'
  );
}

/* =========================================================
   SEARCH
========================================================= */

function openSearchModal() {

  const modal =
    document.getElementById(
      'search-modal'
    );

  const input =
    document.getElementById(
      'search-input'
    );

  if (!modal) return;

  modal.classList.add('active');

  if (input) {
    setTimeout(() => {
      input.focus();
    }, 100);
  }
}

function closeSearchModal() {

  const modal =
    document.getElementById(
      'search-modal'
    );

  const results =
    document.getElementById(
      'search-results'
    );

  const input =
    document.getElementById(
      'search-input'
    );

  if (modal) {
    modal.classList.remove(
      'active'
    );
  }

  if (results) {
    results.innerHTML = '';
  }

  if (input) {
    input.value = '';
  }
}

function debounceSearch() {

  clearTimeout(searchTimeout);

  searchTimeout =
    setTimeout(
      searchTMDB,
      300
    );
}

async function searchTMDB() {

  const input =
    document.getElementById(
      'search-input'
    );

  const container =
    document.getElementById(
      'search-results'
    );

  if (!input || !container) {
    return;
  }

  const query =
    input.value.trim();

  if (!query) {

    container.innerHTML = '';

    return;
  }

  try {

    const res =
      await fetch(
        `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`
      );

    if (!res.ok) return;

    const data =
      await res.json();

    container.innerHTML = '';

    (data.results || []).forEach(item => {

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
        item.title ||
        item.name ||
        'Movie';

      img.loading = 'lazy';

      img.onerror = () => {
        img.src =
          PLACEHOLDER_IMG;
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

/* =========================================================
   INITIALIZE HOMEPAGE
========================================================= */

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

      fetchVivamax()
    ]);

    fullDataCache = {

      movies,

      tv: tvShows,

      anime,

      tagalog: tagalogMovies,

      kdrama: kDramas,

      vivamax: vivamaxMovies
    };

    /* Banner */

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

    /* Titles */

    const movieRowH2 =
      document.querySelector(
        '#movies-row h2'
      );

    if (movieRowH2) {
      movieRowH2.textContent =
        'Trending Movies';
    }

    /* Homepage previews */

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

    displayList(
      vivamaxMovies,
      'vivamax-list',
      'movie'
    );

    /* Local storage rows */

    renderWatchlistRow();

    renderContinueWatchingRow();

  } catch (error) {

    console.error(
      'Initialization error:',
      error
    );
  }
}

/* =========================================================
   EVENT LISTENERS
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    const gridModal =
      document.getElementById(
        'grid-modal'
      );

    if (gridModal) {

      gridModal.addEventListener(
        'scroll',
        handleGridScroll,
        {
          passive: true
        }
      );
    }

    init();
  }
);