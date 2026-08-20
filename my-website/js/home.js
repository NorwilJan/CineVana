const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%23222"><rect width="100%" height="100%"/></svg>';

let currentItem;
let bannerItem;
let currentSeason = 1;
let currentEpisode = 1;
let searchTimeout;
let showDetailsCache = {};

let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  vivamax: [],
  koreanErotica: [],
  kdrama: []
};


/* =========================================================
   TMDB FETCH HELPERS
========================================================= */

async function fetchMultiplePages(endpoint, maxPages = 3) {
  let allResults = [];

  try {
    for (let page = 1; page <= maxPages; page++) {

      const separator = endpoint.includes('?') ? '&' : '?';

      const res = await fetch(
        `${BASE_URL}${endpoint}${separator}page=${page}&api_key=${API_KEY}`
      );

      if (!res.ok) continue;

      const data = await res.json();

      if (data.results) {
        allResults = allResults.concat(data.results);
      }
    }
  } catch (error) {
    console.error("Error fetching multiple pages:", error);
  }

  return allResults;
}


async function fetchTrending(type) {
  return await fetchMultiplePages(`/trending/${type}/week?`, 3);
}


/* =========================================================
   ANIME
========================================================= */

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
    console.error("Error fetching anime:", error);
  }

  return allResults;
}


/* =========================================================
   TAGALOG
========================================================= */

async function fetchTagalogContent() {

  return await fetchMultiplePages(
    `/discover/movie?with_original_language=tl&sort_by=popularity.desc`,
    3
  );
}


/* =========================================================
   K-DRAMAS
========================================================= */

async function fetchKDramas() {

  return await fetchMultiplePages(
    `/discover/tv?with_original_language=ko&sort_by=popularity.desc`,
    3
  );
}


/* =========================================================
   VIVAMAX
   TMDB company ID: 149142
========================================================= */

async function fetchVivamaxMovies() {

  const results = await fetchMultiplePages(
    `/discover/movie?with_companies=149142&sort_by=popularity.desc&include_adult=true`,
    5
  );

  const unique = [];
  const seen = new Set();

  results.forEach(movie => {

    if (
      movie &&
      movie.poster_path &&
      !seen.has(movie.id)
    ) {

      seen.add(movie.id);
      unique.push(movie);
    }

  });

  return unique;
}


/* =========================================================
   TMDB KEYWORD SEARCH
========================================================= */

async function searchTMDBKeyword(keyword) {

  try {

    const res = await fetch(
      `${BASE_URL}/search/keyword?api_key=${API_KEY}&query=${encodeURIComponent(keyword)}`
    );

    if (!res.ok) return null;

    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return null;
    }

    const exactMatch = data.results.find(
      item =>
        item.name &&
        item.name.toLowerCase() === keyword.toLowerCase()
    );

    return exactMatch
      ? exactMatch.id
      : data.results[0].id;

  } catch (error) {

    console.error(
      `Error finding TMDB keyword "${keyword}":`,
      error
    );

    return null;
  }
}


/* =========================================================
   KOREAN EROTICA
========================================================= */

async function fetchKoreanErotica() {

  try {

    const keywords = [
      'softcore',
      'erotic movie',
      'eroticism',
      'erotic'
    ];

    const keywordIds = await Promise.all(
      keywords.map(keyword => searchTMDBKeyword(keyword))
    );

    const validKeywordIds = keywordIds
      .filter(Boolean)
      .join('|');

    if (!validKeywordIds) {
      console.warn("No Korean erotica keywords found.");
      return [];
    }

    const results = await fetchMultiplePages(
      `/discover/movie?with_original_language=ko&with_keywords=${validKeywordIds}&sort_by=popularity.desc&include_adult=true`,
      5
    );

    const unique = [];
    const seen = new Set();

    results.forEach(movie => {

      if (
        movie &&
        movie.original_language === 'ko' &&
        movie.poster_path &&
        !seen.has(movie.id)
      ) {

        seen.add(movie.id);
        unique.push(movie);
      }

    });

    return unique;

  } catch (error) {

    console.error(
      "Error fetching Korean erotica:",
      error
    );

    return [];
  }
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
      `url(${IMG_URL}${item.backdrop_path})`;
  }

  if (titleEl) {
    titleEl.textContent = item.title || item.name;
  }
}


function playBanner() {

  if (bannerItem) {
    showDetails(bannerItem);
  }
}


/* =========================================================
   DISPLAY LIST
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
    img.alt = item.title || item.name;
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

  currentItem = item;

  let continueList = getContinueWatching();

  let savedProgress = continueList.find(
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

  document.getElementById('modal-title').textContent =
    item.title || item.name;

  document.getElementById('modal-description').textContent =
    item.overview || 'No description available.';

  const imgEl =
    document.getElementById('modal-image');

  imgEl.src =
    `${IMG_URL}${item.poster_path}`;

  imgEl.onerror = () => {
    imgEl.src = PLACEHOLDER_IMG;
  };

  document.getElementById('modal-rating').innerHTML =
    item.vote_average
      ? '★'.repeat(
          Math.round(item.vote_average / 2)
        )
      : '';

  updateWatchlistButton();

  saveCurrentProgress();

  const isTv =
    currentItem.media_type === "tv" ||
    !currentItem.title;

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

  document
    .getElementById('modal')
    .classList.add('active');

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
      "Error loading TV seasons:",
      error
    );
  }
}


/* =========================================================
   EPISODES
========================================================= */

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

      if (
        !currentEpisode ||
        currentSeason !== seasonNumber
      ) {
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
      "Error loading episodes:",
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


/* =========================================================
   VIDEO
========================================================= */

function loadVideo() {

  if (!currentItem) return;

  const isTv =
    currentItem.media_type === "tv" ||
    !currentItem.title;

  let embedURL;

  if (isTv) {

    embedURL =
      `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;

  } else {

    embedURL =
      `https://player.videasy.net/movie/${currentItem.id}`;
  }

  document.getElementById(
    'modal-video'
  ).src = embedURL;
}


/* =========================================================
   CLOSE MODAL
========================================================= */

function closeModal() {

  document
    .getElementById('modal')
    .classList.remove('active');

  document.getElementById(
    'modal-video'
  ).src = 'about:blank';

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

  const list = getWatchlist();

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

  let existingIndex =
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

    vivamax:
      document.getElementById(
        'vivamax-row'
      ),

    koreanErotica:
      document.getElementById(
        'korean-erotica-row'
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

  Object.values(rows).forEach(row => {

    if (row) {
      row.style.display = 'none';
    }

  });


  /* ALL */

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
      rows.movies.style.display = 'block';

    if (rows.tv)
      rows.tv.style.display = 'block';

    if (rows.anime)
      rows.anime.style.display = 'block';

    if (rows.tagalog)
      rows.tagalog.style.display = 'block';

    if (rows.vivamax)
      rows.vivamax.style.display = 'block';

    if (rows.koreanErotica)
      rows.koreanErotica.style.display = 'block';

    if (rows.kdrama)
      rows.kdrama.style.display = 'block';
  }


  /* MOVIES */

  else if (category === 'movie') {

    if (rows.movies)
      rows.movies.style.display = 'block';

    if (rows.tagalog)
      rows.tagalog.style.display = 'block';

    if (rows.vivamax)
      rows.vivamax.style.display = 'block';

    if (rows.koreanErotica)
      rows.koreanErotica.style.display = 'block';
  }


  /* TV */

  else if (category === 'tv') {

    if (rows.tv)
      rows.tv.style.display = 'block';

    if (rows.kdrama)
      rows.kdrama.style.display = 'block';
  }


  /* ANIME */

  else if (category === 'anime') {

    if (rows.anime)
      rows.anime.style.display = 'block';
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
    'vivamax-row',
    'korean-erotica-row',
    'kdrama-row'
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


async function fetchByGenreId(
  genreId
) {

  return await fetchMultiplePages(
    `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`,
    3
  );
}


/* =========================================================
   SEE ALL GRID
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

    vivamax:
      '🔥 Trending Vivamax Movies',

    koreanErotica:
      '🇰🇷 Trending Korean Erotica',

    kdrama:
      'Trending K-Dramas'
  };

  if (titleEl) {

    titleEl.textContent =
      titles[category] || 'Category';
  }

  (
    fullDataCache[category] || []
  ).forEach(item => {

    if (!item.poster_path) return;

    const img =
      document.createElement('img');

    img.src =
      `${IMG_URL}${item.poster_path}`;

    img.alt =
      item.title || item.name;

    img.loading = 'lazy';

    img.onerror = () => {

      img.src =
        PLACEHOLDER_IMG;
    };

    img.onclick = () => {

      closeGridModal();

      showDetails(item);
    };

    container.appendChild(img);
  });

  modal.classList.add('active');

  document.body.classList.add(
    'modal-open'
  );
}


function closeGridModal() {

  document
    .getElementById('grid-modal')
    .classList.remove('active');

  document.body.classList.remove(
    'modal-open'
  );
}


/* =========================================================
   SEARCH
========================================================= */

function openSearchModal() {

  document
    .getElementById('search-modal')
    .classList.add('active');

  document
    .getElementById('search-input')
    .focus();
}


function closeSearchModal() {

  document
    .getElementById('search-modal')
    .classList.remove('active');

  document.getElementById(
    'search-results'
  ).innerHTML = '';

  document.getElementById(
    'search-input'
  ).value = '';
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

  try {

    const res = await fetch(
      `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=true`
    );

    if (!res.ok) return;

    const data =
      await res.json();

    container.innerHTML = '';

    data.results.forEach(item => {

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
        item.title || item.name;

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
      "Search error:",
      error
    );
  }
}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    const [
      movies,
      tvShows,
      anime,
      tagalogMovies,
      vivamaxMovies,
      koreanErotica,
      kDramas
    ] = await Promise.all([

      fetchTrending('movie'),

      fetchTrending('tv'),

      fetchTrendingAnime(),

      fetchTagalogContent(),

      fetchVivamaxMovies(),

      fetchKoreanErotica(),

      fetchKDramas()
    ]);


    fullDataCache = {

      movies,

      tv: tvShows,

      anime,

      tagalog: tagalogMovies,

      vivamax: vivamaxMovies,

      koreanErotica,

      kdrama: kDramas
    };


    /* BANNER */

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


    /* TITLES */

    const movieRowH2 =
      document.querySelector(
        '#movies-row h2'
      );

    if (movieRowH2) {

      movieRowH2.textContent =
        'Trending Movies';
    }


    /* LISTS */

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
      vivamaxMovies,
      'vivamax-list',
      'movie'
    );

    displayList(
      koreanErotica,
      'korean-erotica-list',
      'movie'
    );

    displayList(
      kDramas,
      'kdrama-list',
      'tv'
    );


    /* LOCAL STORAGE ROWS */

    renderWatchlistRow();

    renderContinueWatchingRow();

  } catch (error) {

    console.error(
      "Initialization error:",
      error
    );
  }
}


init();