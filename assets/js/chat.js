// assets/js/chat.js

// ==================== 全局变量和配置 ====================
let lastMessageId = 0;
let isTyping = false;
let typingTimer = null;
let heartbeatInterval;
let isScrolledToBottom = true;
let autoScrollEnabled = true;

// 表情列表
const emojis = ['😀','😂','😍','👍','🙏','😢','🎉','💯','❤️','🔥','✨','🎯','🤔','😴','🥳'];

// ==================== 私聊功能 ====================

// 初始化私聊功能
function initPrivateChat() {
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    
    console.log('初始化私聊功能，目标用户:', window.chatConfig.targetUser);
    
    // 设置事件监听器
    setupPrivateEventListeners();
    
    // 初始化UI组件
    renderPrivateEmojis();
    
    // 开始获取消息和状态
    fetchPrivateMessages();
    checkPrivateUserStatus();
    
    // 设置定时器
    setInterval(fetchPrivateMessages, 2000);
    setInterval(checkPrivateUserStatus, 5000);
    
    // 启动心跳
    startHeartbeat();
}

// 设置私聊事件监听器
function setupPrivateEventListeners() {
    // 消息发送
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', sendPrivateMessage);
    }
    
    // 输入框事件
    const messageInput = document.getElementById('message');
    if (messageInput) {
        messageInput.addEventListener('input', handleTyping);
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatForm) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
            }
        });
        messageInput.focus();
    }
}

// 渲染私聊表情面板
function renderPrivateEmojis() {
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    
    const panel = document.getElementById('emoji-panel');
    if (!panel) return;
    
    panel.innerHTML = '';
    window.chatConfig.emojis.forEach(e => {
        const div = document.createElement('div');
        div.className = 'emoji-item';
        div.textContent = e;
        div.onclick = () => {
            const messageInput = document.getElementById('message');
            if (messageInput) {
                messageInput.value += e;
                panel.style.display = 'none';
                messageInput.focus();
            }
        };
        panel.appendChild(div);
    });
}

// 获取私聊消息
async function fetchPrivateMessages() {
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    
    try {
        const res = await fetch(`api.php?action=get_private_messages&target_user=${encodeURIComponent(window.chatConfig.targetUser)}`);
        const data = await res.json();
        if (data.status === 'ok') {
            renderPrivateMessages(data.messages);
        }
    } catch (e) {
        console.error('获取私聊消息失败:', e);
    }
}

// 渲染私聊消息
// 渲染私聊消息（统一处理文件格式）
function renderPrivateMessages(messages) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;
    
    messages.forEach(msg => {
        if (msg.id <= lastMessageId) return;
        
        const div = document.createElement('div');
        const isMe = msg.sender === window.chatConfig.currentUser;
        div.className = `message ${isMe ? 'me' : 'other'} ${msg.is_read === 0 && !isMe ? 'unread' : ''}`;
        
        const avatar = `https://api.dicebear.com/6.x/pixel-art/svg?seed=${encodeURIComponent(msg.sender)}`;
        
        let content = '';
        let isImageMessage = false;

        // 统一处理消息内容
        if (msg.type === 'file') {
            try {
                // 解析JSON格式的文件信息
                const fileInfo = JSON.parse(msg.message);
                if (fileInfo.type === 'image') {
                    isImageMessage = true;
                    content = `<img src="uploads/${escapeHtml(fileInfo.saved_name)}" class="chat-img file-preview" alt="${escapeHtml(fileInfo.filename)}" onclick="previewImage(this)">`;
                } else {
                    content = `<a href="uploads/${escapeHtml(fileInfo.saved_name)}" target="_blank" class="chat-file">${escapeHtml(fileInfo.filename)}</a>`;
                }
            } catch (e) {
                // 如果解析失败，可能是旧格式的直接路径
                console.warn('文件信息解析失败，尝试旧格式:', e);
                if (msg.message.includes('uploads/')) {
                    // 假设是图片
                    content = `<img src="${msg.message}" class="chat-img" onclick="previewImage(this)">`;
                } else {
                    content = `<a href="${msg.message}" target="_blank" class="chat-file">下载文件</a>`;
                }
            }
        } else if (msg.type === 'image') {
            // 处理旧的直接图片链接格式
            content = `<img src="${msg.message}" class="chat-img" onclick="previewImage(this)">`;
        } else {
            // 普通文本消息
            content = escapeHtml(msg.message).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        }

        const deleteBtn = isMe ? 
            `<span class="delete-msg-btn" title="删除消息" onclick="deletePrivateMessage(${msg.id}, this)">🗑️</span>` : '';
        
        const time = formatMessageTime(msg.created_at);

        div.innerHTML = `
            <div class="bubble">
                <div class="msg-header">
                    <img src="${avatar}" class="message-avatar" alt="${escapeHtml(msg.sender)}">
                    <span>${escapeHtml(msg.sender)}</span>
                    ${deleteBtn}
                </div>
                <div class="message-content ${isImageMessage ? 'image-message' : ''}">
                    ${content}
                </div>
                <div class="message-time">${time}</div>
            </div>`;
        
        chatBox.appendChild(div);
        lastMessageId = Math.max(lastMessageId, msg.id);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 发送私聊消息
async function sendPrivateMessage(e) {
    e.preventDefault();
    
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    
    const msgInput = document.getElementById('message');
    if (!msgInput) return;
    
    const msg = msgInput.value.trim();
    if (!msg) return;
    
    const btn = document.querySelector('.send-btn');
    const originalText = btn.textContent;
    
    setButtonLoading(btn, '发送中...');
    
    try {
        const form = new URLSearchParams({
            action: 'send_private_message',
            receiver: window.chatConfig.targetUser,
            message: msg,
            type: 'text'
        });
        
        const res = await fetch('api.php', {
            method: 'POST',
            body: form
        });
        
        const data = await res.json();
        if (data.status === 'ok') {
            msgInput.value = '';
            fetchPrivateMessages();
            stopTyping();
            showToast('消息发送成功', 'success');
        } else {
            showToast('发送失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (e) {
        console.error('发送私聊消息失败:', e);
        showToast('网络错误，发送失败', 'error');
    }
    
    setButtonNormal(btn, originalText);
}

// 删除私聊消息
async function deletePrivateMessage(messageId, btnElement) {
    if (!confirm('确认删除这条消息吗？')) return;
    
    try {
        const form = new URLSearchParams({
            action: 'delete_private_message',
            message_id: messageId
        });
        
        const res = await fetch('api.php', {
            method: 'POST',
            body: form
        });
        
        const data = await res.json();
        if (data.status === 'ok') {
            btnElement.closest('.message').remove();
            showToast('消息已删除', 'success');
        } else {
            showToast('删除失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (e) {
        console.error('删除私聊消息失败:', e);
        showToast('网络错误，删除失败', 'error');
    }
}

// 清空私聊历史
async function deletePrivateChatHistory() {
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    
    try {
        const form = new URLSearchParams({
            action: 'delete_private_chat_history',
            target_user: window.chatConfig.targetUser
        });
        
        const res = await fetch('api.php', {
            method: 'POST',
            body: form
        });
        
        const data = await res.json();
        if (data.status === 'ok') {
            document.getElementById('chat-box').innerHTML = '';
            lastMessageId = 0;
            showToast('聊天记录已删除', 'success');
        } else {
            showToast('删除失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (e) {
        console.error('清空私聊历史失败:', e);
        showToast('网络错误，删除失败', 'error');
    }
}

// 检查私聊用户状态
async function checkPrivateUserStatus() {
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    
    try {
        const res = await fetch('api.php?action=get_users');
        const data = await res.json();
        
        if (data.status === 'ok') {
            const user = data.users.find(u => u.username === window.chatConfig.targetUser);
            const statusElement = document.getElementById('user-status');
            
            if (user && statusElement) {
                const online = user.online;
                statusElement.textContent = online ? '🟢 在线' : '⚫ 离线';
                statusElement.style.color = online ? '#27ae60' : '#95a5a6';
                
                document.title = online ? 
                    `💬 与 ${window.chatConfig.targetUser} 私聊（在线）` :
                    `💬 与 ${window.chatConfig.targetUser} 私聊（离线）`;
            }
        }
    } catch (e) {
        console.error('检查私聊用户状态失败:', e);
    }
}

// ==================== 公共聊天功能 ====================

// 用户状态调试函数
function debugUserStatus(users) {
    console.group('🐛 用户状态调试');
    console.table(users.map(user => ({
        用户名: user.username,
        在线状态: user.online ? '🟢 在线' : '🔴 离线',
        最后活动: user.last_active || '无记录',
        角色: user.role
    })));
    console.groupEnd();
}

// 聊天室前端逻辑
function startHeartbeat() {
    // 每30秒发送一次心跳
    heartbeatInterval = setInterval(async () => {
        try {
            await fetch('api.php?action=heartbeat');
        } catch (error) {
            console.error('心跳检测失败:', error);
        }
    }, 30000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
}

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否在私聊页面
    const isPrivatePage = document.querySelector('.private-chat-container') !== null;
    
    if (isPrivatePage) {
        // 私聊页面有专门的初始化代码
        console.log('检测到私聊页面，跳过公共聊天初始化');
        return;
    }
    
    console.log('初始化公共聊天功能');
    
    // 公共聊天页面初始化 - 只调用 initializeChat，setupEventListeners 已经在其中
    initializeChat();
    setupKeyboardShortcuts();
    startHeartbeat();
});

// 在页面卸载时停止心跳
window.addEventListener('beforeunload', stopHeartbeat);

// 初始化聊天室
function initializeChat() {
    renderEmojis();
    fetchUserInfo();
    fetchMessages();
    fetchUsers();
    
    // 设置事件监听器 - 确保只在这里调用
    setupEventListeners();
    
    // 设置定时刷新
    setInterval(fetchMessages, 3000);
    setInterval(fetchUsers, 5000);
    setInterval(updateMessageTimes, 60000);
    setInterval(checkUnreadPrivateMessages, 10000);
    
    // 添加滚动到顶部按钮
    createScrollToTopButton();
    
    // 监听滚动事件
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        chatBox.addEventListener('scroll', handleChatScroll);
    }
    
    // 设置私聊功能
    setupPrivateChat();
}

// 设置事件监听器
function setupEventListeners() {
    // 消息发送表单
    const chatForm = document.getElementById('chat-form');
    if (chatForm && !chatForm.hasAttribute('data-listener-added')) {
        chatForm.setAttribute('data-listener-added', 'true');
        chatForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // 根据页面类型调用不同的发送函数
            if (window.chatConfig && window.chatConfig.isPrivateChat) {
                sendPrivateMessage(e);
            } else {
                sendMessage(e);
            }
        });
    }
    
    // 退出登录
    const logoutIcon = document.getElementById('logout-icon');
    if (logoutIcon && !logoutIcon.hasAttribute('data-listener-added')) {
        logoutIcon.setAttribute('data-listener-added', 'true');
        logoutIcon.addEventListener('click', logout);
    }
    
    // 管理员功能
    if (role === 'admin') {
        setupAdminFeatures();
    }
    
    // 表情点击 - 使用事件委托，不需要重复绑定
    if (!document.hasAttribute('data-emoji-listener-added')) {
        document.setAttribute('data-emoji-listener-added', 'true');
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('emoji')) {
                const messageInput = document.getElementById('message');
                if (messageInput) {
                    messageInput.value += e.target.textContent;
                    messageInput.focus();
                }
            }
        });
    }
    
    // 输入框按键事件
    const messageInput = document.getElementById('message');
    if (messageInput && !messageInput.hasAttribute('data-listener-added')) {
        messageInput.setAttribute('data-listener-added', 'true');
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const chatForm = document.getElementById('chat-form');
                if (chatForm) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
            }
        });
    }
}

// 设置管理员功能
function setupAdminFeatures() {
    const adminMenu = document.getElementById('admin-menu');
    const clearChatBtn = document.getElementById('clear-chat');
    const manageUsersBtn = document.getElementById('manage-users');
    const deleteUserBtn = document.getElementById('delete-user');
    
    if (adminMenu) adminMenu.addEventListener('click', toggleAdminPopup);
    if (clearChatBtn) clearChatBtn.addEventListener('click', clearChat);
    if (manageUsersBtn) manageUsersBtn.addEventListener('click', toggleUserManagement);
    if (deleteUserBtn) deleteUserBtn.addEventListener('click', deleteUser);
    
    // 点击外部关闭管理员弹窗
    document.addEventListener('click', function(e) {
        const adminPopup = document.getElementById('admin-popup');
        if (adminPopup && adminPopup.style.display === 'block' &&
            !adminPopup.contains(e.target)) {
            const adminMenu = document.getElementById('admin-menu');
            if (e.target !== adminMenu) {
                adminPopup.style.display = 'none';
            }
        }
    });
}

// 设置私聊功能
function setupPrivateChat() {
    const usersContainer = document.getElementById('users');
    if (!usersContainer) return;
    
    usersContainer.addEventListener('click', function(e) {
        const userItem = e.target.closest('.user-item');
        if (!userItem) return;
        
        // 找到用户名
        const usernameElement = userItem.querySelector('.user-info span');
        if (usernameElement) {
            const username = usernameElement.textContent.trim();
            if (username && username !== window.username) {
                openPrivateChat(username);
            }
        }
    });
}

// 设置键盘快捷键
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl+Enter 发送消息
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            const chatForm = document.getElementById('chat-form');
            if (chatForm) {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
        
        // ESC 关闭管理员弹窗
        if (e.key === 'Escape') {
            const adminPopup = document.getElementById('admin-popup');
            if (adminPopup && adminPopup.style.display === 'block') {
                adminPopup.style.display = 'none';
            }
            
            const privateModal = document.getElementById('private-chat-modal');
            if (privateModal) {
                privateModal.remove();
            }
        }
    });
}

// 渲染表情
function renderEmojis() {
    const emojiPanel = document.getElementById('emoji-panel');
    if (!emojiPanel) return;
    
    emojiPanel.innerHTML = '';
    
    emojis.forEach(e => {
        const span = document.createElement('span');
        span.className = 'emoji';
        span.textContent = e;
        span.title = '点击添加表情';
        emojiPanel.appendChild(span);
    });
}

// 获取用户信息
async function fetchUserInfo() {
    try {
        const res = await fetch('api.php?action=get_user_info');
        const data = await res.json();
        if (data.status === 'ok') {
            // 只是更新当前用户信息，不用于状态显示
            console.log('当前用户信息:', data.user);
        }
    } catch (error) {
        console.error('获取用户信息失败:', error);
    }
}

// 获取消息
async function fetchMessages() {
    try {
        const res = await fetch('api.php?action=get_messages');
        const data = await res.json();
        const chatBox = document.getElementById('chat-box');
        
        if (!chatBox) return;
        
        if (data.status === 'ok') {
            // 检查是否有新消息
            const currentMessageCount = chatBox.querySelectorAll('.message').length;
            if (currentMessageCount !== data.messages.length) {
                renderMessages(data.messages);
                
                // 如果用户正在查看最新消息，自动滚动到底部
                if (autoScrollEnabled && isScrolledToBottom) {
                    scrollToBottom();
                }
            }
        }
    } catch (error) {
        console.error('获取消息失败:', error);
        showToast('获取消息失败', 'error');
    }
}

// 渲染消息
function renderMessages(messages) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;
    
    chatBox.innerHTML = '';
    
    messages.forEach(msg => {
        const messageElement = createMessageElement(msg);
        chatBox.appendChild(messageElement);
    });
    
    // 添加时间分隔线
    addTimeSeparators();
}

// 创建消息元素
function createMessageElement(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.username === username ? 'me' : 'other'}`;
    div.dataset.messageId = msg.id;
    div.dataset.timestamp = new Date(msg.created_at).getTime();
    
    const avatarUrl = `https://api.dicebear.com/6.x/pixel-art/svg?seed=${encodeURIComponent(msg.username)}`;
    let content = escapeHtml(msg.message);
    
    // 检测链接
    content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    
    if (msg.type === 'image') {
        content = `<img src="${escapeHtml(msg.message)}" class="chat-img" alt="图片消息">`;
    }
    
    const time = formatMessageTime(msg.created_at);
  
    // 删除按钮（只给自己发送的消息）
    let deleteBtn = '';
    if(msg.username === username){
        deleteBtn = `<span class="delete-msg-btn" title="删除消息" onclick="deleteMessage(${msg.id}, this)">🗑️</span>`;
    }
    
    div.innerHTML = `
        <div class="bubble">
            <div class="msg-header">
                <img src="${avatarUrl}" class="message-avatar" alt="${escapeHtml(msg.username)}">
                <span>${escapeHtml(msg.username)}</span>
                  ${deleteBtn}
            </div>
            <div class="message-content">${content}</div>
            <div class="message-time">${time}</div>
        </div>
    `;
    
    return div;
}

// 删除主窗口聊天个人信息
async function deleteMessage(messageId, el) {
    if (!confirm('确定删除这条消息吗？')) return;

    try {
        const form = new URLSearchParams();
        form.append('action', 'delete_message'); 
        form.append('message_id', messageId);

        const res = await fetch('api.php', {
            method: 'POST',
            body: form
        });

        const data = await res.json();
        if (data.status === 'ok') {
            // 删除DOM节点
            const msgDiv = el.closest('.message');
            if (msgDiv) msgDiv.remove();
        } else {
            alert('删除失败: ' + data.message);
        }
    } catch (e) {
        console.error(e);
        alert('删除消息请求失败');
    }
}

// 发送消息
// 发送消息（公共聊天）
async function sendMessage(e) {
    e.preventDefault();
    const msgInput = document.getElementById('message');
    if (!msgInput) return;
    
    const msg = msgInput.value.trim();
    if (!msg) return;
    
    try {
        const form = new URLSearchParams({
            action: 'send_message',
            message: msg
        });
        
        // 显示发送状态
        const sendBtn = document.querySelector('.send-btn');
        if (sendBtn) {
            const originalText = sendBtn.textContent;
            setButtonLoading(sendBtn, '发送中...');
            
            const response = await fetch('api.php', {
                method: 'POST',
                body: form
            });
            
            const data = await response.json();
            
            if (data.status === 'ok') {
                msgInput.value = '';
                fetchMessages(); // 重新获取消息更新界面
                showToast('消息发送成功', 'success');
            } else {
                showToast('发送失败: ' + (data.message || '未知错误'), 'error');
            }
            
            setButtonNormal(sendBtn, originalText);
        }
    } catch (error) {
        console.error('发送消息失败:', error);
        showToast('网络错误，发送失败', 'error');
        
        // 恢复按钮状态
        const sendBtn = document.querySelector('.send-btn');
        if (sendBtn) {
            setButtonNormal(sendBtn, '发送');
        }
    }
}

// 获取在线用户
async function fetchUsers() {
    try {
        const res = await fetch('api.php?action=get_users');
        const data = await res.json();
        const container = document.getElementById('users');
        
        if (!container) return;
        
        if (data.status === 'ok') {
            container.innerHTML = '';
            data.users.forEach(u => {
                const userElement = createUserElement(u);
                container.appendChild(userElement);
            });
            
            // 更新用户状态显示
            updateUsersStatusDisplay(data.users);
        }
    } catch (error) {
        console.error('获取用户列表失败:', error);
    }
}

// 更新用户状态显示
function updateUsersStatusDisplay(users) {
    const userItems = document.querySelectorAll('.user-item');
    
    userItems.forEach(item => {
        const usernameElement = item.querySelector('.user-info span');
        if (usernameElement) {
            const username = usernameElement.textContent.trim();
            const user = users.find(u => u.username === username);
            
            if (user) {
                // 更新在线状态
                item.classList.toggle('online', user.online);
                
                // 更新状态指示器
                const statusIndicator = item.querySelector('.user-status');
                if (statusIndicator) {
                    statusIndicator.style.background = user.online ? '#2ecc71' : '#95a5a6';
                    statusIndicator.title = user.online ? '在线' : '离线';
                }
                
                // 更新私聊图标显示
                const chatIcon = item.querySelector('.private-chat-icon');
                if (chatIcon) {
                    chatIcon.style.display = user.online ? 'block' : 'none';
                }
            }
        }
    });
}

// 创建用户元素
function createUserElement(user) {
    const div = document.createElement('div');
    div.className = `user-item ${user.online ? 'online' : ''}`;
    div.title = `${user.username} (${user.role}) - ${user.online ? '在线' : '离线'}`;
    
    const avatarUrl = `https://api.dicebear.com/6.x/pixel-art/svg?seed=${encodeURIComponent(user.username)}`;
    
    div.innerHTML = `
        <div class="user-info">
            <div class="user-avatar">
                <img src="${avatarUrl}" alt="${escapeHtml(user.username)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzYiIGhlaWdodD0iMzYiIHZpZXdCb3g9IjAgMCAzNiAzNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjM2IiBmaWxsPSIjNGE2YmRmIi8+Cjx0ZXh0IHg9IjE4IiB5PSIyMCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+${user.username.charAt(0).toUpperCase()}</dGV4dD4KPC9zdmc+'">
            </div>
            <span>${escapeHtml(user.username)}</span>
            ${user.role !== 'user' ?
                `<span class="user-role" title="${user.role}">${user.role === 'admin' ? '👑' : '⭐'}</span>` :
                ''
            }
        </div>
        <div class="user-status" style="background: ${user.online ? '#2ecc71' : '#95a5a6'}" title="${user.online ? '在线' : '离线'}"></div>
    `;
    
    // 添加私聊功能（只对在线用户且不是自己）
    if (user.username !== username) {
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => {
            if (user.online) {
                openPrivateChat(user.username);
            } else {
                showToast('该用户当前离线', 'warning');
            }
        });
        
        // 添加私聊图标提示（只在用户在线时显示）
        if (user.online) {
            const chatIcon = document.createElement('span');
            chatIcon.className = 'private-chat-icon';
            chatIcon.textContent = '💬';
            chatIcon.style.cssText = `
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                opacity: 0.6;
                transition: opacity 0.2s;
                font-size: 14px;
            `;
            div.appendChild(chatIcon);
            
            div.addEventListener('mouseenter', () => {
                chatIcon.style.opacity = '1';
            });
            
            div.addEventListener('mouseleave', () => {
                chatIcon.style.opacity = '0.6';
            });
        }
    }
    
    return div;
}

// 打开私聊窗口
function openPrivateChat(username) {
    window.open(`private_chat.php?user=${encodeURIComponent(username)}`, '_blank',
        'width=600,height=700,menubar=no,toolbar=no,location=no,status=no');
}

// 检查未读私聊消息
async function checkUnreadPrivateMessages() {
    try {
        const response = await fetch('api.php?action=get_unread_private_count');
        const data = await response.json();
        
        if (data.status === 'ok') {
            if (data.unread_count > 0) {
                showUnreadBadge(data.unread_count);
            } else {
                hideUnreadBadge();
            }
        }
    } catch (error) {
        console.error('检查未读消息失败:', error);
    }
}

// 显示未读消息徽章
function showUnreadBadge(count) {
    let badge = document.getElementById('unread-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'unread-badge';
        badge.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #e74c3c;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        badge.title = '未读私聊消息';
        badge.addEventListener('click', showPrivateChatList);
        document.body.appendChild(badge);
    }
    badge.textContent = count > 9 ? '9+' : count;
}

function hideUnreadBadge() {
    const badge = document.getElementById('unread-badge');
    if (badge) {
        badge.remove();
    }
}

// 显示私聊列表
async function showPrivateChatList() {
    try {
        const response = await fetch('api.php?action=get_private_chat_users');
        const data = await response.json();
        
        if (data.status === 'ok') {
            createPrivateChatModal(data.chat_users);
        }
    } catch (error) {
        console.error('获取私聊列表失败:', error);
        showToast('获取私聊列表失败', 'error');
    }
}

// 创建私聊模态框
function createPrivateChatModal(chatUsers) {
    // 移除现有的模态框
    const existingModal = document.getElementById('private-chat-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'private-chat-modal';
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        padding: 20px;
        z-index: 1001;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        min-width: 300px;
        max-width: 90%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    `;
    
    modal.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 18px;">私聊会话</h3>
        <div style="flex: 1; overflow-y: auto; margin-bottom: 15px;">
            <div id="private-chat-list"></div>
        </div>
        <div style="text-align: center;">
            <button onclick="document.getElementById('private-chat-modal').remove()"
                    style="padding: 8px 20px; background: #95a5a6; color: white; border: none; border-radius: 6px; cursor: pointer;">
                关闭
            </button>
        </div>
    `;
    
    const chatList = modal.querySelector('#private-chat-list');
    
    if (chatUsers.length === 0) {
        chatList.innerHTML = '<p style="text-align: center; color: #95a5a6; padding: 20px;">暂无私聊会话</p>';
    } else {
        chatUsers.forEach(user => {
            const userElement = document.createElement('div');
            userElement.style.cssText = `
                padding: 12px;
                margin: 8px 0;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                border: 1px solid #e9ecef;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            
            userElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
                         display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                        ${user.chat_user.charAt(0).toUpperCase()}
                    </div>
                    <span style="font-weight: 500;">${escapeHtml(user.chat_user)}</span>
                </div>
                <small style="color: #95a5a6;">${formatMessageTime(user.last_message_time)}</small>
            `;
            
            userElement.addEventListener('click', () => {
                openPrivateChat(user.chat_user);
                modal.remove();
            });
            
            userElement.addEventListener('mouseenter', () => {
                userElement.style.background = '#f8f9fa';
                userElement.style.borderColor = '#3498db';
            });
            
            userElement.addEventListener('mouseleave', () => {
                userElement.style.background = 'white';
                userElement.style.borderColor = '#e9ecef';
            });
            
            chatList.appendChild(userElement);
        });
    }
    
    document.body.appendChild(modal);
    
    // 点击外部关闭
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 1000;
    `;
    overlay.id = 'modal-overlay';
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', () => {
        modal.remove();
        overlay.remove();
    });
}

// 退出登录
async function logout() {
    if (!confirm('确定要退出登录吗？')) return;
    
    try {
        const response = await fetch('api.php?action=logout');
        const data = await response.json();
        
        if (data.status === 'ok') {
            showToast('已退出登录', 'success');
            setTimeout(() => {
                window.location.href = 'login.php';
            }, 1000);
        } else {
            showToast('退出失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('退出失败:', error);
        showToast('网络错误，退出失败', 'error');
    }
}

// 管理员功能
function toggleAdminPopup() {
    const popup = document.getElementById('admin-popup');
    if (popup) {
        popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
    }
}

async function clearChat() {
    if (role !== 'admin') return;
    
    if (!confirm('确定要清空所有聊天记录吗？此操作不可恢复！')) return;
    
    try {
        const response = await fetch('api.php', {
            method: 'POST',
            body: new URLSearchParams({ action: 'clear_messages' })
        });
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            showToast('聊天记录已清理', 'success');
            fetchMessages();
        } else {
            showToast('清理失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('清理聊天记录失败:', error);
        showToast('网络错误，清理失败', 'error');
    }
}

function toggleUserManagement() {
    const userManagement = document.getElementById('user-management');
    if (userManagement) {
        userManagement.style.display = userManagement.style.display === 'block' ? 'none' : 'block';
        
        if (userManagement.style.display === 'block') {
            loadDeletableUsers();
        }
    }
}

async function loadDeletableUsers() {
    try {
        const response = await fetch('api.php?action=get_deletable_users');
        const data = await response.json();
        
        if (data.status === 'ok') {
            const userSelect = document.getElementById('user-select');
            if (userSelect) {
                userSelect.innerHTML = '<option value="">选择用户...</option>';
                
                data.users.forEach(username => {
                    const option = document.createElement('option');
                    option.value = username;
                    option.textContent = username;
                    userSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
        showToast('加载用户列表失败', 'error');
    }
}

async function deleteUser() {
    if (role !== 'admin') return;
    
    const userSelect = document.getElementById('user-select');
    if (!userSelect) return;
    
    const usernameToDelete = userSelect.value;
    
    if (!usernameToDelete) {
        showToast('请选择要删除的用户', 'warning');
        return;
    }
    
    if (!confirm(`确定要删除用户 "${usernameToDelete}" 吗？此操作不可恢复！`)) return;
    
    try {
        const form = new URLSearchParams({
            action: 'delete_user',
            username: usernameToDelete
        });
        
        const response = await fetch('api.php', {
            method: 'POST',
            body: form
        });
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            showToast(`用户 ${usernameToDelete} 已删除`, 'success');
            loadDeletableUsers();
            fetchUsers();
        } else {
            showToast('删除失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('删除用户失败:', error);
        showToast('网络错误，删除失败', 'error');
    }
}

// ==================== 工具函数 ====================

function handleTyping() {
    if (!isTyping) isTyping = true;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 1000);
}

function stopTyping() {
    isTyping = false;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMessageTime(timestamp) {
    const now = new Date();
    const messageTime = new Date(timestamp);
    const diff = now - messageTime;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
    return messageTime.toLocaleDateString();
}

function updateMessageTimes() {
    const messages = document.querySelectorAll('.message');
    messages.forEach(msg => {
        const timeElement = msg.querySelector('.message-time');
        if (timeElement) {
            const timestamp = msg.dataset.timestamp;
            timeElement.textContent = formatMessageTime(parseInt(timestamp));
        }
    });
}

function handleChatScroll() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;
    
    const scrollTop = chatBox.scrollTop;
    const scrollHeight = chatBox.scrollHeight;
    const clientHeight = chatBox.clientHeight;
    
    isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    // 显示/隐藏滚动到顶部按钮
    const scrollToTopBtn = document.querySelector('.scroll-to-top');
    if (scrollToTopBtn) {
        scrollToTopBtn.style.display = scrollTop > 200 ? 'flex' : 'none';
    }
}

function createScrollToTopButton() {
    const btn = document.createElement('div');
    btn.className = 'scroll-to-top';
    btn.innerHTML = '↑';
    btn.title = '滚动到顶部';
    btn.style.display = 'none';
    
    btn.addEventListener('click', () => {
        const chatBox = document.getElementById('chat-box');
        if (chatBox) {
            chatBox.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    
    document.body.appendChild(btn);
}

function scrollToBottom() {
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
    }
}

function showToast(message, type = 'info') {
    // 移除现有的toast
    const existingToasts = document.querySelectorAll('.toast');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '6px',
        zIndex: '10000',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        animation: 'fadeIn 0.3s ease'
    });
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }
    }, 3000);
}

function setButtonLoading(button, text) {
    button.textContent = text;
    button.disabled = true;
}

function setButtonNormal(button, text) {
    button.textContent = text;
    button.disabled = false;
}

function addTimeSeparators() {
    // 实现时间分隔线功能
    const messages = document.querySelectorAll('.message');
    let lastDate = null;
    
    messages.forEach(msg => {
        const timestamp = parseInt(msg.dataset.timestamp);
        const messageDate = new Date(timestamp).toDateString();
        
        if (messageDate !== lastDate) {
            const separator = document.createElement('div');
            separator.className = 'time-separator';
            separator.textContent = new Date(timestamp).toLocaleDateString();
            separator.style.cssText = `
                text-align: center;
                margin: 20px 0;
                color: #95a5a6;
                font-size: 12px;
                font-weight: 500;
                background: #f8f9fa;
                padding: 5px 10px;
                border-radius: 10px;
                display: inline-block;
            `;
            
            const container = document.createElement('div');
            container.style.textAlign = 'center';
            container.appendChild(separator);
            
            msg.parentNode.insertBefore(container, msg);
            lastDate = messageDate;
        }
    });
}

// 图片处理
function createMessageElement(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.username === username ? 'me' : 'other'}`;
    div.dataset.messageId = msg.id;
    div.dataset.timestamp = new Date(msg.created_at).getTime();

    const avatarUrl = `https://api.dicebear.com/6.x/pixel-art/svg?seed=${encodeURIComponent(msg.username)}`;
    let content = '';
    let isImageMessage = false; // ✅ 用来标记是否是图片消息

    // 处理消息类型
    if (msg.type === 'file') {
        try {
            const fileInfo = JSON.parse(msg.message);
            if (fileInfo.type === 'image') {
                isImageMessage = true;
                content = `<img src="uploads/${escapeHtml(fileInfo.saved_name)}" class="chat-img file-preview" alt="${escapeHtml(fileInfo.filename)}" onclick="previewImage(this)">`;
            } else {
                content = `<a href="uploads/${escapeHtml(fileInfo.saved_name)}" target="_blank" class="chat-file">${escapeHtml(fileInfo.filename)}</a>`;
            }
        } catch (e) {
            console.error('解析文件消息失败', e);
            content = escapeHtml(msg.message);
        }
    } else {
        content = escapeHtml(msg.message).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }

    const time = formatMessageTime(msg.created_at);
    let deleteBtn = '';
    if(msg.username === username){
        deleteBtn = `<span class="delete-msg-btn" title="删除消息" onclick="deleteMessage(${msg.id}, this)">🗑️</span>`;
    }

    div.innerHTML = `
    <div class="bubble">
        <div class="msg-header">
            <img src="${avatarUrl}" class="message-avatar" alt="${escapeHtml(msg.username)}">
            <span>${escapeHtml(msg.username)}</span>
            ${deleteBtn}
        </div>
        <div class="message-content ${isImageMessage ? 'image-message' : ''}">
            ${content}
        </div>
        <div class="message-time">${time}</div>
    </div>
    `;

    return div;
}

// 点击图片放大查看
function previewImage(imgElement) {
    const src = imgElement.src;

    const overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';

    const modalImg = document.createElement('img');
    modalImg.src = src;
    overlay.appendChild(modalImg);

    overlay.addEventListener('click', () => overlay.remove());

    document.body.appendChild(overlay);
}

// 文本文件点击处理
document.addEventListener('click', function(e) {
    const target = e.target;
    if (target.tagName === 'A' && target.classList.contains('chat-file')) {
        const href = target.getAttribute('href');
        const ext = href.split('.').pop().toLowerCase();
        if (ext === 'txt') {
            e.preventDefault();
            fetch(href)
                .then(res => res.text())
                .then(text => {
                    // 创建 Blob 对象
                    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);

                    // 弹窗背景遮罩
                    const modalBackground = document.createElement('div');
                    modalBackground.style.cssText = `
                        position: fixed;
                        top:0; left:0; width:100%; height:100%;
                        background: rgba(0,0,0,0.5);
                        z-index: 9999;
                    `;
                    modalBackground.addEventListener('click', () => {
                        overlay.remove();
                        modalBackground.remove();
                        URL.revokeObjectURL(url);
                    });

                    // 弹窗容器
                    const overlay = document.createElement('div');
                    overlay.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: #fff;
                        border-radius: 8px;
                        padding: 20px;
                        z-index: 10000;
                        box-shadow: 0 8px 20px rgba(0,0,0,0.3);
                        width: 90%;
                        height: 80%;
                        max-width: 900px;
                        max-height: 90%;
                        overflow: auto;
                    `;

                    // 文本显示区
                    const pre = document.createElement('pre');
                    pre.textContent = text;
                    pre.style.whiteSpace = 'pre-wrap';
                    pre.style.wordBreak = 'break-word';
                    pre.style.fontSize = '16px';
                    overlay.appendChild(pre);

                    // 下载按钮
                    const downloadBtn = document.createElement('button');
                    downloadBtn.textContent = '下载文本';
                    downloadBtn.style.cssText = `
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        padding: 6px 12px;
                        background: #3498db;
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        z-index: 10001;
                    `;
                    downloadBtn.addEventListener('click', () => {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = href.split('/').pop();
                        a.click();
                    });
                    overlay.appendChild(downloadBtn);

                    document.body.appendChild(modalBackground);
                    document.body.appendChild(overlay);
                })
                .catch(err => {
                    console.error('读取文本文件失败:', err);
                    alert('无法打开文本文件');
                });
        }
    }
});


// 添加缺失的CSS选择器支持
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector ||
                                Element.prototype.webkitMatchesSelector;
}

if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        var el = this;
        do {
            if (el.matches(s)) return el;
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}
