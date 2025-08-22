// assets/js/login.js

document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const loginForm = document.getElementById('loginForm');
    const regForm = document.getElementById('regForm');
    const registerModal = document.getElementById('registerModal');
    const showRegisterBtn = document.getElementById('showRegister');
    const closeRegisterBtn = document.getElementById('closeRegister');
    const loginError = document.getElementById('loginError');
    const regError = document.getElementById('regError');
    
    // 显示注册模态框
    showRegisterBtn.addEventListener('click', function() {
        registerModal.style.display = 'flex';
        regError.textContent = '';
        document.getElementById('regUsername').value = '';
        document.getElementById('regPassword').value = '';
        document.getElementById('regUsername').focus();
    });
    
    // 关闭注册模态框
    closeRegisterBtn.addEventListener('click', function() {
        registerModal.style.display = 'none';
    });
    
    // 点击模态框背景关闭
    registerModal.addEventListener('click', function(e) {
        if (e.target === registerModal) {
            registerModal.style.display = 'none';
        }
    });
    
    // 登录表单提交
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        loginError.textContent = '';
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        // 表单验证
        if (!username || !password) {
            showError(loginError, '用户名和密码不能为空');
            shakeElement(loginForm);
            return;
        }
        
        // 显示加载状态
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        setButtonLoading(submitBtn, '登录中...');
        
        try {
            const res = await fetch('api.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
            });
            
            const data = await res.json();
            
            if (data.status === 'ok') {
                // 登录成功
                showSuccessMessage('登录成功，正在跳转...');
                setTimeout(() => {
                    window.location.href = data.redirect || 'chat.php';
                }, 1000);
            } else {
                // 登录失败
                showError(loginError, data.message || '用户名或密码错误');
                shakeElement(loginForm);
            }
        } catch (err) {
            console.error('登录错误:', err);
            showError(loginError, '网络错误或服务器异常');
            shakeElement(loginForm);
        } finally {
            // 恢复按钮状态
            setButtonNormal(submitBtn, originalText);
        }
    });
    
    // 注册表单提交
    regForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        regError.textContent = '';
        
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        
        // 表单验证
        if (!username || !password) {
            showError(regError, '用户名和密码不能为空');
            shakeElement(regForm);
            return;
        }
        
        if (username.length < 3) {
            showError(regError, '用户名至少3个字符');
            shakeElement(regForm);
            return;
        }
        
        if (password.length < 3) {
            showError(regError, '密码至少3个字符');
            shakeElement(regForm);
            return;
        }
        
        // 显示加载状态
        const submitBtn = regForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        setButtonLoading(submitBtn, '注册中...');
        
        try {
            const res = await fetch('api.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `action=register&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
            });
            
            const data = await res.json();
            
            if (data.status === 'success' || data.status === 'ok') {
                // 注册成功
                showSuccessMessage('注册成功，请登录！');
                setTimeout(() => {
                    registerModal.style.display = 'none';
                    document.getElementById('username').value = username;
                    document.getElementById('password').focus();
                }, 1500);
            } else if (data.status === 'exists') {
                showError(regError, '用户名已存在');
                shakeElement(regForm);
            } else {
                showError(regError, data.message || '注册失败，请重试');
                shakeElement(regForm);
            }
        } catch (err) {
            console.error('注册错误:', err);
            showError(regError, '网络错误或服务器异常');
            shakeElement(regForm);
        } finally {
            // 恢复按钮状态
            setButtonNormal(submitBtn, originalText);
        }
    });
    
    // 自动聚焦用户名输入框
    document.getElementById('username').focus();
    
    // 回车键快捷提交
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const focused = document.activeElement;
            if (focused.form && focused.form.id === 'loginForm') {
                loginForm.dispatchEvent(new Event('submit'));
            } else if (focused.form && focused.form.id === 'regForm') {
                regForm.dispatchEvent(new Event('submit'));
            }
        }
    });
    
    // 检查会话状态
    checkSessionStatus();
});

// 检查用户是否已登录
async function checkSessionStatus() {
    try {
        const res = await fetch('api.php?action=get_user_info');
        const data = await res.json();
        
        if (data.status === 'ok') {
            // 用户已登录，直接跳转到聊天室
            window.location.href = 'chat.php';
        }
    } catch (error) {
        // 会话检查失败，继续显示登录页面
        console.log('会话检查失败，继续显示登录页面');
    }
}

// 显示错误消息
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
}

// 设置按钮加载状态
function setButtonLoading(button, text) {
    button.textContent = text;
    button.disabled = true;
    button.style.opacity = '0.7';
    button.classList.add('loading');
}

// 恢复按钮正常状态
function setButtonNormal(button, text) {
    button.textContent = text;
    button.disabled = false;
    button.style.opacity = '1';
    button.classList.remove('loading');
}

// 显示成功消息
function showSuccessMessage(message) {
    // 移除现有的成功消息
    const existingMessage = document.querySelector('.success-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    document.body.appendChild(successDiv);
    
    // 3秒后移除消息
    setTimeout(() => {
        if (document.body.contains(successDiv)) {
            successDiv.remove();
        }
    }, 3000);
}

// 表单抖动效果
function shakeElement(element) {
    element.style.animation = 'shake 0.5s';
    
    // 动画结束后移除样式
    setTimeout(() => {
        element.style.animation = '';
    }, 500);
}

// 输入框实时验证
document.addEventListener('DOMContentLoaded', function() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const regUsernameInput = document.getElementById('regUsername');
    const regPasswordInput = document.getElementById('regPassword');
    
    // 登录表单实时验证
    if (usernameInput && passwordInput) {
        [usernameInput, passwordInput].forEach(input => {
            input.addEventListener('input', function() {
                document.getElementById('loginError').textContent = '';
            });
        });
    }
    
    // 注册表单实时验证
    if (regUsernameInput && regPasswordInput) {
        [regUsernameInput, regPasswordInput].forEach(input => {
            input.addEventListener('input', function() {
                document.getElementById('regError').textContent = '';
            });
        });
        
        // 用户名长度实时提示
        regUsernameInput.addEventListener('input', function() {
            const value = this.value.trim();
            if (value.length > 0 && value.length < 3) {
                document.getElementById('regError').textContent = '用户名至少3个字符';
            } else {
                document.getElementById('regError').textContent = '';
            }
        });
        
        // 密码长度实时提示
        regPasswordInput.addEventListener('input', function() {
            const value = this.value.trim();
            if (value.length > 0 && value.length < 3) {
                document.getElementById('regError').textContent = '密码至少3个字符';
            } else {
                document.getElementById('regError').textContent = '';
            }
        });
    }
});

// 添加键盘快捷键
document.addEventListener('keydown', function(e) {
    // ESC键关闭模态框
    if (e.key === 'Escape') {
        const modal = document.getElementById('registerModal');
        if (modal && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    }
    
    // Ctrl+R 聚焦注册按钮
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        const showRegisterBtn = document.getElementById('showRegister');
        if (showRegisterBtn) {
            showRegisterBtn.click();
        }
    }
});