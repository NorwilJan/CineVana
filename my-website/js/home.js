const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%23222"><rect width="100%" height="100%"/></svg>';

/*
===========================================================
GLOBAL STATE
===========================================================
*/

let currentItem = null;
let bannerItem = null;

let currentSeason = 1;
let currentEpisode = 1;

let searchTimeout;
let showDetailsCache = {};

let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  kdrama: [],
  vivamax: []
};

/*
===========================================================
SEE ALL / INFINITE SCROLL STATE
===========================================================
*/

let gridCategory = null;
let gridPage = 1;
let gridLoading = false;
let gridHasMore = true;

let gridScrollPosition = 0;
let openedFromGrid = false;

/*
===========================================================
VIVAMAX
===========================================================

TMDB company ID for Vivamax = 149142
*/

const VIVAMAX_COMPANY_ID = 149142;

const gridTitles = {
  movies: 'Trending Movies',
  tv: 'Trending TV Shows',
  anime: 'Trending Anime',
  tagalog: 'Trending Tagalog Movies',
  kdrama: 'Trending K-Dramas',
  vivamax: 'Top Rated Vivamax'
};

/*
===========================================================
FETCH MULTIPLE PAGES
===========================================================
*/

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

    console.error(
      "Error fetching multiple pages:",
      error
    );
  }

  return allResults;
}

/*
===========================================================
TRENDING
===========================================================
*/

async function fetchTrending(type) {

  return await fetchMultiplePages(
    `/trending/${type}/week?`,
    3
  );
}

/*
===========================================================
ANIME
===========================================================
*/

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

        const filtered =
          data.results.filter(item =>
            item.original_language === 'ja' &&
            item.genre_ids &&
            item.genre_ids.includes(16)
          );

        allResults = allResults.concat(filtered);
      }
    }

  } catch (error) {

    console.error(
      "Error fetching anime:",
      error
    );
  }

  return allResults;
}

/*
===========================================================
TAGALOG
===========================================================
*/

async function fetchTagalogContent() {

  return await fetchMultiplePages(
    `/discover/movie?with_original_language=tl&sort_by=popularity.desc`,
    3
  );
}

/*
===========================================================
K-DRAMA
===========================================================
*/

async function fetchKDramas() {

  return await fetchMultiplePages(
    `/discover/tv?with_original_language=ko&sort_by=popularity.desc`,
    3
  );
}

/*
===========================================================
GENRE
===========================================================
*/

async function fetchByGenreId(genreId) {

  return await fetchMultiplePages(
    `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`,
    3
  );
}

/*
===========================================================
VIVAMAX
===========================================================
*/

async function fetchVivamax(page = 1) {

  try {

    const url =
      `${BASE_URL}/discover/movie` +
      `?api_key=${API_KEY}` +
      `&with_companies=${VIVAMAX_COMPANY_ID}` +
      `&sort_by=vote_average.desc` +
      `&vote_count.gte=5` +
      `&page=${page}` +
      `&language=en-US`;

    const res = await fetch(url);

    if (!res.ok) {
      return {
        results: [],
        total_pages: 0
      };
    }

    const data = await res.json();

    return {
      results: data.results || [],
      total_pages: data.total_pages || 0
    };

  } catch (error) {

    console.error(
      "Error fetching Vivamax:",
      error
    );

    return {
      results: [],
      total_pages: 0
    };
  }
}

/*
===========================================================
BANNER
===========================================================
*/

function displayBanner(item) {

  if (!item || !item.backdrop_path) return;

  bannerItem = item;

  const bannerEl =
    document.getElementById('banner');

  const titleEl =
    document.getElementById('banner-title');

  if (bannerEl) {

    bannerEl.style.backgroundImage =
      `linear-gradient(to top, #111 10%, rgba(17,17,17,0.4) 60%, rgba(17,17,17,0.8)), url(${IMG_URL}${item.backdrop_path})`;
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

/*
===========================================================
DISPLAY HORIZONTAL LIST
===========================================================
*/

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

    img.onclick = () => {

      openedFromGrid = false;

      showDetails(item);
    };

    container.appendChild(img);
  });
}

/*
===========================================================
DETAILS
===========================================================
*/

async function showDetails(item) {

  currentItem = item;

  const continueList =
    getContinueWatching();

  const savedProgress =
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
      ? `★ ${Number(item.vote_average).toFixed(1)} / 10`
      : '';

  updateWatchlistButton();

  saveCurrentProgress();

  const isTv =
    item.media_type === "tv" ||
    !item.title;

  const seriesOptions =
    document.getElementById(
      'series-options'
    );

  if (isTv) {

    seriesOptions.style.display =
      'flex';

    await loadTVSeasons(
      item.id,
      currentSeason,
      currentEpisode
    );

  } else {

    seriesOptions.style.display =
      'none';

    loadVideo();
  }

  document.getElementById(
    'modal'
  ).classList.add('active');

  document.body.classList.add(
    'modal-open'
  );
}

/*
===========================================================
TV SEASONS
===========================================================
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

        data = await res.json();

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
      "Error loading TV seasons:",
      error
    );
  }
}

/*
===========================================================
EPISODES
===========================================================
*/

async function loadEpisodes(
  tvId,
  seasonNumber
) {

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

      if (
        !currentEpisode ||
        currentSeason !==
        seasonNumber
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
              .forEach(b =>
                b.classList.remove(
                  'active'
                )
              );

            btn.classList.add(
              'active'
            );

            currentEpisode =
              ep.episode_number;

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
      "Error loading episodes:",
      error
    );
  }
}

/*
===========================================================
SEASON CHANGE
===========================================================
*/

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

/*
===========================================================
VIDEO
===========================================================
*/

function loadVideo() {

  if (!currentItem) return;

  const isTv =
    currentItem.media_type === "tv" ||
    !currentItem.title;

  let embedURL =
    isTv
      ? `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`
      : `https://player.videasy.net/movie/${currentItem.id}`;

  document.getElementById(
    'modal-video'
  ).src = embedURL;
}

/*
===========================================================
CLOSE DETAILS MODAL
===========================================================
*/

function closeModal() {

  document.getElementById(
    'modal'
  ).classList.remove('active');

  document.getElementById(
    'modal-video'
  ).src = 'about:blank';

  document.body.classList.remove(
    'modal-open'
  );

  /*
    If the movie was opened from See All,
    return to See All instead of homepage.
  */

  if (openedFromGrid) {

    setTimeout(() => {

      const gridModal =
        document.getElementById(
          'grid-modal'
        );

      gridModal.classList.add(
        'active'
      );

      document.body.classList.add(
        'modal-open'
      );

      const scrollArea =
        document.getElementById(
          'grid-scroll-area'
        );

      if (scrollArea) {

        requestAnimationFrame(() => {

          scrollArea.scrollTop =
            gridScrollPosition;
        });
      }

    }, 50);
  }
}

/*
===========================================================
WATCHLIST
===========================================================
*/

function getWatchlist() {

  return JSON.parse(
    localStorage.getItem(
      'myList'
    )
  ) || [];
}

function isItemInWatchlist(id) {

  return getWatchlist().some(
    item => item.id === id
  );
}

function toggleWatchlist() {

  if (!currentItem) return;

  let list =
    getWatchlist();

  const index =
    list.findIndex(
      item =>
        item.id ===
        currentItem.id
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

  if (!btn || !currentItem)
    return;

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

/*
===========================================================
CONTINUE WATCHING
===========================================================
*/

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
        i.id ===
        currentItem.id
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

/*
===========================================================
CATEGORY FILTER
===========================================================
*/

function filterContent(
  category,
  eventElement
) {

  document
    .querySelectorAll(
      '.tab-btn'
    )
    .forEach(btn =>
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

    if (rows.vivamax)
      rows.vivamax.style.display =
        'block';

  } else if (
    category === 'movie'
  ) {

    if (rows.movies)
      rows.movies.style.display =
        'block';

    if (rows.tagalog)
      rows.tagalog.style.display =
        'block';

    if (rows.vivamax)
      rows.vivamax.style.display =
        'block';

  } else if (
    category === 'tv'
  ) {

    if (rows.tv)
      rows.tv.style.display =
        'block';

    if (rows.kdrama)
      rows.kdrama.style.display =
        'block';

  } else if (
    category === 'anime'
  ) {

    if (rows.anime)
      rows.anime.style.display =
        'block';
  }
}

/*
===========================================================
GENRE FILTER
===========================================================
*/

async function filterByGenre(
  genreId,
  eventElement
) {

  document
    .querySelectorAll(
      '.genre-btn'
    )
    .forEach(btn =>
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
    'kdrama-row',
    'vivamax-row'
  ].forEach(id => {

    const el =
      document.getElementById(
        id
      );

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

/*
===========================================================
OPEN SEE ALL
===========================================================
*/

async function openGridModal(
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

  const scrollArea =
    document.getElementById(
      'grid-scroll-area'
    );

  if (!modal || !container)
    return;

  gridCategory =
    category;

  gridPage = 1;
  gridLoading = false;
  gridHasMore = true;

  gridScrollPosition = 0;
  openedFromGrid = false;

  titleEl.textContent =
    gridTitles[category] ||
    'Category';

  container.innerHTML = '';

  const loading =
    document.getElementById(
      'grid-loading'
    );

  const endMessage =
    document.getElementById(
      'grid-end'
    );

  if (loading)
    loading.classList.remove(
      'active'
    );

  if (endMessage)
    endMessage.style.display =
      'none';

  if (scrollArea)
    scrollArea.scrollTop = 0;

  modal.classList.add(
    'active'
  );

  document.body.classList.add(
    'modal-open'
  );

  /*
    Load first page.
  */

  await loadGridPage();
}

/*
===========================================================
LOAD GRID PAGE
===========================================================
*/

async function loadGridPage() {

  if (
    gridLoading ||
    !gridHasMore
  )
    return;

  gridLoading = true;

  const loading =
    document.getElementById(
      'grid-loading'
    );

  if (loading)
    loading.classList.add(
      'active'
    );

  try {

    let results = [];
    let totalPages = 1;

    /*
    VIVAMAX
    */

    if (
      gridCategory ===
      'vivamax'
    ) {

      const data =
        await fetchVivamax(
          gridPage
        );

      results =
        data.results;

      totalPages =
        data.total_pages;

    }

    /*
    MOVIES
    */

    else if (
      gridCategory ===
      'movies'
    ) {

      const res =
        await fetch(
          `${BASE_URL}/trending/movie/week?api_key=${API_KEY}&page=${gridPage}`
        );

      if (res.ok) {

        const data =
          await res.json();

        results =
          data.results || [];

        totalPages =
          data.total_pages || 1;
      }

    }

    /*
    TV
    */

    else if (
      gridCategory ===
      'tv'
    ) {

      const res =
        await fetch(
          `${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${gridPage}`
        );

      if (res.ok) {

        const data =
          await res.json();

        results =
          data.results || [];

        totalPages =
          data.total_pages || 1;
      }

    }

    /*
    ANIME
    */

    else if (
      gridCategory ===
      'anime'
    ) {

      const res =
        await fetch(
          `${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${gridPage}`
        );

      if (res.ok) {

        const data =
          await res.json();

        results =
          (data.results || [])
            .filter(item =>
              item.original_language === 'ja' &&
              item.genre_ids &&
              item.genre_ids.includes(16)
            );

        totalPages =
          data.total_pages || 1;
      }

    }

    /*
    TAGALOG
    */

    else if (
      gridCategory ===
      'tagalog'
    ) {

      const res =
        await fetch(
          `${BASE_URL}/discover/movie?with_original_language=tl&sort_by=popularity.desc&api_key=${API_KEY}&page=${gridPage}`
        );

      if (res.ok) {

        const data =
          await res.json();

        results =
          data.results || [];

        totalPages =
          data.total_pages || 1;
      }

    }

    /*
    KDRAMA
    */

    else if (
      gridCategory ===
      'kdrama'
    ) {

      const res =
        await fetch(
          `${BASE_URL}/discover/tv?with_original_language=ko&sort_by=popularity.desc&api_key=${API_KEY}&page=${gridPage}`
        );

      if (res.ok) {

        const data =
          await res.json();

        results =
          data.results || [];

        totalPages =
          data.total_pages || 1;
      }
    }

    /*
    SAVE DATA
    */

    if (results.length > 0) {

      if (
        gridCategory ===
        'vivamax'
      ) {

        results.forEach(item => {

          if (!item.media_type)
            item.media_type =
              'movie';
        });

      }

      appendGridResults(
        results
      );
    }

    /*
    NEXT PAGE
    */

    if (
      gridPage >= totalPages ||
      results.length === 0
    ) {

      gridHasMore = false;

      const endMessage =
        document.getElementById(
          'grid-end'
        );

      if (endMessage) {

        endMessage.textContent =
          'You have reached the end.';

        endMessage.style.display =
          'block';
      }

    } else {

      gridPage++;
    }

  } catch (error) {

    console.error(
      "Error loading grid:",
      error
    );

  } finally {

    gridLoading = false;

    if (loading)
      loading.classList.remove(
        'active'
      );
  }
}

/*
===========================================================
APPEND GRID RESULTS
===========================================================
*/

function appendGridResults(
  items
) {

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  if (!container)
    return;

  items.forEach(item => {

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
      item.name ||
      '';

    img.loading =
      'lazy';

    img.onerror = () => {

      img.src =
        PLACEHOLDER_IMG;
    };

    img.onclick = () => {

      /*
        Save exact scroll position
        BEFORE opening movie.
      */

      const scrollArea =
        document.getElementById(
          'grid-scroll-area'
        );

      if (scrollArea) {

        gridScrollPosition =
          scrollArea.scrollTop;
      }

      openedFromGrid = true;

      /*
        Hide See All while
        details are open.
      */

      document
        .getElementById(
          'grid-modal'
        )
        .classList.remove(
          'active'
        );

      showDetails(item);
    };

    container.appendChild(
      img
    );
  });
}

/*
===========================================================
INFINITE SCROLL
===========================================================
*/

function handleGridScroll() {

  const scrollArea =
    document.getElementById(
      'grid-scroll-area'
    );

  if (!scrollArea)
    return;

  /*
    Keep current position updated.
  */

  gridScrollPosition =
    scrollArea.scrollTop;

  /*
    Load next page when
    approximately 500px from bottom.
  */

  const nearBottom =
    scrollArea.scrollTop +
    scrollArea.clientHeight >=
    scrollArea.scrollHeight - 500;

  if (
    nearBottom &&
    !gridLoading &&
    gridHasMore
  ) {

    loadGridPage();
  }
}

/*
===========================================================
CLOSE SEE ALL
===========================================================
*/

function closeGridModal() {

  document
    .getElementById(
      'grid-modal'
    )
    .classList.remove(
      'active'
    );

  document.body.classList.remove(
    'modal-open'
  );

  openedFromGrid = false;
}

/*
===========================================================
SEARCH
===========================================================
*/

function openSearchModal() {

  const modal =
    document.getElementById(
      'search-modal'
    );

  modal.classList.add(
    'active'
  );

  document.body.classList.add(
    'modal-open'
  );

  setTimeout(() => {

    document
      .getElementById(
        'search-input'
      )
      .focus();

  }, 100);
}

function closeSearchModal() {

  document
    .getElementById(
      'search-modal'
    )
    .classList.remove(
      'active'
    );

  document.body.classList.remove(
    'modal-open'
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

  try {

    const res =
      await fetch(
        `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`
      );

    if (!res.ok)
      return;

    const data =
      await res.json();

    container.innerHTML = '';

    data.results.forEach(
      item => {

        if (
          !item.poster_path ||
          item.media_type ===
          'person'
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

        img.loading =
          'lazy';

        img.onerror = () => {

          img.src =
            PLACEHOLDER_IMG;
        };

        img.onclick = () => {

          closeSearchModal();

          openedFromGrid =
            false;

          showDetails(item);
        };

        container.appendChild(
          img
        );
      }
    );

  } catch (error) {

    console.error(
      "Search error:",
      error
    );
  }
}

/*
===========================================================
INITIALIZE
===========================================================
*/

async function init() {

  const [
    movies,
    tvShows,
    anime,
    tagalogMovies,
    kDramas,
    vivamaxData
  ] = await Promise.all([

    fetchTrending('movie'),

    fetchTrending('tv'),

    fetchTrendingAnime(),

    fetchTagalogContent(),

    fetchKDramas(),

    fetchVivamax(1)
  ]);

  const vivamax =
    vivamaxData.results || [];

  vivamax.forEach(item => {

    item.media_type =
      'movie';
  });

  fullDataCache = {

    movies,

    tv: tvShows,

    anime,

    tagalog:
      tagalogMovies,

    kdrama:
      kDramas,

    vivamax
  };

  /*
  Banner
  */

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

  /*
  Row titles
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
  Display rows
  */

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

  /*
  IMPORTANT:
  Vivamax is displayed separately.
  */

  displayList(
    vivamax,
    'vivamax-list',
    'movie'
  );

  renderWatchlistRow();

  renderContinueWatchingRow();
}

/*
===========================================================
GRID SCROLL LISTENER
===========================================================
*/

document.addEventListener(
  'DOMContentLoaded',
  () => {

    const scrollArea =
      document.getElementById(
        'grid-scroll-area'
      );

    if (scrollArea) {

      scrollArea.addEventListener(
        'scroll',
        handleGridScroll,
        {
          passive: true
        }
      );
    }
  }
);

/*
===========================================================
START
===========================================================
*/

init();