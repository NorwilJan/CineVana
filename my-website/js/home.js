// --- STATE & CACHE ---
let currentTabCategory = 'all'; // 'all', 'movie', 'tv', 'kdrama', 'anime', 'tagalog'
let fullDataCache = {
  movies: [],
  tv: []
};

// --- INITIALIZATION ---
// Call this on page load to populate your initial cache and render default content
async function initApp() {
  try {
    // Fetch initial trending movies and TV shows from TMDB
    const [moviesData, tvData] = await Promise.all([
      tmdbFetch('/trending/movie/day', { page: 1 }),
      tmdbFetch('/trending/tv/day', { page: 1 })
    ]);

    if (moviesData && Array.isArray(moviesData.results)) {
      moviesData.results.forEach(item => { item.media_type = 'movie'; });
      fullDataCache.movies = moviesData.results;
    }

    if (tvData && Array.isArray(tvData.results)) {
      tvData.results.forEach(item => { item.media_type = 'tv'; });
      fullDataCache.tv = tvData.results;
    }

    // Render initial state
    filterContent('all', document.querySelector('.tab-btn.active'));
  } catch (error) {
    console.error('Failed to initialize app data:', error);
  }
}

// --- TAB SWITCHING & CATEGORY FILTERING ---
async function filterContent(category, eventElement) {
  currentTabCategory = category;

  // Update active states on tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (eventElement) eventElement.classList.add('active');

  // Show/Hide Genre bar based on category availability
  const genreTabsEl = document.getElementById('genre-tabs');
  if (genreTabsEl) {
    genreTabsEl.style.display = ['movie', 'tv', 'kdrama', 'anime', 'tagalog'].includes(category) ? 'flex' : 'none';
  }

  // Reset genre buttons selection back to 'all' when switching tabs
  document.querySelectorAll('.genre-btn').forEach(btn => btn.classList.remove('active'));
  const allGenreBtn = document.querySelector('.genre-btn[data-genre="all"]');
  if (allGenreBtn) allGenreBtn.classList.add('active');

  // Handle Visibility of Content Rows
  document.querySelectorAll('.content-row').forEach(row => row.style.display = 'none');

  if (category === 'all') {
    document.getElementById('movies-row').style.display = 'block';
    document.getElementById('tvshows-row').style.display = 'block';
    displayList(fullDataCache.movies, 'movies-list', 'movie');
    displayList(fullDataCache.tv, 'tvshows-list', 'tv');
  } else if (category === 'movie') {
    document.getElementById('movies-row').style.display = 'block';
    displayList(fullDataCache.movies, 'movies-list', 'movie');
  } else if (category === 'tv' || category === 'kdrama') {
    document.getElementById('tvshows-row').style.display = 'block';
    displayList(fullDataCache.tv, 'tvshows-list', 'tv');
  } else if (category === 'anime') {
    let animeRow = document.getElementById('anime-row');
    if (animeRow) animeRow.style.display = 'block';
    fetchAndDisplayAnime();
  } else if (category === 'tagalog') {
    let tagalogRow = document.getElementById('tagalog-row');
    if (tagalogRow) tagalogRow.style.display = 'block';
    fetchAndDisplayTagalog();
  }
}

// --- GENRE FILTERING (Covers Movies, TV, Anime, & Tagalog genres) ---
async function filterByGenre(genreId, eventElement) {
  document.querySelectorAll('.genre-btn').forEach(btn => btn.classList.remove('active'));
  if (eventElement) eventElement.classList.add('active');

  let targetMediaType = 'movie';
  let targetRowId = 'movies-list';
  let rowElementId = 'movies-row';
  let extraParams = {};

  // Map active category tab to correct target endpoints, lists, and metadata filters
  if (currentTabCategory === 'tv' || currentTabCategory === 'kdrama') {
    targetMediaType = 'tv';
    targetRowId = 'tvshows-list';
    rowElementId = 'tvshows-row';
  } else if (currentTabCategory === 'anime') {
    targetMediaType = 'tv';
    targetRowId = 'anime-list';
    rowElementId = 'anime-row';
    extraParams = { with_genres: '16', with_original_language: 'ja' };
  } else if (currentTabCategory === 'tagalog') {
    targetMediaType = 'movie';
    targetRowId = 'tagalog-list';
    rowElementId = 'tagalog-row';
    extraParams = {
      with_original_language: 'tl',
      region: 'PH'
    };
  }

  const endpoint = targetMediaType === 'movie' ? '/discover/movie' : '/discover/tv';

  // Isolate and show only the active target row
  document.querySelectorAll('.content-row').forEach(row => row.style.display = 'none');
  const rowEl = document.getElementById(rowElementId);
  if (rowEl) rowEl.style.display = 'block';

  // Handle 'all' selection inside the specific category tab
  if (genreId === 'all') {
    if (currentTabCategory === 'tagalog') {
      fetchAndDisplayTagalog();
    } else if (currentTabCategory === 'anime') {
      fetchAndDisplayAnime();
    } else if (targetMediaType === 'movie') {
      displayList(fullDataCache.movies, 'movies-list', 'movie');
    } else {
      displayList(fullDataCache.tv, 'tvshows-list', 'tv');
    }
    return;
  }

  // Fetch filtered data from TMDB combining genre + required language/region parameters
  const data = await tmdbFetch(endpoint, {
    with_genres: genreId,
    sort_by: 'popularity.desc',
    page: 1,
    ...extraParams
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = targetMediaType; });
    displayList(data.results, targetRowId, targetMediaType);
  }
}

// --- DEDICATED FETCH HELPERS ---

async function fetchAndDisplayTagalog() {
  const data = await tmdbFetch('/discover/movie', {
    with_original_language: 'tl',
    region: 'PH',
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'movie'; });
    displayList(data.results, 'tagalog-list', 'movie');
  }
}

async function fetchAndDisplayAnime() {
  const data = await tmdbFetch('/discover/tv', {
    with_genres: '16',
    with_original_language: 'ja',
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'tv'; });
    displayList(data.results, 'anime-list', 'tv');
  }
}
