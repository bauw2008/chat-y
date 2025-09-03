// assets/js/chat.js
// ==================== 全局变量和配置 ====================
let lastMessageId = 0;
let isTyping = false;
let typingTimer = null;
let heartbeatInterval;
let isScrolledToBottom = true;
let autoScrollEnabled = true;
let messageInput, chatForm, sendButton;
let inactivityTimer;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000;
const DEBUG_MODE = false; // 全局控制DEBUG_MODE 为 false 时直接退出
const PAGE_ID = window.location.pathname.includes('private_chat.php') ? 'private_chat' : 'chat';
const ACTIVITY_KEY = 'user_activity_status';

// ==================== 初始化函数 ====================
function initChatRoom() {
    messageInput = document.getElementById('message');
    chatForm = document.getElementById('chat-form');
    sendButton = document.querySelector('.chat-input-send');
    
    setupInactivityTimer();
    
    const isPrivatePage = document.querySelector('.private-chat-container') !== null;
    if (isPrivatePage) {
        initPrivateChat();
        return;
    }
    
    initializeChat();
    setupKeyboardShortcuts();
    startHeartbeat();
}

// ==================== 用户活动检测 ====================
function setupInactivityTimer() {
    resetInactivityTimer();

    ['mousemove', 'keypress', 'click', 'scroll', 'touchstart', 'input'].forEach(event => {
        document.addEventListener(event, resetInactivityTimer);
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) resetInactivityTimer();
    });

    window.addEventListener('storage', (e) => {
            // 检测到其他页面活动，不更新存储以避免循环
        if (e.key === ACTIVITY_KEY) resetInactivityTimer(false);
    });
}

function resetInactivityTimer(shouldUpdateStorage = true) {
    clearTimeout(inactivityTimer);

    if (shouldUpdateStorage) {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify({
            page: PAGE_ID,
            timestamp: Date.now()
        }));
    }

    inactivityTimer = setTimeout(checkGlobalActivity, INACTIVITY_TIMEOUT);
}

function checkGlobalActivity() {
    const storedData = localStorage.getItem(ACTIVITY_KEY);
    if (storedData) {
        try {
            const { page, timestamp } = JSON.parse(storedData);
            const isOtherPageActive = page !== PAGE_ID && (Date.now() - timestamp) < INACTIVITY_TIMEOUT + 5000;
            if (isOtherPageActive) {
                resetInactivityTimer(false);
                return;
            }
        } catch (e) {
            console.error('解析活动数据失败:', e);
        }
    }
    logoutDueToInactivity();
}

function logoutDueToInactivity() {
    clearTimeout(inactivityTimer);
    if (typeof stopHeartbeat === 'function') stopHeartbeat();
    if (typeof typingTimer !== 'undefined') clearInterval(typingTimer);

    if (typeof showToast === 'function') {
        showToast('由于5分钟无操作，您已自动退出登录', 'warning');
    } else {
        alert('由于5分钟无操作，您已自动退出登录');
    }

    setTimeout(() => {
        window.location.href = 'logout.php?reason=inactivity';
    }, 2000);
}

// 页面关闭时清理
window.addEventListener('beforeunload', () => {
    clearTimeout(inactivityTimer);
});

// ==================== 工具函数 ====================
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

function handleTyping() {
    if (!isTyping) isTyping = true;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => isTyping = false, 1000);
}

function showToast(message, type = 'info') {
    const backgroundColor = type === 'error' ? '#e74c3c' : 
                          type === 'success' ? '#27ae60' : '#3498db';
    
    document.querySelectorAll('.toast').forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: backgroundColor,
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

// ==================== 私聊功能 ====================
// 初始化私聊功能
function initPrivateChat() {
    if (!window.chatConfig?.isPrivateChat) return;
    
    // 设置事件监听器
    setupPrivateEventListeners();
    // 初始化私聊特定的工具栏事件
    setupPrivateToolbarEvents();
    initializeEmojiPanel();
    initializeStickerPanel();
    setupToolbarEvents();
    setupPanelCloseHandlers();
    //添加文件上传事件监听
    setupFileUpload();
    
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
    if (chatForm) chatForm.addEventListener('submit', sendPrivateMessage);
    
    // 输入框事件
    if (messageInput) {
        messageInput.addEventListener('input', handleTyping);
        messageInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm?.dispatchEvent(new Event('submit'));
            }
        });
        messageInput.focus();
    }
}

// ==================== 私聊页面工具栏初始化 ====================
// 初始化私聊页面工具栏
function setupPrivateToolbarEvents() {
    const toolbarButtons = document.querySelectorAll('.chat-input-action.clickable');
    
    if (toolbarButtons.length >= 5) {
        const actions = [
            () => document.getElementById('file-input')?.click(),
            toggleEmojiPanel,
            toggleStickerPanel,
            deletePrivateChatHistory,
            showPrivateMoreTools
        ];
        
        toolbarButtons.forEach((button, index) => {
            if (!button.hasAttribute('data-listener-added')) {
                button.setAttribute('data-listener-added', 'true');
                button.addEventListener('click', actions[index]);
            }
        });
    }
}

// 私聊页面更多工具
function showPrivateMoreTools() {
    alert('私聊页面更多工具功能待开发');
}

// 获取私聊消息
async function fetchPrivateMessages() {
    if (!window.chatConfig?.isPrivateChat) return;
    
    try {
        const res = await fetch(`api.php?action=get_private_messages&target_user=${encodeURIComponent(window.chatConfig.targetUser)}`);
        const data = await res.json();
        if (data.status === 'ok') renderPrivateMessages(data.messages);
    } catch (e) {
        console.error('获取私聊消息失败:', e);
    }
}

// 渲染私聊消息
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

        // 统一处理消息内容（与公共聊天相同的逻辑）
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
                content = msg.message.includes('uploads/') ? 
                    `<img src="${msg.message}" class="chat-img" onclick="previewImage(this)">` :
                    `<a href="${msg.message}" target="_blank" class="chat-file">下载文件</a>`;
            }
        } else if (msg.type === 'image') {
            isImageMessage = true;
            content = `<img src="${msg.message}" class="chat-img" onclick="previewImage(this)">`;
        } else if (msg.type === 'sticker') {
            // 处理贴纸消息
            isImageMessage = true;
            content = `<img src="stickers/${escapeHtml(msg.message)}" class="chat-img file-preview" alt="${escapeHtml(msg.message)}" onclick="previewImage(this)">`;
        } else {
            // 普通文本消息
            content = escapeHtml(msg.message);
            // 替换贴纸占位符 [sticker:文件名] -> <img>
            content = content.replace(/\[sticker:([^\]]+)\]/g, (match, fileName) => {
                isImageMessage = true;
                return `<img src="stickers/${fileName}" class="chat-img file-preview" alt="${fileName}" onclick="previewImage(this)">`;
            });
            // 处理链接
            content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
            // 处理换行
            content = content.replace(/\n/g, '<br>');
        }

        const deleteBtn = isMe ? 
            `<span class="delete-msg-btn" title="删除消息" onclick="deletePrivateMessage(${msg.id}, this)">🗑️</span>` : '';
        
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
                <div class="message-time">${formatMessageTime(msg.created_at)}</div>
            </div>`;
        
        chatBox.appendChild(div);
        lastMessageId = Math.max(lastMessageId, msg.id);
    });
    
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ------------ 发送私聊消息  -----------------------
// 修改发送私聊消息函数，添加贴纸处理
async function sendPrivateMessage(e) {
    e.preventDefault();
    if (!window.chatConfig?.isPrivateChat || !messageInput) return;
    
    const msg = messageInput.value.trim();
    if (!msg) return;
    
    // 检查是否是贴纸消息（使用与公共聊天相同的逻辑）
    let messageType = 'text';
    let finalMessage = msg;
    // 检测贴纸格式 [sticker:文件名] - 与公共聊天相同的正则表达式
    const stickerMatch = msg.match(/\[sticker:([^\]]+)\]/);
    if (stickerMatch) {
        messageType = 'sticker';
        finalMessage = stickerMatch[1]; // 只发送文件名
    }
    
    try {
        const form = new URLSearchParams({
            action: 'send_private_message',
            receiver: window.chatConfig.targetUser,
            message: finalMessage,
            type: messageType
        });
        
        if (sendButton) {
            const originalHTML = sendButton.innerHTML;
            sendButton.innerHTML = '<div class="loading-spinner"></div>';
            sendButton.disabled = true;
            
            const res = await fetch('api.php', { method: 'POST', body: form });
            const data = await res.json();
            
            if (data.status === 'ok') {
                messageInput.value = '';
                fetchPrivateMessages();
                //stopTyping();  添加"正在输入"状态功能未定义函数，暂缺中
                showToast('消息发送成功', 'success');
            } else {
                showToast('发送失败: ' + (data.message || '未知错误'), 'error');
            }
            
            sendButton.innerHTML = originalHTML;
            sendButton.disabled = false;
        }
    } catch (e) {
        console.error('发送私聊消息失败:', e);
        showToast('网络错误，发送失败', 'error');
        resetSendButton();
    }
}

function resetSendButton() {
    if (sendButton) {
        sendButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>`;
        sendButton.disabled = false;
    }
}

// 删除私聊消息
async function deletePrivateMessage(messageId, btnElement) {
    if (!confirm('确认删除这条消息吗？')) return;
    
    try {
        const form = new URLSearchParams({ action: 'delete_private_message', message_id: messageId });
        const res = await fetch('api.php', { method: 'POST', body: form });
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
    if (!window.chatConfig?.isPrivateChat) return;
    
    try {
        const form = new URLSearchParams({
            action: 'delete_private_chat_history',
            target_user: window.chatConfig.targetUser
        });
        
        const res = await fetch('api.php', { method: 'POST', body: form });
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
    if (!window.chatConfig?.isPrivateChat) return;
    
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
    if (!DEBUG_MODE) return; // DEBUG_MODE 为 false 时直接退出
    
    console.group('🐛 用户状态调试');
    
    const statusData = users.map(user => ({
        用户名: user.username,
        在线状态: user.online ? '🟢 在线' : '🔴 离线',
        最后活动: user.last_active ? formatRelativeTime(user.last_active) : '无记录',
        角色: user.role,
        状态来源: user.status_source || '数据库'
    }));
    
    console.table(statusData);
    console.log('📊 统计信息:', {
        '总用户数': users.length,
        '在线用户数': users.filter(u => u.online).length,
        '离线用户数': users.filter(u => !u.online).length,
        '当前用户': window.username || '未知'
    });
    
    console.groupEnd();
}

// 格式化相对时间
function formatRelativeTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
    return time.toLocaleDateString();
}

// ==================== 心跳功能 ====================
// 启动心跳
function startHeartbeat() {
    heartbeatInterval = setInterval(sendHeartbeat, 30000);
}

// 停止心跳
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

// 发送心跳
async function sendHeartbeat() {
    try {
        const response = await fetch('api.php?action=heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ action: 'heartbeat', timestamp: Date.now() }),
            credentials: 'include'
        });

        if (response.status === 401) {
            window.location.replace('login.php');
            return;
        }

        const data = await response.json();
        if (data.status === 'ok' && data.users_updated) fetchUsers();
    } catch (error) {
        console.error('心跳检测失败:', error);
        handleConnectionError();
    }
}

// 处理连接错误
function handleConnectionError() {
    showToast('网络连接不稳定', 'warning');
    setTimeout(fetchUsers, 5000);
}

// 修改初始化函数，添加工具栏事件绑定
function initializeChat() {
    // 缓存DOM元素 - 使用正确的选择器
    messageInput = document.getElementById('message');
    chatForm = document.getElementById('chat-form');
    sendButton = document.querySelector('.chat-input-send');
    
    // 初始化功能
    fetchUserInfo();
    fetchMessages();
    fetchUsers();
    setupEventListeners();
    initializeEmojiPanel();
    initializeStickerPanel();
    setupToolbarEvents(); // 添加工具栏事件绑定
    setupPanelCloseHandlers(); // 添加面板关闭处理
    setupAdminFeatures(); // 添加管理功能初始化
    
    // 设置定时器
    setInterval(fetchMessages, 3000);
    setInterval(fetchUsers, 10000);
    setInterval(updateMessageTimes, 60000);
    setInterval(checkUnreadPrivateMessages, 15000);
    
    // 滚动到底部
    const chatBox = document.getElementById('chat-box');
    if (chatBox) scrollToBottom();
    
    setupPrivateChat();
    startHeartbeat();
}

document.addEventListener('DOMContentLoaded', initChatRoom);

// 设置事件监听器
function setupEventListeners() {
    if (chatForm && !chatForm.hasAttribute('data-listener-added')) {
        chatForm.setAttribute('data-listener-added', 'true');
        chatForm.addEventListener('submit', e => {
            e.preventDefault();
            window.chatConfig?.isPrivateChat ? sendPrivateMessage(e) : sendMessage(e);
        });
    }
    
    // 输入框事件
    if (messageInput && !messageInput.hasAttribute('data-listener-added')) {
        messageInput.setAttribute('data-listener-added', 'true');
        messageInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm?.dispatchEvent(new Event('submit'));
            }
        });
        messageInput.addEventListener('input', handleTyping);
    }
    
    // 退出登录按钮
    document.querySelectorAll('.logout, [onclick*="logout"]').forEach(button => {
        if (!button.hasAttribute('data-listener-added')) {
            button.setAttribute('data-listener-added', 'true');
            button.addEventListener('click', e => {
                e.preventDefault();
                logout();
            });
        }
    });
}

// 设置私聊功能
function setupPrivateChat() {
    const usersContainer = document.getElementById('users');
    if (!usersContainer) return;
    
    usersContainer.addEventListener('click', e => {
        const userItem = e.target.closest('.user-item');
        if (!userItem) return;
        
        const usernameElement = userItem.querySelector('.user-info span');
        if (usernameElement) {
            const username = usernameElement.textContent.trim();
            if (username && username !== window.username) openPrivateChat(username);
        }
    });
}

// 设置键盘快捷键
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            chatForm?.dispatchEvent(new Event('submit'));
        }
        
        if (e.key === 'Escape') {
            const adminPopup = document.getElementById('admin-popup');
            if (adminPopup?.style.display === 'block') adminPopup.style.display = 'none';
            
            const privateModal = document.getElementById('private-chat-modal');
            if (privateModal) privateModal.remove();
        }
    });
}

// 获取用户信息
async function fetchUserInfo() {
    try {
        const res = await fetch('api.php?action=get_user_info');
        const data = await res.json();
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
            const currentMessageCount = chatBox.querySelectorAll('.message').length;
            if (currentMessageCount !== data.messages.length) {
                renderMessages(data.messages);
                if (autoScrollEnabled && isScrolledToBottom) scrollToBottom();
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
    messages.forEach(msg => chatBox.appendChild(createMessageElement(msg)));
    addTimeSeparators();
}

// 创建消息元素
function createMessageElement(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.username === username ? 'me' : 'other'}`;
    div.dataset.messageId = msg.id;
    div.dataset.timestamp = new Date(msg.created_at).getTime();

    const avatarUrl = `https://api.dicebear.com/6.x/pixel-art/svg?seed=${encodeURIComponent(msg.username)}`;
    let content = '';
    let isImageMessage = false;
    let isFileMessage = false;

    if (msg.type === 'file') {
        try {
            const fileInfo = JSON.parse(msg.message);
            if (fileInfo.type === 'image') {
                isImageMessage = true;
                content = `<img src="uploads/${escapeHtml(fileInfo.saved_name)}" class="chat-img file-preview" alt="${escapeHtml(fileInfo.filename)}" onclick="previewImage(this)">`;
            } else {
                isFileMessage = true;
                content = `<a href="uploads/${escapeHtml(fileInfo.saved_name)}" target="_blank" class="chat-file">${escapeHtml(fileInfo.filename)}</a>`;
            }
        } catch (e) {
            content = escapeHtml(msg.message);
        }
    } else if (msg.type === 'image') {
        isImageMessage = true;
        content = `<img src="${msg.message}" class="chat-img" alt="图片消息" onclick="previewImage(this)">`;
    } else {
        content = escapeHtml(msg.message);
        content = content.replace(/\[sticker:([^\]]+)\]/g, (match, fileName) => {
            isImageMessage = true;
            return `<img src="stickers/${fileName}" class="chat-img file-preview" alt="${fileName}" onclick="previewImage(this)">`;
        });
        
        content = content.replace(
            /(https?:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(?:\/[^\s<>()'"，。！？；：""‘’\u4e00-\u9fff]*)?)(?=[\s<>()'"，。！？；：""‘'‘’\u4e00-\u9fff]|$)/g, 
            '<a href="$1" target="_blank" rel="noopener" style="color: #2563eb;">$1</a>'
        );
     
        content = content.replace(/\n/g, '<br>');
    }

    const deleteBtn = msg.username === username ? 
        `<span class="delete-msg-btn" title="删除消息" onclick="deleteMessage(${msg.id}, this)">🗑️</span>` : '';

    div.innerHTML = `
        <div class="bubble">
            <div class="msg-header">
                <img src="${avatarUrl}" class="message-avatar" alt="${escapeHtml(msg.username)}">
                <span>${escapeHtml(msg.username)}</span>
                ${deleteBtn}
            </div>
            <div class="message-content ${isImageMessage ? 'image-message' : ''} ${isFileMessage ? 'file-message' : ''}">
                ${content}
            </div>
            <div class="message-time">${formatMessageTime(msg.created_at)}</div>
        </div>
    `;

    return div;
}

// 删除主窗口聊天消息
async function deleteMessage(messageId, el) {
    if (!confirm('确定删除这条消息吗？')) return;

    try {
        const form = new URLSearchParams({ action: 'delete_message', message_id: messageId });
        const res = await fetch('api.php', { method: 'POST', body: form });
        const data = await res.json();
        
        if (data.status === 'ok') el.closest('.message')?.remove();
        else alert('删除失败: ' + data.message);
    } catch (e) {
        console.error(e);
        alert('删除消息请求失败');
    }
}

// 发送消息（公共聊天）
async function sendMessage(e) {
    e.preventDefault();
    if (!messageInput) return;
    
    const msg = messageInput.value.trim();
    if (!msg) return;
    
    try {
        const form = new URLSearchParams({ action: 'send_message', message: msg });
        
        if (sendButton) {
            const originalHTML = sendButton.innerHTML;
            sendButton.innerHTML = '<div class="loading-spinner"></div>';
            sendButton.disabled = true;
            
            const response = await fetch('api.php', { method: 'POST', body: form });
            const data = await response.json();
            
            if (data.status === 'ok') {
                messageInput.value = '';
                fetchMessages();
                showToast('消息发送成功', 'success');
            } else {
                showToast('发送失败: ' + (data.message || '未知错误'), 'error');
            }
            
            sendButton.innerHTML = originalHTML;
            sendButton.disabled = false;
        }
    } catch (error) {
        console.error('发送消息失败:', error);
        showToast('网络错误，发送失败', 'error');
        resetSendButton();
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
            debugUserStatus(data.users);
            container.innerHTML = '';
            data.users.forEach(u => container.appendChild(createUserElement(u)));
            updateUsersStatusDisplay(data.users);
            updateOnlineUserCount(data.users);
        }
    } catch (error) {
        console.error('获取用户列表失败:', error);
    }
}

// 获取用户签名
async function fetchUserSignature(username) {
    const res = await fetch(`api.php?action=get_user_signature&username=${encodeURIComponent(username)}`);
    const data = await res.json();
    return data.signature || '这个人很懒，什么都没有留下...';
}

// 更新在线用户计数
function updateOnlineUserCount(users) {
    const onlineCount = users.filter(u => u.online).length;
    const onlineCountElement = document.getElementById('online-count');
    
    if (onlineCountElement) onlineCountElement.textContent = `${onlineCount}人在线`;
    if (onlineCount > 1) document.title = `聊天室 (${onlineCount}人在线)`;
}

// 创建用户元素
function createUserElement(user) {
    const div = document.createElement('div');
    div.className = `user-item ${user.online ? 'online' : 'offline'}`;
    div.dataset.username = user.username;

    div.title = `${user.username} (${user.role}) - ${user.online ? '在线' : '离线'}`;
    div.style.position = 'relative';
    
    const avatarUrl = `https://api.dicebear.com/6.x/pixel-art/svg?seed=${encodeURIComponent(user.username)}`;
    
    div.innerHTML = `
        <div class="user-info">
            <div class="user-avatar">
                <img src="${avatarUrl}" alt="${escapeHtml(user.username)}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzYiIGhlaWdodD0iMzYiIHZpZXdCb3g9IjAgMCAzNiAzNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjM2IiBoZWlnaHQ9IjM2IiBmaWxsPSIjNGE2YmRmIi8+Cjx0ZXh0IHg9IjE4IiB5PSIyMCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+${user.username.charAt(0).toUpperCase()}</dGV4dD4KPC9zdmc+'">
            </div>
            <span>${escapeHtml(user.username)}</span>
            ${user.role !== 'user' ? `<span class="user-role" title="${user.role}">${user.role === 'admin' ? '👑' : '⭐'}</span>` : ''}
        </div>
        <div class="user-status" style="background: ${user.online ? '#2ecc71' : '#95a5a6'}" title="${user.online ? '在线' : '离线'}"></div>
        ${user.online ? '<span class="user-ping-indicator"></span>' : ''}
    `;
	
	// 异步加载签名，不阻塞 DOM 创建
        fetchUserSignature(user.username).then(sig => {
        div.title += `\n ${sig}`;
    });

    
    if (user.username !== username) {
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => {
            user.online ? openPrivateChat(user.username) : showToast('该用户当前离线', 'warning');
        });
        
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
            
            div.addEventListener('mouseenter', () => chatIcon.style.opacity = '1');
            div.addEventListener('mouseleave', () => chatIcon.style.opacity = '0.6');
        }
    }
    
    return div;
}

// 更新用户状态显示
function updateUsersStatusDisplay(users) {
    document.querySelectorAll('.user-item').forEach(item => {
        const username = item.dataset.username;
        const user = users.find(u => u.username === username);
        if (!user) return;
        
        item.classList.toggle('online', user.online);
        item.classList.toggle('offline', !user.online);
        
        const statusIndicator = item.querySelector('.user-status');
        if (statusIndicator) {
            statusIndicator.style.background = user.online ? '#2ecc71' : '#95a5a6';
            statusIndicator.title = user.online ? '�