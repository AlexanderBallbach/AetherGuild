class AuthUI {
    constructor() {
        this.authContainer = null;
        this.isLoginMode = true;
        this.init();
    }

    init() {
        this.createModal();
        this.attachEventListeners();
    }

    createModal() {
        const modalHTML = `
            <div class="auth-modal" id="auth-modal">
                <div class="auth-modal-content">
                    <button class="auth-modal-close" id="auth-modal-close">&times;</button>
                    <form id="auth-form">
                        <h2 id="auth-title">Login</h2>
                        <div class="form-group">
                            <label for="auth-email" class="form-label">Email</label>
                            <input type="email" id="auth-email" class="form-control" required autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="auth-password" class="form-label">Password</label>
                            <input type="password" id="auth-password" class="form-control" required autocomplete="current-password">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width:100%">Login</button>
                        <p id="auth-error" class="error-message" style="display:none;"></p>
                    </form>
                    <div class="auth-toggle-link">
                        <a id="auth-toggle">Need an account? Register</a>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.authContainer = document.getElementById('auth-modal');
    }

    attachEventListeners() {
        document.getElementById('auth-modal-close').addEventListener('click', () => this.hide());
        document.getElementById('auth-toggle').addEventListener('click', () => this.toggleMode());
        document.getElementById('auth-form').addEventListener('submit', (e) => this.handleSubmit(e));
    }

    show() {
        this.clearError();
        this.authContainer.classList.add('is-visible');
    }

    hide() {
        this.authContainer.classList.remove('is-visible');
    }

    toggleMode() {
        this.isLoginMode = !this.isLoginMode;
        const title = document.getElementById('auth-title');
        const button = this.authContainer.querySelector('button[type="submit"]');
        const toggleLink = document.getElementById('auth-toggle');
        
        title.textContent = this.isLoginMode ? 'Login' : 'Register';
        button.textContent = this.isLoginMode ? 'Login' : 'Register';
        toggleLink.textContent = this.isLoginMode ? 'Need an account? Register' : 'Have an account? Login';
        this.clearError();
    }

    handleSubmit(event) {
        event.preventDefault();
        this.clearError();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const auth = firebase.auth();

        if (this.isLoginMode) {
            auth.signInWithEmailAndPassword(email, password)
                .catch(error => this.showError(error.message));
        } else {
            auth.createUserWithEmailAndPassword(email, password)
                .catch(error => this.showError(error.message));
        }
    }

    showError(message) {
        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    clearError() {
        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }
}
