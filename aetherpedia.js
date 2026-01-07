/**
 * @class Aetherpedia
 * @description Manages the wiki functionality, including fetching articles,
 * searching, and handling the Wikipedia import process.
 */
class Aetherpedia {
    constructor() {
        this.db = null; // Injected by the main AetherAtlas app
        this.wikiContentContainer = document.getElementById('wiki-content');
    }

    // --- Core Article Loading ---

    async loadArticle(articleId = 'Aetherpedia_Home') {
        if (!this.db || !this.wikiContentContainer) return;
        
        const docRef = this.db.collection('articles').doc(articleId);
        try {
            const doc = await docRef.get();
            if (doc.exists) {
                this.renderArticle(doc.data());
            } else {
                this.renderNotFound(articleId);
            }
        } catch (error) {
            console.error("Error fetching article:", error);
            this.renderError("database");
        }
    }

    renderArticle(data) {
        let attribution = `An article from the Aetherpedia archives.`;
        if (data.source === 'wikipedia') {
            const date = data.importedAt ? new Date(data.importedAt.seconds * 1000).toLocaleDateString() : 'an unknown date';
            attribution = `Imported from Wikipedia on ${date}. <a href="https://en.wikipedia.org/wiki/${data.sourceTitle.replace(/ /g, '_')}" target="_blank">View original</a>.`;
        }

        this.wikiContentContainer.innerHTML = `
            <h1 class="firstHeading">${data.title}</h1>
            <div id="siteSub">${attribution}</div>
            <div class="wiki-main-content">${data.html}</div>
            <footer class="wiki-footer">Text is available under the Creative Commons Attribution-ShareAlike License.</footer>
        `;
    }

    renderNotFound(articleId) {
        const title = articleId.replace(/_/g, ' ');
        this.wikiContentContainer.innerHTML = `
            <h1 class="firstHeading">Article Not Found</h1>
            <p>The article "${title}" does not exist in the Aetherpedia archives.</p>
            <button class="btn btn-primary import-button-page" data-title="${title}">
                <i data-feather="download-cloud" style="vertical-align: middle; margin-right: 4px;"></i>
                Import from Wikipedia
            </button>
        `;
        feather.replace();
    }

    renderError(type = "general") {
        const message = type === "database" ? "Could not connect to the database." : "Could not fetch the requested article.";
        this.wikiContentContainer.innerHTML = `<h1 class='firstHeading'>Error</h1><p>${message}</p>`;
    }

    // --- Search Logic (Called by app.js) ---

    async searchAetherpedia(query) {
        const lowerQuery = query.toLowerCase();
        try {
            const articlesSnapshot = await this.db.collection('articles').get();
            const results = [];
            articlesSnapshot.forEach(doc => {
                const title = doc.id.replace(/_/g, ' ');
                if (title.toLowerCase().includes(lowerQuery)) {
                    results.push({ id: doc.id, title: title });
                }
            });
            return results;
        } catch (error) {
            console.error("Error searching Aetherpedia:", error);
            return [];
        }
    }

    async searchWikipedia(query) {
        try {
            const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Wikipedia API error');
            const data = await response.json();
            return data[1].map(title => ({ title: title }));
        } catch (error) {
            console.error("Error searching Wikipedia:", error);
            return [];
        }
    }
    
    // --- Wikipedia Import Logic ---

    async importArticle(title, buttonElement) {
        if (buttonElement) {
            buttonElement.disabled = true;
            buttonElement.innerHTML = 'Importing...';
        }

        const articleId = title.replace(/ /g, '_');
        try {
            const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json&origin=*`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network error fetching from Wikipedia.');

            const data = await response.json();
            if (data.error) throw new Error(`Wikipedia API error: ${data.error.info}`);
            
            const articleData = {
                title: data.parse.title,
                html: this.sanitizeHtml(data.parse.text),
                importedAt: firebase.firestore.FieldValue.serverTimestamp(),
                source: 'wikipedia',
                sourceTitle: title
            };

            await this.db.collection('articles').doc(articleId).set(articleData);
            
            window.app.switchView('wiki');
            this.renderArticle(articleData);

        } catch (error) {
            console.error("Import failed:", error);
            if (buttonElement) buttonElement.innerHTML = 'Failed!';
        }
    }
    
    sanitizeHtml(htmlString) {
        const cleanedHtml = htmlString
            .replace(/<sup class="noprint Inline-Template Template-Fact"[^>]*>\[<i>citation needed<\/i>\]<\/sup>/gi, '')
            .replace(/<span class="mw-editsection"><span class="mw-editsection-bracket">\[<\/span>.*?<span class="mw-editsection-bracket">\]<\/span><\/span>/gi, '');
        return cleanedHtml;
    }
}
