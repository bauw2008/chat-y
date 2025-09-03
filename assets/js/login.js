// assets/js/login.js

class LoginManager {
    constructor() {
        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.autoFocus();
    }

    cacheElements() {
        this.loginForm = document.getElementById('loginForm');
        this.regForm = document.getElementById('regForm');
        this.registerModal = document.getElementById('registerModal');
        this.showRegisterBtn = document.getElementById('showRegister');
        this.closeRegisterBtn = document.getElementById('closeRegister');
        this.loginError = document.getElementById('loginError');
        this.regError = document.getElementById('regError');
    }

    bindEvents() {
        this.showRegisterBtn.addEventListener('click', () => this.showRegisterModal());
        this.closeRegisterBtn.addEventListener('click', () => this.hideRegisterModal());
        this.registerModal.addEventListener('click', (e) => {
            if (e.target === this.registerModal) this.hideRegisterModal();
        });

        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.regForm.addEventListener('submit', (e) => this.handleRegister(e));

        document.addEventListener('keypress', (e) => this.handleKeypress(e));
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    showRegisterModal() {
        this.registerModal.style.display = 'flex';
        this.regError.textContent = '';
        document.getElementById('regUsername').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regUsername').focus();
    }

    hideRegisterModal() {
        this.registerModal.style.display = 'none';
    }

    async handleLogin(e) {
        e.preventDefault();
        this.loginError.textContent = '';
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!this.validateForm(username, password, this.loginError)) return;
        
        const submitBtn = this.loginForm.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, '登录中...');
        
        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);
            
            const res = await fetch('api.php?action=login', {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            
            if (data.status === 'success') {
                this.showSuccessMessage('登录成功，正在跳转...');
                setTimeout(() => {
                    window.location.href = data.redirect || 'chat.php';
                }, 1000);
            } else {
                this.showError(this.loginError, data.message || '用户名或密码错误');
                this.shakeElement(this.loginForm);
            }
        } catch (err) {
            this.showError(this.loginError, '网络错误或服务器异常');
            this.shakeElement(this.loginForm);
        } finally {
            this.setButtonNormal(submitBtn, '登录');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        this.regError.textContent = '';
        
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        
        if (!this.validateForm(username, password, this.regError, true)) return;
        
        const submitBtn = this.regForm.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, '注册中...');
        
        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);
            
            const res = await fetch('api.php?action=register', {
                method: 'POST',
                body: formData
            });
            
            const data = await res.json();
            
            if (data.status === 'ok') {
                this.showSuccessMessage('注册成功，请登录！');
                setTimeout(() => {
                    this.hideRegisterModal();
                    document.getElementById('username').value = username;
                    document.getElementById('password').focus();
                }, 1500);
            } else {
                this.showError(this.regError, data.message || '注册失败，请重试');
                this.shakeElement(this.regForm);
            }
        } catch (err) {
            this.showError(this.regError, '网络错误或服务器异常');
            this.shakeElement(this.regForm);
        } finally {
            this.setButtonNormal(submitBtn, '注册');
        }
    }

    validateForm(username, password, errorElement, isRegister = false) {
        if (!username || !password) {
            this.showError(errorElement, '用户名和密码不能为空');
            return false;
        }
        
        if (isRegister) {
            if (username.length < 3) {
                this.showError(errorElement, '用户名至少3个字符');
                return false;
            }
            
            if (password.length < 3) {
                this.showError(errorElement, '密码至少3个字符');
                return false;
            }
        }
        
        return true;
    }

    handleKeypress(e) {
        if (e.key === 'Enter') {
            const focused = document.activeElement;
            if (focused.form && focused.form.id === 'loginForm') {
                this.loginForm.dispatchEvent(new Event('submit'));
            } else if (focused.form && focused.form.id === 'regForm') {
                this.regForm.dispatchEvent(new Event('submit'));
            }
        }
    }

    handleKeyboardShortcuts(e) {
        // ESC键关闭模态框
        if (e.key === 'Escape' && this.registerModal.style.display === 'flex') {
            this.hideRegisterModal();
        }
        
        // Ctrl+R 聚焦注册按钮
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            this.showRegisterBtn.click();
        }
    }

    autoFocus() {
        document.getElementById('username').focus();
    }

    setButtonLoading(button, text) {
        button.textContent = text;
        button.disabled = true;
        button.style.opacity = '0.7';
    }

    setButtonNormal(button, text) {
        button.textContent = text;
        button.disabled = false;
        button.style.opacity = '1';
    }

    showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
    }

    showSuccessMessage(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #4CAF50;
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 1000;
        `;
        
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
            if (document.body.contains(successDiv)) {
                successDiv.remove();
            }
        }, 3000);
    }

    shakeElement(element) {
        element.style.animation = 'shake 0.5s';
        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new LoginManager();
});