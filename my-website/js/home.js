const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';

const BASE_URL = 'https://api.themoviedb.org/3';

const IMG_URL = 'https://image.tmdb.org/t/p/original';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%23222"><rect width="100%" height="100%"/></svg>';


/* =========================================================
   GLOBAL STATE
========================================================= */

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
  kdrama: []
};


/* =========================================================
   SEE ALL STATE
========================================================= */

let activeGridCategory = null;

let openedFromGrid = false;

let openedFromSearch = false;

let savedGridScrollPosition = 0;

let savedSearchScrollPosition = 0;

let gridLoading = false;

let gridPage = 1;

let gridTotalPages = 1;

let gridItems = [];


/* =========================================================
   CATEGORY CONFIGURATION
========================================================= */

const GRID_CONFIG = {

  movies: {
    title: 'Trending Movies',
    type: 'movie',
    endpoint:
      '/trending/movie/week?'
  },

  tv: {
    title: 'Trending TV Shows',
    type: 'tv',
    endpoint:
      '/trending/tv/week?'
  },

  anime: {
    title: 'Trending Anime',
    type: 'tv',
    endpoint:
      '/trending/tv/week?'
  },

  tagalog: {
    title: 'Trending Tagalog Movies',
    type: 'movie',
    endpoint:
      '/discover/movie?with_original_language=tl&sort_by=popularity.desc'
  },

  kdrama: {
    title: 'Trending K-Dramas',
    type: 'tv',
    endpoint:
      '/discover/tv?with_original_language=ko&sort_by=popularity.desc'
  }

};


/* =========================================================
   API HELPERS
========================================================= */

async function fetchPage(endpoint, page = 1) {

  try {

    const separator =
      endpoint.includes('?') ? '&' : '?';

    const url =
      `${BASE_URL}${endpoint}${separator}page=${page}&api_key=${API_KEY}`;

    const res = await fetch(url);

    if (!res.ok) {
      console.error(
        'TMDB request failed:',
        res.status
      );

      return {
        results: [],
        page,
        total_pages: 1
      };
    }

    return await res.json();

  } catch (error) {

    console.error(
      'TMDB request error:',
      error
    );

    return {
      results: [],
      page,
      total_pages: 1
    };
  }
}


async function fetchMultiplePages(
  endpoint,
  maxPages = 3
) {

  let allResults = [];

  try {

    for (
      let page = 1;
      page <= maxPages;
      page++
    ) {

      const data =
        await fetchPage(endpoint, page);

      if (data.results) {

        allResults =
          allResults.concat(
            data.results
          );
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


/* =========================================================
   TRENDING
========================================================= */

async function fetchTrending(type) {

  return await fetchMultiplePages(
    `/trending/${type}/week?`,
    3
  );
}


/* =========================================================
   ANIME
========================================================= */

async function fetchTrendingAnime() {

  let allResults = [];

  try {

    for (
      let page = 1;
      page <= 5;
      page++
    ) {

      const data =
        await fetchPage(
          '/trending/tv/week?',
          page
        );

      if (!data.results) continue;

      const filtered =
        data.results.filter(item =>

          item.original_language === 'ja' &&

          item.genre_ids &&

          item.genre_ids.includes(16)

        );

      allResults =
        allResults.concat(
          filtered
        );
    }

  } catch (error) {

    console.error(
      'Error fetching anime:',
      error
    );
  }

  return allResults;
}


/* =========================================================
   TAGALOG
========================================================= */

async function fetchTagalogContent() {

  return await fetchMultiplePages(
    '/discover/movie?with_original_language=tl&sort_by=popularity.desc',
    3
  );
}


/* =========================================================
   K-DRAMA
========================================================= */

async function fetchKDramas() {

  return await fetchMultiplePages(
    '/discover/tv?with_original_language=ko&sort_by=popularity.desc',
    3
  );
}


/* =========================================================
   GENRE
========================================================= */

async function fetchByGenreId(
  genreId
) {

  return await fetchMultiplePages(
    `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`,
    3
  );
}


/* =========================================================
   BANNER
========================================================= */

function displayBanner(item) {

  if (
    !item ||
    !item.backdrop_path
  ) return;

  bannerItem = item;

  const bannerEl =
    document.getElementById(
      'banner'
    );

  const titleEl =
    document.getElementById(
      'banner-title'
    );

  if (bannerEl) {

    bannerEl.style.backgroundImage =
      `url(${IMG_URL}${item.backdrop_path})`;

  }

  if (titleEl) {

    titleEl.textContent =
      item.title ||
      item.name ||
      '';

  }
}


function playBanner() {

  if (bannerItem) {

    openedFromGrid = false;
    openedFromSearch = false;

    showDetails(
      bannerItem
    );
  }
}


/* =========================================================
   DISPLAY HORIZONTAL LIST
========================================================= */

function displayList(
  items,
  containerId,
  mediaType
) {

  const container =
    document.getElementById(
      containerId
    );

  if (!container) return;

  container.innerHTML = '';

  items
    .slice(0, 20)
    .forEach(item => {

      if (!item.poster_path) return;

      if (!item.media_type) {

        item.media_type =
          mediaType;
      }

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

      img.loading = 'lazy';

      img.onerror = () => {

        img.src =
          PLACEHOLDER_IMG;
      };

      img.onclick = () => {

        openedFromGrid = false;
        openedFromSearch = false;

        showDetails(item);
      };

      container.appendChild(img);

    });
}


/* =========================================================
   MOVIE DETAILS
========================================================= */

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


  document.getElementById(
    'modal-title'
  ).textContent =
    item.title ||
    item.name ||
    '';


  document.getElementById(
    'modal-description'
  ).textContent =
    item.overview ||
    'No description available.';


  const imgEl =
    document.getElementById(
      'modal-image'
    );

  imgEl.src =
    item.poster_path
      ? `${IMG_URL}${item.poster_path}`
      : PLACEHOLDER_IMG;

  imgEl.onerror = () => {

    imgEl.src =
      PLACEHOLDER_IMG;
  };


  document.getElementById(
    'modal-rating'
  ).innerHTML =
    item.vote_average
      ? '★'.repeat(
          Math.round(
            item.vote_average / 2
          )
        )
      : '';


  updateWatchlistButton();

  saveCurrentProgress();


  const isTv =
    item.media_type === 'tv' ||
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
  ).classList.add(
    'active'
  );

  document.body.classList.add(
    'modal-open'
  );
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


    if (
      data &&
      data.seasons
    ) {

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

              option.selected =
                true;
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


/* =========================================================
   EPISODES
========================================================= */

async function loadEpisodes(
  tvId,
  seasonNumber
) {

  currentSeason =
    seasonNumber;

  const container =
    document.getElementById(
      'episodes-container'
    );

  if (!container) return;

  container.innerHTML = '';


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

      const episodeExists =
        data.episodes.some(
          ep =>
            ep.episode_number ===
            currentEpisode
        );


      if (!episodeExists) {

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

            loadVideo();

            saveCurrentProgress();
          };


          container.appendChild(
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


/* =========================================================
   SEASON CHANGE
========================================================= */

function onSeasonChange() {

  const selectedSeason =
    document.getElementById(
      'season-select'
    ).value;

  currentEpisode = 1;

  loadEpisodes(
    currentItem.id,
    parseInt(
      selectedSeason
    )
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


  const embedURL =
    isTv

      ? `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`

      : `https://player.videasy.net/movie/${currentItem.id}`;


  document.getElementById(
    'modal-video'
  ).src =
    embedURL;
}


/* =========================================================
   CLOSE MOVIE MODAL
========================================================= */

function closeModal() {

  document.getElementById(
    'modal'
  ).classList.remove(
    'active'
  );


  document.getElementById(
    'modal-video'
  ).src =
    'about:blank';


  document.body.classList.remove(
    'modal-open'
  );


  /*
     If movie came from See All,
     reopen the exact same See All
     screen and restore its position.
  */

  if (
    openedFromGrid &&
    activeGridCategory
  ) {

    const category =
      activeGridCategory;

    const position =
      savedGridScrollPosition;


    openedFromGrid = false;


    setTimeout(() => {

      openGridModal(
        category,
        true
      );


      setTimeout(() => {

        const grid =
          document.getElementById(
            'grid-modal-results'
          );

        if (grid) {

          grid.scrollTop =
            position;
        }

      }, 100);

    }, 50);


    return;
  }


  /*
     If movie came from Search,
     return to Search.
  */

  if (openedFromSearch) {

    const position =
      savedSearchScrollPosition;


    openedFromSearch = false;


    setTimeout(() => {

      openSearchModal(
        true
      );


      setTimeout(() => {

        const modal =
          document.getElementById(
            'search-modal'
          );

        if (modal) {

          modal.scrollTop =
            position;
        }

      }, 100);

    }, 50);
  }
}


/* =========================================================
   WATCHLIST
========================================================= */

function getWatchlist() {

  return JSON.parse(
    localStorage.getItem(
      'myList'
    )
  ) || [];
}


function isItemInWatchlist(id) {

  return getWatchlist()
    .some(
      item =>
        item.id === id
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

    list.splice(
      index,
      1
    );

  } else {

    list.push(
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


  Object.values(rows)
    .forEach(
      r => {

        if (r) {

          r.style.display =
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


  } else if (
    category ===
    'movie'
  ) {

    if (rows.movies)
      rows.movies.style.display =
        'block';

    if (rows.tagalog)
      rows.tagalog.style.display =
        'block';


  } else if (
    category ===
    'tv'
  ) {

    if (rows.tv)
      rows.tv.style.display =
        'block';

    if (rows.kdrama)
      rows.kdrama.style.display =
        'block';


  } else if (
    category ===
    'anime'
  ) {

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


  if (
    genreId ===
    'all'
  ) {

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
  ]
    .forEach(
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


/* =========================================================
   SEE ALL
========================================================= */

function openGridModal(
  category,
  restoring = false
) {

  activeGridCategory =
    category;


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


  if (!modal || !container)
    return;


  const config =
    GRID_CONFIG[category];


  if (!config) return;


  titleEl.textContent =
    config.title;


  /*
     Reset pagination only when
     opening a new See All session.
  */

  if (!restoring) {

    gridPage = 1;

    gridTotalPages = 1;

    gridLoading = false;

    gridItems =
      fullDataCache[
        category
      ]
      ? [
          ...fullDataCache[
            category
          ]
        ]
      : [];


    container.innerHTML = '';


    /*
       Display already-loaded homepage
       results first.
    */

    renderGridItems(
      gridItems
    );


    /*
       Start loading additional pages.
    */

    loadMoreGrid(
      category
    );

  }


  modal.classList.add(
    'active'
  );

  document.body.classList.add(
    'modal-open'
);


  /*
     Infinite scroll listener.
  */

  container.onscroll =
    handleGridScroll;


  if (!restoring) {

    container.scrollTop = 0;
  }
}


/* =========================================================
   RENDER SEE ALL ITEMS
========================================================= */

function renderGridItems(
  items
) {

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  if (!container) return;


  container
    .querySelectorAll(
      'img'
    )
    .forEach(
      img =>
        img.remove()
    );


  items.forEach(
    item => {

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
           Save exact position
           before opening details.
        */

        savedGridScrollPosition =
          container.scrollTop;


        openedFromGrid =
          true;

        openedFromSearch =
          false;


        closeGridModal(
          true
        );


        showDetails(
          item
        );
      };


      container.insertBefore(
        img,
        container.firstChild
      );

    });


  /*
     Reorder so items stay in
     the correct order.
  */

  const images =
    Array.from(
      container.querySelectorAll(
        'img'
      )
    );


  images.reverse().forEach(
    img =>
      container.appendChild(
        img
      )
  );
}


/* =========================================================
   LOAD NEXT SEE ALL PAGE
========================================================= */

async function loadMoreGrid(
  category
) {

  if (gridLoading)
    return;


  if (
    gridPage >
    gridTotalPages
  ) {

    return;
  }


  gridLoading = true;


  const container =
    document.getElementById(
      'grid-modal-results'
    );


  if (!container) {

    gridLoading = false;

    return;
  }


  removeGridLoader();


  const loader =
    document.createElement(
      'div'
    );

  loader.className =
    'grid-loader';

  loader.textContent =
    'Loading more...';


  container.appendChild(
    loader
  );


  const config =
    GRID_CONFIG[category];


  let data;


  /*
     Anime requires filtering
     the TV results.
  */

  if (
    category ===
    'anime'
  ) {

    data =
      await fetchPage(
        '/trending/tv/week?',
        gridPage
      );

    const filtered =
      (data.results || [])
        .filter(
          item =>
            item.original_language ===
              'ja' &&
            item.genre_ids &&
            item.genre_ids.includes(
              16
            )
        );


    data.results =
      filtered;

  } else {

    data =
      await fetchPage(
        config.endpoint,
        gridPage
      );
  }


  removeGridLoader();


  if (
    data &&
    data.results
  ) {

    const newItems =
      data.results.filter(
        item => {

          return !gridItems.some(
            existing =>
              existing.id ===
              item.id
          );
        }
      );


    newItems.forEach(
      item => {

        if (!item.media_type) {

          item.media_type =
            config.type;
        }

        gridItems.push(
          item
        );
      }
    );


    /*
       Append only new items.
    */

    appendGridItems(
      newItems
    );
  }


  gridTotalPages =
    data.total_pages ||
    1;


  /*
     Anime can need more pages
     because some TV results are
     filtered out.
  */

  if (
    category ===
    'anime' &&
    gridPage <
      gridTotalPages
  ) {

    gridPage++;

  } else {

    gridPage++;
  }


  gridLoading =
    false;


  if (
    gridPage >
    gridTotalPages
  ) {

    showGridEnd();
  }
}


/* =========================================================
   APPEND NEW GRID ITEMS
========================================================= */

function appendGridItems(
  items
) {

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  if (!container) return;


  const endMessage =
    container.querySelector(
      '.grid-end'
    );


  if (endMessage) {

    endMessage.remove();
  }


  items.forEach(
    item => {

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

        savedGridScrollPosition =
          container.scrollTop;


        openedFromGrid =
          true;

        openedFromSearch =
          false;


        closeGridModal(
          true
        );


        showDetails(
          item
        );
      };


      container.appendChild(
        img
      );

    });
}


/* =========================================================
   SEE ALL SCROLL HANDLER
========================================================= */

function handleGridScroll(
  event
) {

  const container =
    event.target;


  const distanceFromBottom =
    container.scrollHeight -
    (
      container.scrollTop +
      container.clientHeight
    );


  /*
     Start loading the next page
     800px before the bottom.
  */

  if (
    distanceFromBottom <
      800 &&
    !gridLoading
  ) {

    if (
      gridPage <=
      gridTotalPages
    ) {

      loadMoreGrid(
        activeGridCategory
      );
    }
  }
}


/* =========================================================
   GRID LOADER HELPERS
========================================================= */

function removeGridLoader() {

  const loader =
    document.querySelector(
      '#grid-modal-results .grid-loader'
    );

  if (loader) {

    loader.remove();
  }
}


function showGridEnd() {

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  if (!container)
    return;


  if (
    container.querySelector(
      '.grid-end'
    )
  ) return;


  const end =
    document.createElement(
      'div'
    );

  end.className =
    'grid-end';

  end.textContent =
    'You reached the end.';


  container.appendChild(
    end
  );
}


/* =========================================================
   CLOSE SEE ALL
========================================================= */

function closeGridModal(
  returningToDetails = false
) {

  const modal =
    document.getElementById(
      'grid-modal'
    );


  if (!modal) return;


  /*
     Save position unless we're
     temporarily closing it to open
     a movie.
  */

  if (
    !returningToDetails
  ) {

    const container =
      document.getElementById(
        'grid-modal-results'
      );


    if (container) {

      savedGridScrollPosition =
        container.scrollTop;
    }
  }


  modal.classList.remove(
    'active'
  );


  /*
     Don't remove modal-open when
     transitioning into movie details.
  */

  if (
    !returningToDetails
  ) {

    document.body.classList.remove(
      'modal-open'
    );
  }
}


/* =========================================================
   SEARCH
========================================================= */

function openSearchModal(
  restoring = false
) {

  const modal =
    document.getElementById(
      'search-modal'
    );


  const input =
    document.getElementById(
      'search-input'
    );


  if (!modal) return;


  modal.classList.add(
    'active'
  );


  document.body.classList.add(
    'modal-open'
  );


  if (!restoring) {

    input.focus();
  }


  if (restoring) {

    setTimeout(() => {

      modal.scrollTop =
        savedSearchScrollPosition;

    }, 50);
  }
}


function closeSearchModal() {

  const modal =
    document.getElementById(
      'search-modal'
    );


  const input =
    document.getElementById(
      'search-input'
    );


  const results =
    document.getElementById(
      'search-results'
    );


  modal.classList.remove(
    'active'
  );


  results.innerHTML =
    '';


  input.value =
    '';


  document.body.classList.remove(
    'modal-open'
  );


  openedFromSearch =
    false;
}


/* =========================================================
   SEARCH DEBOUNCE
========================================================= */

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


/* =========================================================
   SEARCH TMDB
========================================================= */

async function searchTMDB() {

  const input =
    document.getElementById(
      'search-input'
    );


  const query =
    input.value.trim();


  const container =
    document.getElementById(
      'search-results'
    );


  if (!query) {

    container.innerHTML =
      '';

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


    container.innerHTML =
      '';


    data.results.forEach(
      item => {

        if (
          !item.poster_path ||
          item.media_type ===
            'person'
        ) return;


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
          item.name ||
          '';


        img.loading =
          'lazy';


        img.onerror = () => {

          img.src =
            PLACEHOLDER_IMG;
        };


        img.onclick = () => {

          const modal =
            document.getElementById(
              'search-modal'
            );


          savedSearchScrollPosition =
            modal.scrollTop;


          openedFromSearch =
            true;

          openedFromGrid =
            false;


          closeSearchModal();

          showDetails(
            item
          );
        };


        container.appendChild(
          img
        );

      });

  } catch (error) {

    console.error(
      'Search error:',
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
      kDramas
    ] = await Promise.all([

      fetchTrending(
        'movie'
      ),

      fetchTrending(
        'tv'
      ),

      fetchTrendingAnime(),

      fetchTagalogContent(),

      fetchKDramas()

    ]);


    fullDataCache = {

      movies,

      tv:
        tvShows,

      anime,

      tagalog:
        tagalogMovies,

      kdrama:
        kDramas
    };


    /*
       Banner
    */

    if (
      movies.length > 0
    ) {

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
       Homepage titles
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
       Homepage lists
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
       Local storage rows
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


/* =========================================================
   START
========================================================= */

init();