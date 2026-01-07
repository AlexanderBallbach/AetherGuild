class AuthUI {
    constructor() {
        this.authContainer = null;
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
                            <input type="email" id="auth-email" class="form-control" required>
                        </div>
                        <div class="form-group">
                            <label for="auth-password" class="form-label">Password</label>
                            <input type="password" id="auth-password" class="form-control" required>
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
        document.getElementById('auth-toggle').addEventListener('click', (e) => this.toggleMode(e));
    }

    show() {
        this.authContainer.classList.add('is-visible');
    }

    hide() {
        this.authContainer.classList.remove('is-visible');
    }

    toggleMode(event) {
        const isLogin = event.target.textContent.includes('Register');
        const title = document.getElementById('auth-title');
        const button = this.authContainer.querySelector('button[type="submit"]');
        
        title.textContent = isLogin ? 'Register' : 'Login';
        button.textContent = isLogin ? 'Register' : 'Login';
        event.target.textContent = isLogin ? 'Have an account? Login' : 'Need an account? Register';
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
