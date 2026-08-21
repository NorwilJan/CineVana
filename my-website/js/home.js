const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';

/*
 * =========================================================
 * STREAMVAULT — HOME.JS
 * Production-focused version
 *
 * Features:
 * - Trending Movies
 * - Trending TV
 * - Anime
 * - Tagalog Movies
 * - Tagalog TV
 * - K-Dramas
 * - Top Rated Vivamax
 * - Search
 * - Watchlist
 * - Continue Watching
 * - Genre filtering
 * - Infinite "See All"
 * - TV seasons / episodes
 * - Videasy player
 * - Request caching
 * - Duplicate prevention
 * - Better loading/error handling
 * =========================================================
 */


/*
 * =========================================================
 * IMAGE CONFIG
 * =========================================================
 */

const POSTER_URL =
  'https://image.tmdb.org/t/p/w342';

const MODAL_POSTER_URL =
  'https://image.tmdb.org/t/p/w500';

const BACKDROP_URL =
  'https://image.tmdb.org/t/p/original';


const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' +
  '<svg xmlns="http://www.w3.org/2000/svg" ' +
  'width="130" height="195" fill="%23222222">' +
  '<rect width="100%" height="100%"/>' +
  '</svg>';


/*
 * =========================================================
 * CONSTANTS
 * =========================================================
 */

const VIVAMAX_COMPANY_ID = 149142;

const MAX_ROW_ITEMS = 20;

const MAX_CONTINUE_ITEMS = 15;

const SEARCH_DELAY = 350;

const REQUEST_TIMEOUT = 15000;


/*
 * =========================================================
 * APPLICATION STATE
 * =========================================================
 */

let currentItem = null;

let bannerItem = null;

let currentSeason = 1;

let currentEpisode = 1;

let searchTimeout = null;

let searchRequestId = 0;


/*
 * =========================================================
 * DATA CACHE
 * =========================================================
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
 * =========================================================
 * API CACHE
 *
 * Keeps successful API responses in memory so the same
 * request isn't repeatedly downloaded during one session.
 * =========================================================
 */

const apiCache = new Map();


/*
 * =========================================================
 * DETAIL CACHE
 * =========================================================
 */

const showDetailsCache = {};

const episodeCache = {};


/*
 * =========================================================
 * SEE ALL STATE
 * =========================================================
 */

let gridCategory = null;

let gridPage = 1;

let gridLoading = false;

let gridHasMore = true;

let gridScrollPosition = 0;

let openedFromGrid = false;


/*
 * Prevent duplicate grid requests.
 */

const gridPageCache = {};


/*
 * =========================================================
 * UTILITY
 * =========================================================
 */

function sleep(ms) {

  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}


function normalizeText(value) {

  return String(value || '')
    .trim()
    .toLowerCase();

}


function getItemTitle(item) {

  if (!item) {
    return '';
  }

  return (
    item.title ||
    item.name ||
    item.original_title ||
    item.original_name ||
    ''
  );

}


function getMediaType(item, fallback = 'movie') {

  if (!item) {
    return fallback;
  }

  if (item.media_type === 'movie') {
    return 'movie';
  }

  if (item.media_type === 'tv') {
    return 'tv';
  }

  if (item.title || item.original_title) {
    return 'movie';
  }

  if (item.name || item.original_name) {
    return 'tv';
  }

  return fallback;

}


function prepareItem(item, mediaType) {

  if (!item) {
    return null;
  }

  if (!item.media_type) {
    item.media_type = getMediaType(
      item,
      mediaType
    );
  }

  return item;

}


/*
 * =========================================================
 * IMAGE HELPERS
 * =========================================================
 */

function getPosterUrl(path, size = 'normal') {

  if (!path) {
    return PLACEHOLDER_IMG;
  }

  if (size === 'modal') {
    return `${MODAL_POSTER_URL}${path}`;
  }

  return `${POSTER_URL}${path}`;

}


function getBackdropUrl(path) {

  if (!path) {
    return '';
  }

  return `${BACKDROP_URL}${path}`;

}


/*
 * =========================================================
 * FETCH HELPER
 * =========================================================
 */

async function tmdbFetch(
  endpoint,
  params = {},
  options = {}
) {

  const {

    cache = true,

    cacheTime = 5 * 60 * 1000

  } = options;


  const url =
    new URL(
      `${BASE_URL}${endpoint}`
    );


  url.searchParams.set(
    'api_key',
    API_KEY
  );


  Object.entries(params).forEach(
    ([key, value]) => {

      if (
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {

        url.searchParams.set(
          key,
          value
        );

      }

    }
  );


  const cacheKey =
    url.toString();


  if (cache) {

    const cached =
      apiCache.get(cacheKey);

    if (
      cached &&
      Date.now() - cached.timestamp <
        cacheTime
    ) {

      return cached.data;

    }

  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT
    );


  try {

    const response =
      await fetch(
        url.toString(),
        {
          signal:
            controller.signal
        }
      );


    clearTimeout(timeout);


    if (!response.ok) {

      console.error(
        `TMDB error ${response.status}:`,
        endpoint
      );

      return null;

    }


    const data =
      await response.json();


    if (cache && data) {

      apiCache.set(
        cacheKey,
        {
          data,
          timestamp: Date.now()
        }
      );

    }


    return data;

  } catch (error) {

    clearTimeout(timeout);


    if (
      error &&
      error.name === 'AbortError'
    ) {

      console.error(
        'TMDB request timed out:',
        endpoint
      );

    } else {

      console.error(
        'TMDB request error:',
        error
      );

    }


    return null;

  }

}


/*
 * =========================================================
 * FETCH MULTIPLE PAGES
 * =========================================================
 */

async function fetchMultiplePages(
  endpoint,
  maxPages = 1,
  params = {}
) {

  const allResults = [];


  for (
    let page = 1;
    page <= maxPages;
    page++
  ) {

    const data =
      await tmdbFetch(
        endpoint,
        {
          ...params,
          page
        }
      );


    if (
      data &&
      Array.isArray(data.results)
    ) {

      allResults.push(
        ...data.results
      );

    }

  }


  return allResults;

}


/*
 * =========================================================
 * UNIQUE ITEMS
 * =========================================================
 */

function uniqueItems(
  items = [],
  mediaType = null
) {

  const seen = new Set();

  const result = [];


  items.forEach(
    item => {

      if (!item || !item.id) {
        return;
      }


      prepareItem(
        item,
        mediaType
      );


      const type =
        getMediaType(
          item,
          mediaType || 'movie'
        );


      const key =
        `${type}_${item.id}`;


      if (seen.has(key)) {
        return;
      }


      seen.add(key);

      result.push(item);

    }
  );


  return result;

}


/*
 * =========================================================
 * REMOVE DUPLICATES BY TITLE
 * =========================================================
 */

function uniqueByTitle(items = []) {

  const seen = new Set();

  return items.filter(
    item => {

      const title =
        normalizeText(
          getItemTitle(item)
        );


      if (!title) {
        return true;
      }


      if (seen.has(title)) {
        return false;
      }


      seen.add(title);

      return true;

    }
  );

}


/*
 * =========================================================
 * TRENDING
 * =========================================================
 */

async function fetchTrending(type) {

  const data =
    await tmdbFetch(
      `/trending/${type}/week`,
      {
        page: 1
      }
    );


  if (
    !data ||
    !Array.isArray(data.results)
  ) {

    return [];

  }


  return uniqueItems(
    data.results,
    type
  );

}


/*
 * =========================================================
 * ANIME
 *
 * Japanese + Animation
 * =========================================================
 */

async function fetchTrendingAnime() {

  const data =
    await tmdbFetch(
      '/discover/tv',
      {

        with_original_language:
          'ja',

        with_genres:
          16,

        sort_by:
          'popularity.desc',

        page: 1

      }
    );


  if (
    !data ||
    !Array.isArray(data.results)
  ) {

    return [];

  }


  data.results.forEach(
    item => {

      item.media_type = 'tv';

    }
  );


  return uniqueItems(
    data.results,
    'tv'
  );

}


/*
 * =========================================================
 * TAGALOG MOVIES
 * =========================================================
 */

async function fetchTagalog() {

  const data =
    await tmdbFetch(
      '/discover/movie',
      {

        with_original_language:
          'tl',

        sort_by:
          'popularity.desc',

        page: 1

      }
    );


  if (
    !data ||
    !Array.isArray(data.results)
  ) {

    return [];

  }


  return uniqueItems(
    data.results,
    'movie'
  );

}


/*
 * =========================================================
 * TAGALOG TV
 * =========================================================
 */

async function fetchTagalogTV() {

  const data =
    await tmdbFetch(
      '/discover/tv',
      {

        with_original_language:
          'tl',

        sort_by:
          'popularity.desc',

        page: 1

      }
    );


  if (
    !data ||
    !Array.isArray(data.results)
  ) {

    return [];

  }


  data.results.forEach(
    item => {

      item.media_type = 'tv';

    }
  );


  return uniqueItems(
    data.results,
    'tv'
  );

}


/*
 * =========================================================
 * K-DRAMA
 * =========================================================
 */

async function fetchKDramas() {

  const data =
    await tmdbFetch(
      '/discover/tv',
      {

        with_original_language:
          'ko',

        sort_by:
          'popularity.desc',

        page: 1

      }
    );


  if (
    !data ||
    !Array.isArray(data.results)
  ) {

    return [];

  }


  data.results.forEach(
    item => {

      item.media_type = 'tv';

    }
  );


  return uniqueItems(
    data.results,
    'tv'
  );

}


/*
 * =========================================================
 * GENRE
 * =========================================================
 */

async function fetchByGenreId(
  genreId,
  page = 1
) {

  const data =
    await tmdbFetch(
      '/discover/movie',
      {

        with_genres:
          genreId,

        sort_by:
          'popularity.desc',

        page

      }
    );


  if (
    !data ||
    !Array.isArray(data.results)
  ) {

    return [];

  }


  return uniqueItems(
    data.results,
    'movie'
  );

}


/*
 * =========================================================
 * VIVAMAX
 * =========================================================
 */

async function fetchVivamax(
  page = 1
) {

  const cacheKey =
    `vivamax_${page}`;


  if (
    gridPageCache[cacheKey]
  ) {

    return gridPageCache[
      cacheKey
    ];

  }


  const data =
    await tmdbFetch(
      '/discover/movie',
      {

        with_companies:
          VIVAMAX_COMPANY_ID,

        sort_by:
          'vote_average.desc',

        'vote_count.gte':
          5,

        include_adult:
          true,

        page

      }
    );


  const result =
    data || {

      results: [],

      total_pages: 0

    };


  if (
    Array.isArray(
      result.results
    )
  ) {

    result.results =
      uniqueItems(
        result.results,
        'movie'
      );

  }


  gridPageCache[
    cacheKey
  ] = result;


  return result;

}


/*
 * =========================================================
 * BANNER
 * =========================================================
 */

function displayBanner(item) {

  if (
    !item ||
    !item.backdrop_path
  ) {

    return;

  }


  bannerItem =
    prepareItem(
      item,
      'movie'
    );


  const bannerEl =
    document.getElementById(
      'banner'
    );


  const titleEl =
    document.getElementById(
      'banner-title'
    );


  if (bannerEl) {

    const backdrop =
      getBackdropUrl(
        item.backdrop_path
      );


    bannerEl.style.backgroundImage =
      `linear-gradient(to top, #111 10%, rgba(17,17,17,0.4) 60%, rgba(17,17,17,0.8)), url("${backdrop}")`;

  }


  if (titleEl) {

    titleEl.textContent =
      getItemTitle(item);

  }

}


/*
 * =========================================================
 * BANNER PLAY
 * =========================================================
 */

function playBanner() {

  if (!bannerItem) {
    return;
  }


  openedFromGrid = false;


  showDetails(
    bannerItem
  );

}


/*
 * =========================================================
 * DISPLAY LIST
 * =========================================================
 */

function displayList(
  items,
  containerId,
  mediaType
) {

  const container =
    document.getElementById(
      containerId
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    '';


  const cleaned =
    uniqueItems(
      items || [],
      mediaType
    );


  const limitedItems =
    cleaned
      .filter(
        item =>
          item &&
          item.poster_path
      )
      .slice(
        0,
        MAX_ROW_ITEMS
      );


  limitedItems.forEach(
    item => {

      const img =
        document.createElement(
          'img'
        );


      img.src =
        getPosterUrl(
          item.poster_path
        );


      img.alt =
        getItemTitle(item);


      img.loading =
        'lazy';


      img.decoding =
        'async';


      img.onerror = () => {

        img.onerror = null;

        img.src =
          PLACEHOLDER_IMG;

      };


      img.onclick = () => {

        openedFromGrid =
          false;

        showDetails(
          item
        );

      };


      container.appendChild(
        img
      );

    }
  );

}


/*
 * =========================================================
 * SHOW DETAILS
 * =========================================================
 */

async function showDetails(item) {

  if (!item || !item.id) {
    return;
  }


  currentItem =
    prepareItem(
      item,
      getMediaType(
        item,
        'movie'
      )
    );


  const continueList =
    getContinueWatching();


  const savedProgress =
    continueList.find(
      i =>
        i.id === item.id &&
        getMediaType(i) ===
          getMediaType(item)
    );


  currentSeason =
    savedProgress
      ? (
          savedProgress.savedSeason ||
          1
        )
      : 1;


  currentEpisode =
    savedProgress
      ? (
          savedProgress.savedEpisode ||
          1
        )
      : 1;


  const title =
    document.getElementById(
      'modal-title'
    );


  const description =
    document.getElementById(
      'modal-description'
    );


  const image =
    document.getElementById(
      'modal-image'
    );


  const rating =
    document.getElementById(
      'modal-rating'
    );


  if (title) {

    title.textContent =
      getItemTitle(item);

  }


  if (description) {

    description.textContent =
      item.overview ||
      'No description available.';

  }


  if (image) {

    image.src =
      getPosterUrl(
        item.poster_path,
        'modal'
      );


    image.onerror = () => {

      image.onerror = null;

      image.src =
        PLACEHOLDER_IMG;

    };

  }


  if (rating) {

    const numericRating =
      Number(
        item.vote_average
      ) || 0;


    const stars =
      Math.max(
        0,
        Math.min(
          5,
          Math.round(
            numericRating / 2
          )
        )
      );


    rating.innerHTML =
      stars > 0
        ? '★'.repeat(stars)
        : '';


  }


  updateWatchlistButton();


  const isTv =
    getMediaType(
      item
    ) === 'tv';


  const seriesOptions =
    document.getElementById(
      'series-options'
    );


  if (seriesOptions) {

    seriesOptions.style.display =
      isTv
        ? 'flex'
        : 'none';

  }


  const modal =
    document.getElementById(
      'modal'
    );


  if (modal) {

    modal.classList.add(
      'active'
    );

    document.body.classList.add(
      'modal-open'
    );

  }


  if (isTv) {

    await loadTVSeasons(
      item.id,
      currentSeason,
      currentEpisode
    );

  } else {

    requestAnimationFrame(
      () => {

        loadVideo();

      }
    );

  }


  saveCurrentProgress();

}


/*
 * =========================================================
 * VIDEO
 * =========================================================
 */

function loadVideo() {

  if (!currentItem) {
    return;
  }


  const iframe =
    document.getElementById(
      'modal-video'
    );


  if (!iframe) {
    return;
  }


  const isTv =
    getMediaType(
      currentItem
    ) === 'tv';


  let embedURL;


  if (isTv) {

    embedURL =
      `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;

  } else {

    embedURL =
      `https://player.videasy.net/movie/${currentItem.id}`;

  }


  if (
    iframe.src === embedURL
  ) {

    return;

  }


  iframe.src =
    embedURL;

}


/*
 * =========================================================
 * TV SEASONS
 * =========================================================
 */

async function loadTVSeasons(
  tvId,
  targetSeason = 1,
  targetEpisode = 1
) {

  const seasonSelect =
    document.getElementById(
      'season-select'
    );


  if (!seasonSelect) {
    return;
  }


  seasonSelect.innerHTML =
    '';


  try {

    let data =
      showDetailsCache[
        tvId
      ];


    if (!data) {

      data =
        await tmdbFetch(
          `/tv/${tvId}`
        );


      if (data) {

        showDetailsCache[
          tvId
        ] = data;

      }

    }


    if (
      data &&
      Array.isArray(
        data.seasons
      )
    ) {

      data.seasons.forEach(
        season => {

          if (
            Number(
              season.season_number
            ) <= 0
          ) {

            return;

          }


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
            Number(
              season.season_number
            ) ===
            Number(
              targetSeason
            )
          ) {

            option.selected =
              true;

          }


          seasonSelect.appendChild(
            option
          );

        }
      );

    }


    const availableSeason =
      Array.from(
        seasonSelect.options
      ).some(
        option =>
          Number(option.value) ===
          Number(targetSeason)
      );


    if (
      !availableSeason &&
      seasonSelect.options.length
    ) {

      targetSeason =
        Number(
          seasonSelect.options[0].value
        );

      currentEpisode = 1;

    }


    currentSeason =
      Number(
        targetSeason
      ) || 1;


    currentEpisode =
      Number(
        targetEpisode
      ) || 1;


    await loadEpisodes(
      tvId,
      currentSeason
    );


  } catch (error) {

    console.error(
      'Error loading TV seasons:',
      error
    );

  }

}


/*
 * =========================================================
 * EPISODES
 * =========================================================
 */

async function loadEpisodes(
  tvId,
  seasonNumber
) {

  const previousSeason =
    currentSeason;


  currentSeason =
    Number(
      seasonNumber
    ) || 1;


  const episodesContainer =
    document.getElementById(
      'episodes-container'
    );


  if (!episodesContainer) {
    return;
  }


  episodesContainer.innerHTML =
    '';


  const cacheKey =
    `${tvId}_${currentSeason}`;


  try {

    let data =
      episodeCache[
        cacheKey
      ];


    if (!data) {

      data =
        await tmdbFetch(
          `/tv/${tvId}/season/${currentSeason}`
        );


      if (data) {

        episodeCache[
          cacheKey
        ] = data;

      }

    }


    if (
      data &&
      Array.isArray(
        data.episodes
      ) &&
      data.episodes.length > 0
    ) {

      const episodeNumbers =
        data.episodes.map(
          ep =>
            Number(
              ep.episode_number
            )
        );


      const episodeStillExists =
        episodeNumbers.includes(
          Number(
            currentEpisode
          )
        );


      if (
        previousSeason !==
          currentSeason ||
        !episodeStillExists
      ) {

        currentEpisode =
          episodeNumbers[0];

      }


      data.episodes.forEach(
        ep => {

          const episodeNumber =
            Number(
              ep.episode_number
            );


          const btn =
            document.createElement(
              'button'
            );


          btn.className =
            `episode-btn ${
              episodeNumber ===
              Number(
                currentEpisode
              )
                ? 'active'
                : ''
            }`;


          btn.textContent =
            `Ep ${episodeNumber}`;


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
              episodeNumber;


            loadVideo();


            saveCurrentProgress();

          };


          episodesContainer.appendChild(
            btn
          );

        }
      );

    }


    loadVideo();


  } catch (error) {

    console.error(
      'Error loading episodes:',
      error
    );

  }

}


/*
 * =========================================================
 * SEASON CHANGE
 * =========================================================
 */

function onSeasonChange() {

  if (!currentItem) {
    return;
  }


  const select =
    document.getElementById(
      'season-select'
    );


  if (!select) {
    return;
  }


  currentEpisode =
    1;


  currentSeason =
    Number(
      select.value
    ) || 1;


  loadEpisodes(
    currentItem.id,
    currentSeason
  );

}


/*
 * =========================================================
 * CLOSE DETAILS MODAL
 * =========================================================
 */

function closeModal() {

  const iframe =
    document.getElementById(
      'modal-video'
    );


  if (iframe) {

    iframe.src =
      'about:blank';

  }


  const modal =
    document.getElementById(
      'modal'
    );


  if (modal) {

    modal.classList.remove(
      'active'
    );

  }


  document.body.classList.remove(
    'modal-open'
  );


  if (openedFromGrid) {

    const gridModal =
      document.getElementById(
        'grid-modal'
      );


    if (gridModal) {

      gridModal.classList.add(
        'active'
      );


      document.body.classList.add(
        'modal-open'
      );


      requestAnimationFrame(
        () => {

          const scrollArea =
            getGridScrollArea();


          if (scrollArea) {

            scrollArea.scrollTop =
              gridScrollPosition;

          }

        }
      );

    }

  }

}


/*
 * =========================================================
 * WATCHLIST
 * =========================================================
 */

function getWatchlist() {

  try {

    const data =
      JSON.parse(
        localStorage.getItem(
          'myList'
        )
      );


    return Array.isArray(data)
      ? data
      : [];

  } catch {

    return [];

  }

}


/*
 * =========================================================
 * WATCHLIST CHECK
 * =========================================================
 */

function isItemInWatchlist(id) {

  if (!id) {
    return false;
  }


  return getWatchlist()
    .some(
      item =>
        item.id === id
    );

}


/*
 * =========================================================
 * TOGGLE WATCHLIST
 * =========================================================
 */

function toggleWatchlist() {

  if (!currentItem) {
    return;
  }


  const list =
    getWatchlist();


  const index =
    list.findIndex(
      item =>
        item.id ===
          currentItem.id &&
        getMediaType(item) ===
          getMediaType(currentItem)
    );


  if (index > -1) {

    list.splice(
      index,
      1
    );

  } else {

    list.unshift(
      currentItem
    );

  }


  localStorage.setItem(
    'myList',
    JSON.stringify(list)
  );


  updateWatchlistButton();


  renderWatchlistRow();

}


/*
 * =========================================================
 * UPDATE WATCHLIST BUTTON
 * =========================================================
 */

function updateWatchlistButton() {

  const btn =
    document.getElementById(
      'watchlist-btn'
    );


  if (
    !btn ||
    !currentItem
  ) {

    return;

  }


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


/*
 * =========================================================
 * RENDER WATCHLIST
 * =========================================================
 */

function renderWatchlistRow() {

  const list =
    getWatchlist();


  const row =
    document.getElementById(
      'watchlist-row'
    );


  if (!row) {
    return;
  }


  row.style.display =
    list.length
      ? 'block'
      : 'none';


  if (list.length) {

    displayList(
      list,
      'watchlist-list',
      'movie'
    );

  }

}


/*
 * =========================================================
 * CONTINUE WATCHING
 * =========================================================
 */

function getContinueWatching() {

  try {

    const data =
      JSON.parse(
        localStorage.getItem(
          'continueWatching'
        )
      );


    return Array.isArray(data)
      ? data
      : [];

  } catch {

    return [];

  }

}


/*
 * =========================================================
 * SAVE CURRENT PROGRESS
 * =========================================================
 */

function saveCurrentProgress() {

  if (
    !currentItem ||
    !currentItem.id
  ) {

    return;

  }


  let list =
    getContinueWatching();


  const currentType =
    getMediaType(
      currentItem
    );


  const existingIndex =
    list.findIndex(
      item =>
        item.id ===
          currentItem.id &&
        getMediaType(item) ===
          currentType
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


  if (
    existingIndex > -1
  ) {

    list.splice(
      existingIndex,
      1
    );

  }


  list.unshift(
    itemData
  );


  if (
    list.length >
    MAX_CONTINUE_ITEMS
  ) {

    list =
      list.slice(
        0,
        MAX_CONTINUE_ITEMS
      );

  }


  localStorage.setItem(
    'continueWatching',
    JSON.stringify(list)
  );


  renderContinueWatchingRow();

}


/*
 * =========================================================
 * RENDER CONTINUE WATCHING
 * =========================================================
 */

function renderContinueWatchingRow() {

  const list =
    getContinueWatching();


  const row =
    document.getElementById(
      'continue-row'
    );


  if (!row) {
    return;
  }


  row.style.display =
    list.length
      ? 'block'
      : 'none';


  if (list.length) {

    displayList(
      list,
      'continue-list',
      'movie'
    );

  }

}


/*
 * =========================================================
 * CATEGORY FILTER
 * =========================================================
 */

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


  if (eventElement) {

    eventElement.classList.add(
      'active'
    );

  }


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

    tagalogTV:
      document.getElementById(
        'tagalog-tv-row'
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


  Object.values(rows)
    .forEach(
      row => {

        if (row) {

          row.style.display =
            'none';

        }

      }
    );


  if (
    category ===
    'all'
  ) {

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


    [
      'movies',
      'tv',
      'anime',
      'tagalog',
      'tagalogTV',
      'kdrama',
      'vivamax'
    ].forEach(
      key => {

        if (rows[key]) {

          rows[key].style.display =
            'block';

        }

      }
    );


  } else if (
    category ===
    'movie'
  ) {

    [
      'movies',
      'tagalog',
      'vivamax'
    ].forEach(
      key => {

        if (rows[key]) {

          rows[key].style.display =
            'block';

        }

      }
    );


  } else if (
    category ===
    'tv'
  ) {

    [
      'tv',
      'tagalogTV',
      'kdrama'
    ].forEach(
      key => {

        if (rows[key]) {

          rows[key].style.display =
            'block';

        }

      }
    );


  } else if (
    category ===
    'anime'
  ) {

    if (rows.anime) {

      rows.anime.style.display =
        'block';

    }

  }

}


/*
 * =========================================================
 * GENRE FILTER
 * =========================================================
 */

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


  if (eventElement) {

    eventElement.classList.add(
      'active'
    );

  }


  if (
    genreId ===
    'all'
  ) {

    restoreAllRows();

    return;

  }


  const moviesRow =
    document.getElementById(
      'movies-row'
    );


  if (moviesRow) {

    const heading =
      moviesRow.querySelector(
        'h2'
      );


    if (heading) {

      heading.textContent =
        `${
          eventElement
            ? eventElement.textContent
            : 'Genre'
        } Movies`;

    }

  }


  const genreResults =
    await fetchByGenreId(
      genreId,
      1
    );


  [
    'continue-row',
    'watchlist-row',
    'tvshows-row',
    'anime-row',
    'tagalog-row',
    'tagalog-tv-row',
    'kdrama-row',
    'vivamax-row'
  ].forEach(
    id => {

      const el =
        document.getElementById(
          id
        );


      if (el) {

        el.style.display =
          'none';

      }

    }
  );


  if (moviesRow) {

    moviesRow.style.display =
      'block';


    displayList(
      genreResults,
      'movies-list',
      'movie'
    );

  }

}


/*
 * =========================================================
 * RESTORE ALL
 * =========================================================
 */

function restoreAllRows() {

  const ids = [

    'movies-row',

    'tvshows-row',

    'anime-row',

    'tagalog-row',

    'tagalog-tv-row',

    'kdrama-row',

    'vivamax-row'

  ];


  ids.forEach(
    id => {

      const row =
        document.getElementById(
          id
        );


      if (row) {

        row.style.display =
          'block';

      }

    }
  );


  renderWatchlistRow();

  renderContinueWatchingRow();


  const movieRowH2 =
    document.querySelector(
      '#movies-row h2'
    );


  if (movieRowH2) {

    movieRowH2.textContent =
      'Trending Movies';

  }

}


/*
 * =========================================================
 * GRID SCROLL AREA
 * =========================================================
 */

function getGridScrollArea() {

  const custom =
    document.getElementById(
      'grid-scroll-area'
    );


  if (custom) {
    return custom;
  }


  return document.getElementById(
    'grid-modal'
  );

}


/*
 * =========================================================
 * OPEN GRID MODAL
 * =========================================================
 */

function openGridModal(
  category
) {

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


  if (
    !modal ||
    !container
  ) {

    return;

  }


  gridCategory =
    category;


  gridPage =
    1;


  gridLoading =
    false;


  gridHasMore =
    true;


  gridScrollPosition =
    0;


  openedFromGrid =
    true;


  const scrollArea =
    getGridScrollArea();


  if (scrollArea) {

    scrollArea.scrollTop =
      0;

  }


  const titles = {

    movies:
      'Trending Movies',

    tv:
      'Trending TV Shows',

    anime:
      'Trending Anime',

    tagalog:
      'Trending Tagalog Movies',

    tagalogTV:
      'Trending Tagalog TV Shows',

    kdrama:
      'Trending K-Dramas',

    vivamax:
      'Top Rated Vivamax'

  };


  if (titleEl) {

    titleEl.textContent =
      titles[category] ||
      'Category';

  }


  container.innerHTML =
    '';


  modal.classList.add(
    'active'
  );


  document.body.classList.add(
    'modal-open'
  );


  loadGridPage();

}


/*
 * =========================================================
 * GRID API
 * =========================================================
 */

async function fetchGridPage(
  category,
  page
) {

  const cacheKey =
    `grid_${category}_${page}`;


  if (
    gridPageCache[
      cacheKey
    ]
  ) {

    return gridPageCache[
      cacheKey
    ];

  }


  let data = null;


  switch (
    category
  ) {

    case 'movies':

      data =
        await tmdbFetch(
          '/trending/movie/week',
          {
            page
          }
        );

      break;


    case 'tv':

      data =
        await tmdbFetch(
          '/trending/tv/week',
          {
            page
          }
        );

      break;


    case 'anime':

      data =
        await tmdbFetch(
          '/discover/tv',
          {

            with_original_language:
              'ja',

            with_genres:
              16,

            sort_by:
              'popularity.desc',

            page

          }
        );


      if (
        data &&
        Array.isArray(
          data.results
        )
      ) {

        data.results.forEach(
          item => {

            item.media_type =
              'tv';

          }
        );

      }

      break;


    case 'tagalog':

      data =
        await tmdbFetch(
          '/discover/movie',
          {

            with_original_language:
              'tl',

            sort_by:
              'popularity.desc',

            page

          }
        );

      break;


    case 'tagalogTV':

      data =
        await tmdbFetch(
          '/discover/tv',
          {

            with_original_language:
              'tl',

            sort_by:
              'popularity.desc',

            page

          }
        );


      if (
        data &&
        Array.isArray(
          data.results
        )
      ) {

        data.results.forEach(
          item => {

            item.media_type =
              'tv';

          }
        );

      }

      break;


    case 'kdrama':

      data =
        await tmdbFetch(
          '/discover/tv',
          {

            with_original_language:
              'ko',

            sort_by:
              'popularity.desc',

            page

          }
        );


      if (
        data &&
        Array.isArray(
          data.results
        )
      ) {

        data.results.forEach(
          item => {

            item.media_type =
              'tv';

          }
        );

      }

      break;


    case 'vivamax':

      data =
        await fetchVivamax(
          page
        );

      break;


    default:

      data = {

        results: [],

        total_pages: 0

      };

  }


  if (!data) {

    data = {

      results: [],

      total_pages: 0

    };

  }


  if (
    Array.isArray(
      data.results
    )
  ) {

    const mediaType =
      (
        category === 'movies' ||
        category === 'tagalog' ||
        category === 'vivamax'
      )
        ? 'movie'
        : 'tv';


    data.results =
      uniqueItems(
        data.results,
        mediaType
      );

  }


  gridPageCache[
    cacheKey
  ] = data;


  return data;

}


/*
 * =========================================================
 * LOAD GRID PAGE
 * =========================================================
 */

async function loadGridPage() {

  if (
    gridLoading ||
    !gridHasMore ||
    !gridCategory
  ) {

    return;

  }


  gridLoading =
    true;


  const container =
    document.getElementById(
      'grid-modal-results'
    );


  if (!container) {

    gridLoading =
      false;

    return;

  }


  const loading =
    document.createElement(
      'div'
    );


  loading.className =
    'grid-loading';


  loading.textContent =
    'Loading...';


  loading.style.display =
    'flex';


  container.appendChild(
    loading
  );


  try {

    const data =
      await fetchGridPage(
        gridCategory,
        gridPage
      );


    loading.remove();


    const results =
      Array.isArray(
        data.results
      )
        ? data.results
        : [];


    if (
      results.length === 0
    ) {

      gridHasMore =
        false;


      showGridEnd();


      return;

    }


    const mediaType =
      (
        gridCategory === 'movies' ||
        gridCategory === 'tagalog' ||
        gridCategory === 'vivamax'
      )
        ? 'movie'
        : 'tv';


    results.forEach(
      item => {

        if (
          !item ||
          !item.poster_path
        ) {

          return;

        }


        item.media_type =
          mediaType;


        const img =
          document.createElement(
            'img'
          );


        img.src =
          getPosterUrl(
            item.poster_path
          );


        img.alt =
          getItemTitle(item);


        img.loading =
          'lazy';


        img.decoding =
          'async';


        img.onerror = () => {

          img.onerror = null;

          img.src =
            PLACEHOLDER_IMG;

        };


        img.onclick = () => {

          const scrollArea =
            getGridScrollArea();


          if (scrollArea) {

            gridScrollPosition =
              scrollArea.scrollTop;

          }


          const gridModal =
            document.getElementById(
              'grid-modal'
            );


          if (gridModal) {

            gridModal.classList.remove(
              'active'
            );

          }


          openedFromGrid =
            true;


          showDetails(
            item
          );

        };


        container.appendChild(
          img
        );

      }
    );


    const totalPages =
      Number(
        data.total_pages
      ) || 1;


    if (
      gridPage >=
      totalPages
    ) {

      gridHasMore =
        false;


      showGridEnd();

    } else {

      gridPage++;

    }


  } catch (error) {

    console.error(
      'Grid loading error:',
      error
    );


    loading.remove();


  } finally {

    gridLoading =
      false;

  }

}


/*
 * =========================================================
 * GRID END
 * =========================================================
 */

function showGridEnd() {

  const container =
    document.getElementById(
      'grid-modal-results'
    );


  if (!container) {
    return;
  }


  if (
    container.querySelector(
      '.grid-end'
    )
  ) {

    return;

  }


  const end =
    document.createElement(
      'div'
    );


  end.className =
    'grid-end';


  end.textContent =
    'You have reached the end.';


  container.appendChild(
    end
  );

}


/*
 * =========================================================
 * GRID SCROLL
 * =========================================================
 */

function handleGridScroll() {

  const scrollArea =
    getGridScrollArea();


  if (!scrollArea) {
    return;
  }


  const distanceFromBottom =
    scrollArea.scrollHeight -
    scrollArea.scrollTop -
    scrollArea.clientHeight;


  if (
    distanceFromBottom <
      700 &&
    !gridLoading &&
    gridHasMore
  ) {

    loadGridPage();

  }

}


/*
 * =========================================================
 * CLOSE GRID MODAL
 * =========================================================
 */

function closeGridModal() {

  const modal =
    document.getElementById(
      'grid-modal'
    );


  if (modal) {

    modal.classList.remove(
      'active'
    );

  }


  document.body.classList.remove(
    'modal-open'
  );


  openedFromGrid =
    false;

}


/*
 * =========================================================
 * SEARCH MODAL
 * =========================================================
 */

function openSearchModal() {

  const modal =
    document.getElementById(
      'search-modal'
    );


  const input =
    document.getElementById(
      'search-input'
    );


  if (modal) {

    modal.classList.add(
      'active'
    );

  }


  document.body.classList.add(
    'modal-open'
  );


  if (input) {

    setTimeout(
      () => input.focus(),
      50
    );

  }

}


/*
 * =========================================================
 * CLOSE SEARCH
 * =========================================================
 */

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


  document.body.classList.remove(
    'modal-open'
  );


  if (results) {

    results.innerHTML =
      '';

  }


  if (input) {

    input.value =
      '';

  }


  searchRequestId++;

}


/*
 * =========================================================
 * SEARCH DEBOUNCE
 * =========================================================
 */

function debounceSearch() {

  clearTimeout(
    searchTimeout
  );


  searchTimeout =
    setTimeout(
      searchTMDB,
      SEARCH_DELAY
    );

}


/*
 * =========================================================
 * SEARCH
 * =========================================================
 */

async function searchTMDB() {

  const input =
    document.getElementById(
      'search-input'
    );


  const container =
    document.getElementById(
      'search-results'
    );


  if (
    !input ||
    !container
  ) {

    return;

  }


  const query =
    input.value.trim();


  if (!query) {

    container.innerHTML =
      '';

    return;

  }


  const requestId =
    ++searchRequestId;


  container.innerHTML =
    '<div style="' +
    'grid-column:1/-1;' +
    'text-align:center;' +
    'padding:30px;' +
    'color:#777;' +
    '">Searching...</div>';


  try {

    const data =
      await tmdbFetch(
        '/search/multi',
        {

          query,

          include_adult:
            false,

          page: 1

        },
        {
          cache: false
        }
      );


    if (
      requestId !==
      searchRequestId
    ) {

      return;

    }


    if (
      !data
    ) {

      container.innerHTML =
        '<div style="' +
        'grid-column:1/-1;' +
        'text-align:center;' +
        'padding:30px;' +
        'color:#777;' +
        '">Unable to load results.</div>';

      return;

    }


    container.innerHTML =
      '';


    const results =
      uniqueItems(
        (
          data.results ||
          []
        ).filter(
          item =>
            item &&
            item.media_type !==
              'person' &&
            item.poster_path
        )
      );


    if (
      results.length === 0
    ) {

      container.innerHTML =
        '<div style="' +
        'grid-column:1/-1;' +
        'text-align:center;' +
        'padding:40px 20px;' +
        'color:#777;' +
        '">No movies or shows found.</div>';

      return;

    }


    results.forEach(
      item => {

        const img =
          document.createElement(
            'img'
          );


        img.src =
          getPosterUrl(
            item.poster_path
          );


        img.alt =
          getItemTitle(item);


        img.loading =
          'lazy';


        img.decoding =
          'async';


        img.title =
          getItemTitle(item);


        img.onerror = () => {

          img.onerror = null;

          img.src =
            PLACEHOLDER_IMG;

        };


        img.onclick = () => {

          closeSearchModal();

          openedFromGrid =
            false;

          showDetails(
            item
          );

        };


        container.appendChild(
          img
        );

      }
    );


  } catch (error) {

    console.error(
      'Search error:',
      error
    );


    if (
      requestId ===
      searchRequestId
    ) {

      container.innerHTML =
        '<div style="' +
        'grid-column:1/-1;' +
        'text-align:center;' +
        'padding:30px;' +
        'color:#777;' +
        '">Search failed. Please try again.</div>';

    }

  }

}


/*
 * =========================================================
 * KEYBOARD CONTROLS
 * =========================================================
 */

function handleKeyboard(event) {

  if (
    event.key ===
    'Escape'
  ) {

    const searchModal =
      document.getElementById(
        'search-modal'
      );


    const gridModal =
      document.getElementById(
        'grid-modal'
      );


    const detailModal =
      document.getElementById(
        'modal'
      );


    if (
      searchModal &&
      searchModal.classList.contains(
        'active'
      )
    ) {

      closeSearchModal();

      return;

    }


    if (
      detailModal &&
      detailModal.classList.contains(
        'active'
      )
    ) {

      closeModal();

      return;

    }


    if (
      gridModal &&
      gridModal.classList.contains(
        'active'
      )
    ) {

      closeGridModal();

    }

  }

}


/*
 * =========================================================
 * INITIALIZATION
 * =========================================================
 */

async function init() {

  try {

    /*
     * Load the homepage feeds simultaneously.
     */

    const [
      movies,
      tvShows,
      anime,
      tagalogMovies,
      tagalogTVShows,
      kDramas,
      vivamaxData
    ] =
      await Promise.all([

        fetchTrending(
          'movie'
        ),

        fetchTrending(
          'tv'
        ),

        fetchTrendingAnime(),

        fetchTagalog(),

        fetchTagalogTV(),

        fetchKDramas(),

        fetchVivamax(
          1
        )

      ]);


    const vivamax =
      (
        vivamaxData &&
        Array.isArray(
          vivamaxData.results
        )
      )
        ? uniqueItems(
            vivamaxData.results,
            'movie'
          )
        : [];


    /*
     * Store homepage data.
     */

    fullDataCache = {

      movies:
        uniqueItems(
          movies,
          'movie'
        ),

      tv:
        uniqueItems(
          tvShows,
          'tv'
        ),

      anime:
        uniqueItems(
          anime,
          'tv'
        ),

      tagalog:
        uniqueItems(
          tagalogMovies,
          'movie'
        ),

      tagalogTV:
        uniqueItems(
          tagalogTVShows,
          'tv'
        ),

      kdrama:
        uniqueItems(
          kDramas,
          'tv'
        ),

      vivamax:
        vivamax

    };


    /*
     * Banner
     *
     * Prefer items with a backdrop.
     */

    const bannerCandidates =
      fullDataCache.movies.filter(
        item =>
          item &&
          item.backdrop_path
      );


    if (
      bannerCandidates.length > 0
    ) {

      const randomIndex =
        Math.floor(
          Math.random() *
          bannerCandidates.length
        );


      displayBanner(
        bannerCandidates[
          randomIndex
        ]
      );

    }


    /*
     * Movie title.
     */

    const movieRowH2 =
      document.querySelector(
        '#movies-row h2'
      );


    if (movieRowH2) {

      movieRowH2.textContent =
        'Trending Movies';

    }


    /*
     * Homepage rows.
     */

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
      fullDataCache.tagalogTV,
      'tagalog-tv-list',
      'tv'
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


    /*
     * Restore local user data.
     */

    renderWatchlistRow();

    renderContinueWatchingRow();


  } catch (error) {

    console.error(
      'Initialization error:',
      error
    );

  }

}


/*
 * =========================================================
 * DOM READY
 * =========================================================
 */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    const scrollArea =
      getGridScrollArea();


    if (scrollArea) {

      scrollArea.addEventListener(
        'scroll',
        handleGridScroll,
        {
          passive: true
        }
      );

    }


    document.addEventListener(
      'keydown',
      handleKeyboard
    );

  }
);


/*
 * =========================================================
 * START APPLICATION
 * =========================================================
 */

init();