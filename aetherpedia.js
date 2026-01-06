document.addEventListener('DOMContentLoaded', () => {

    // --- Firebase Config ---
    const firebaseConfig = {
        "projectId": "aetherguild-37084708-fa531",
        "appId": "1:1020806444380:web:ea9a30f7705a294fc1fd99",
        "storageBucket": "aetherguild-37084708-fa531.firebasestorage.app",
        "apiKey": "AIzaSyAEven_LdLIDeHaCI3ayto4XVDt2hBMOx4",
        "authDomain": "aetherguild-37084708-fa531.firebaseapp.com",
        "messagingSenderId": "1020806444380"
    };

    // --- Global State & Elements ---
    let db;
    let searchForm, searchInput, searchResultsContainer;
    let debounceTimer;

    // --- Main Initializer ---
    function init() {
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
        } catch (e) {
            console.error("Firebase initialization failed.", e);
            const contentContainer = document.getElementById('content-container');
            if(contentContainer) contentContainer.innerHTML = `<h1 class='firstHeading'>Error</h1><p>Could not connect to the database. Please check your internet connection and disable any ad blockers.</p>`;
            return; 
        }
        
        searchForm = document.getElementById('search-form');
        searchInput = document.getElementById('searchInput');
        searchResultsContainer = document.getElementById('search-results-container');

        if (!searchForm || !searchInput) return;

        initPageBasedOnURL();
        attachEventListeners();
    }

    function attachEventListeners() {
        searchForm.addEventListener('submit', handleSearchSubmit);
        searchInput.addEventListener('input', handleLiveSearchInput);
        
        document.addEventListener('click', (e) => {
            if (searchResultsContainer && !searchResultsContainer.contains(e.target) && e.target !== searchInput) {
                searchResultsContainer.style.display = 'none';
            }
            
            const importButton = e.target.closest('.import-button, .import-button-page');
            if (importButton) {
                e.preventDefault();
                const title = importButton.dataset.title;
                if (title) {
                    handleImportClick(title, importButton);
                }
            }
        });
    }

    // --- Page Routing & Initialization --- //

    function initPageBasedOnURL() {
        const params = new URLSearchParams(window.location.search);
        const path = window.location.pathname;

        if (path.includes('search.html')) {
            initSearchPage(params);
        } else if (params.has('article')) {
            fetchAndDisplayArticle(params.get('article'));
        }
    }

    // --- Search Logic & Redirection --- //

    function handleSearchSubmit(e) {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            window.location.href = `/search.html?query=${encodeURIComponent(query)}`;
        }
    }

    function handleLiveSearchInput() {
        clearTimeout(debounceTimer);
        const query = searchInput.value.trim();

        if (query.length < 2) {
            if (searchResultsContainer) searchResultsContainer.style.display = 'none';
            return;
        }

        searchResultsContainer.style.display = 'block';
        searchResultsContainer.innerHTML = '<div class="search-result-item">Searching...</div>';

        debounceTimer = setTimeout(() => {
            executeSearch(query, renderLiveSearchResults, false);
        }, 300);
    }
    
    // --- Search Page --- //

    function initSearchPage(params) {
        const query = params.get('query');
        if (!query) return;

        searchInput.value = query;
        document.title = `Search results for "${query}" - Aetherpedia`;
        
        const contentContainer = document.getElementById('content-container');
        contentContainer.innerHTML = `<h1 id="firstHeading" class="firstHeading">Search Results for "${query}"</h1><div id="search-results-list" class="search-page-results-container">Loading...</div>`;
        
        executeSearch(query, renderSearchResultsPage, true);
    }
    
    // --- Universal Search Execution --- //

    async function executeSearch(query, renderCallback, withSnippets = false) {
        const [aetherpediaResults, wikipediaResults] = await Promise.all([
            searchAetherpedia(query),
            searchWikipedia(query, withSnippets)
        ]);
        renderCallback(aetherpediaResults, wikipediaResults);
    }
    
    async function searchAetherpedia(query) {
        const lowerQuery = query.toLowerCase();
        try {
            const articlesSnapshot = await db.collection('articles').get();
            const results = [];
            articlesSnapshot.forEach(doc => {
                const title = doc.id.replace(/_/g, ' ');
                if (title.toLowerCase().includes(lowerQuery)) {
                    results.push({ type: 'article', id: doc.id, title: title });
                }
            });
            return results;
        } catch (error) {
            console.error("Error searching Aetherpedia:", error);
            return []; // Return empty array on error
        }
    }
    
    async function searchWikipedia(query, withSnippets = false) {
        try {
            let url;
            if (withSnippets) {
                 url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=10&format=json&origin=*&srprop=snippet`;
            } else {
                 url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=10&namespace=0&format=json&origin=*`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Wikipedia API responded with an error');
            const data = await response.json();

            if (withSnippets) {
                return data.query.search.map(item => ({ title: item.title, snippet: item.snippet }));
            } else {
                 return data[1].map(title => ({ title: title }));
            }
        } catch (error) {
            console.error("Error searching Wikipedia:", error);
            return []; // Return empty array on error
        }
    }

    // --- Search Result Rendering --- //

    function renderLiveSearchResults(aetherpediaResults, wikipediaResults) {
        if (!searchResultsContainer) return;
        let html = '<ul class="search-results-list">';
        
        const aetherpediaList = aetherpediaResults || [];
        const wikipediaList = wikipediaResults || [];

        if (aetherpediaList.length === 0 && wikipediaList.length === 0) {
            html += '<li class="search-result-item">No results found.</li>';
        } else {
            aetherpediaList.forEach(result => {
                html += `<li class="search-result-item"><a href="/aetherpedia.html?article=${result.id}"><span class="search-result-title">${result.title}</span><span class="search-result-source source-aether">Aetherpedia</span></a></li>`;
            });

            wikipediaList.forEach(result => {
                html += `<li class="search-result-item search-result-wikipedia">
                    <a href="#" class="import-link" data-title="${result.title}">
                        <span class="search-result-title">${result.title}</span>
                        <span class="search-result-source source-wiki">Wikipedia</span>
                    </a>
                    <button class="import-button" data-title="${result.title}" title="Import this article">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                </li>`;
            });
        }
        html += '</ul>';
        searchResultsContainer.innerHTML = html;
    }

    function renderSearchResultsPage(query, aetherpediaResults, wikipediaResults) {
        const resultsList = document.getElementById('search-results-list');
        let html = '<h2>Aetherpedia Results</h2>';

        const aetherpediaList = aetherpediaResults || [];
        const wikipediaList = wikipediaResults || [];

        if (aetherpediaList.length > 0) {
             aetherpediaList.forEach(result => {
                html += `<div class="search-page-result"><h3><a href="/aetherpedia.html?article=${result.id}">${result.title}</a></h3></div>`;
            });
        } else {
            html += '<p>No matching articles found in Aetherpedia. (Database connection may be pending)</p>';
        }
       
        html += '<h2 style="margin-top: 2rem;">Wikipedia Results</h2>';
        if (wikipediaList.length > 0) {
            wikipediaList.forEach(result => {
                html += `<div class="search-page-result wikipedia-result">
                    <div class="search-page-result-header">
                        <h3><a href="https://en.wikipedia.org/wiki/${result.title.replace(/ /g, '_')}" target="_blank">${result.title}</a></h3>
                        <button class="import-button-page" data-title="${result.title}" title="Import this article">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                             Import
                        </button>
                    </div>
                    <p class="search-page-snippet">${result.snippet ? result.snippet.replace(/<[^>]*>/g, '') + '...' : ''}</p>
                 </div>`;
            });
        } else {
            html += '<p>No matching articles found on Wikipedia for this query.</p>';
        }
        resultsList.innerHTML = html;
    }

    // --- Article Import, Display, & Update --- //
    
    async function handleImportClick(title, buttonElement) {
        buttonElement.disabled = true;
        const originalButtonContent = buttonElement.innerHTML;
        buttonElement.innerHTML = 'Importing...';

        const articleId = title.replace(/ /g, '_');

        try {
            const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json&origin=*`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network error when fetching article.');

            const data = await response.json();
            if (data.error) throw new Error(`Wikipedia API error: ${data.error.info}`);
            if (!data.parse || !data.parse.text) throw new Error('Could not find article content.');

            await db.collection('articles').doc(articleId).set({
                title: title,
                html: data.parse.text,
                importedAt: firebase.firestore.FieldValue.serverTimestamp(),
                source: 'wikipedia',
                sourceTitle: title
            });

            window.location.href = `/aetherpedia.html?article=${articleId}`;

        } catch (error) {
            console.error("Import failed:", error);
            buttonElement.innerHTML = 'Failed!';
            setTimeout(() => { 
                buttonElement.innerHTML = originalButtonContent;
                buttonElement.disabled = false;
            }, 3000);
        }
    }

    async function fetchAndDisplayArticle(articleId) {
        const docRef = db.collection('articles').doc(articleId);
        try {
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                document.title = `${data.title} - Aetherpedia`;
                document.getElementById('firstHeading').innerText = data.title;
                const date = data.importedAt ? new Date(data.importedAt.seconds * 1000).toLocaleDateString() : 'an unknown date';
                document.getElementById('siteSub').innerText = `An article imported from ${data.source || 'Aetherpedia'} on ${date}.`;
                document.querySelector('.wiki-main-content').innerHTML = data.html;

                if (data.source === 'wikipedia') {
                    const contentTabs = document.getElementById('content-tabs').querySelector('ul');
                    if (!document.getElementById('update-article-btn')) {
                        const updateButtonLi = document.createElement('li');
                        updateButtonLi.innerHTML = `<a href="#" id="update-article-btn">Update from Wikipedia</a>`;
                        contentTabs.appendChild(updateButtonLi);
                        
                        document.getElementById('update-article-btn').addEventListener('click', (e) => {
                            e.preventDefault();
                            handleArticleUpdate(data.sourceTitle || data.title, articleId);
                        });
                    }
                }
            } else {
                const contentContainer = document.getElementById('content-container');
                const title = articleId.replace(/_/g, ' ');
                contentContainer.innerHTML = `
                    <h1 class="firstHeading">Article Not Found</h1>
                    <p>The article "${title}" does not exist in Aetherpedia.</p>
                    <button class="import-button-page" data-title="${title}">Import from Wikipedia</button>
                `;
            }
        } catch (error) {
            console.error("Error fetching article:", error);
            document.getElementById('firstHeading').innerText = "Error";
            document.querySelector('.wiki-main-content').innerHTML = "<p>Could not fetch the requested article.</p>";
        }
    }

    async function handleArticleUpdate(title, articleId) {
        const updateBtn = document.getElementById('update-article-btn');
        updateBtn.innerText = "Updating...";
        updateBtn.style.pointerEvents = 'none';

        try {
            const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json&origin=*`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch article from Wikipedia.');
            const data = await response.json();
            if (data.error) throw new Error(`Wikipedia API error: ${data.error.info}`);
            const articleHtml = data.parse.text;

            await db.collection('articles').doc(articleId).update({
                html: articleHtml,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            location.reload();

        } catch (error) {
            console.error("Error updating article:", error);
            updateBtn.innerText = "Update Failed!";
            setTimeout(() => { 
                updateBtn.innerText = "Update from Wikipedia"; 
                updateBtn.style.pointerEvents = 'auto';
            }, 3000);
        }
    }

    // --- Start the App ---
    init();
});
