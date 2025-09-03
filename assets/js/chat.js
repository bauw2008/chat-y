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
            statusIndicator.title = user.online ? '在线' : '离线';
        }
        
        const chatIcon = item.querySelector('.private-chat-icon');
        if (chatIcon) chatIcon.style.display = user.online ? 'block' : 'none';
        
        const pingIndicator = item.querySelector('.user-ping-indicator');
        if (pingIndicator) {
            if (user.online) {
                pingIndicator.style.display = 'block';
                if (user.last_active) {
                    const lastActive = new Date(user.last_active);
                    const now = new Date();
                    const minutesDiff = (now - lastActive) / (1000 * 60);
                    
                    if (minutesDiff < 1) pingIndicator.style.background = '#2ecc71';
                    else if (minutesDiff < 5) pingIndicator.style.background = '#f39c12';
                    else pingIndicator.style.background = '#e74c3c';
                }
            } else {
                pingIndicator.style.display = 'none';
            }
        }
    });
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
            data.unread_count > 0 ? showUnreadBadge(data.unread_count) : hideUnreadBadge();
        }
    } catch (error) {
        console.error('检查未读消息失败:', error);
    }
}

// 显示未读消息徽章
function showUnreadBadge(count) {
    document.getElementById('unread-badge')?.remove();
    
    document.querySelectorAll('.private-chat-icon').forEach(icon => {
        icon.parentElement.querySelector('.unread-badge')?.remove();
        
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.cssText = `
            position: absolute;
            top: -5px;
            right: -5px;
            background: #e74c3c;
            color: white;
            border-radius: 50%;
            min-width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: bold;
            z-index: 1001;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            padding: 0 3px;
        `;
        
        icon.parentElement.style.position = 'relative';
        icon.parentElement.appendChild(badge);
    });
}

function hideUnreadBadge() {
    document.querySelectorAll('.unread-badge').forEach(badge => badge.remove());
    document.getElementById('unread-badge')?.remove();
}

// 显示私聊列表
async function showPrivateChatList() {
    try {
        const response = await fetch('api.php?action=get_private_chat_users');
        const data = await response.json();
        if (data.status === 'ok') createPrivateChatModal(data.chat_users);
    } catch (error) {
        console.error('获取私聊列表失败:', error);
        showToast('获取私聊列表失败', 'error');
    }
}

// 创建私聊模态框
function createPrivateChatModal(chatUsers) {
    document.getElementById('private-chat-modal')?.remove();
    
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
            setTimeout(() => window.location.href = 'logout.php', 1000);
        } else {
            showToast('退出失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('退出失败:', error);
        showToast('网络错误，退出失败', 'error');
    }
}

// ==================== 管理员功能 ====================
// 切换管理员面板
function toggleAdminPanel() {
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) adminPanel.style.display = adminPanel.style.display === 'block' ? 'none' : 'block';
}

// 初始化管理功能
function setupAdminFeatures() {
    const adminMenu = document.getElementById('admin-menu');
    const clearChatBtn = document.getElementById('clear-chat');
    const manageUsersBtn = document.getElementById('manage-users');
    const deleteUserBtn = document.getElementById('delete-user');
    
    if (adminMenu) adminMenu.addEventListener('click', toggleAdminPopup);
    if (clearChatBtn) clearChatBtn.addEventListener('click', clearChat);
    if (manageUsersBtn) manageUsersBtn.addEventListener('click', toggleUserManagement);
    if (deleteUserBtn) deleteUserBtn.addEventListener('click', deleteUser);
    
    document.addEventListener('click', e => {
        const adminPopup = document.getElementById('admin-popup');
        if (adminPopup?.style.display === 'block' && !adminPopup.contains(e.target)) {
            if (e.target !== adminMenu) adminPopup.style.display = 'none';
        }
    });
}

// 管理员功能
function toggleAdminPopup() {
    const popup = document.getElementById('admin-popup');
    if (popup) popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
}

// 管理员清理聊天记录
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
        if (userManagement.style.display === 'block') loadDeletableUsers();
    }
}

// 管理员用户管理
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

// 管理员用户管理删除
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
        const form = new URLSearchParams({ action: 'delete_user', username: usernameToDelete });
        const response = await fetch('api.php', { method: 'POST', body: form });
        
        if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
        
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } 
        catch (e) { throw new Error('服务器返回了无效的JSON格式'); }
        
        if (data.status === 'ok') {
            showToast(`用户 ${usernameToDelete} 已删除`, 'success');
            loadDeletableUsers();
            fetchUsers();
        } else {
            showToast('删除失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('删除用户失败:', error);
        showToast('删除失败: ' + error.message, 'error');
    }
}

function updateMessageTimes() {
    document.querySelectorAll('.message').forEach(msg => {
        const timeElement = msg.querySelector('.message-time');
        if (timeElement) {
            const timestamp = msg.dataset.timestamp;
            timeElement.textContent = formatMessageTime(parseInt(timestamp));
        }
    });
}

function addTimeSeparators() {
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

// 点击图片放大查看
function previewImage(imgElement) {
    const overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';
    const modalImg = document.createElement('img');
    modalImg.src = imgElement.src;
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

// 信息默认滚动最新
function scrollToBottom() {
    const chatBox = document.getElementById('chat-box');
    if (chatBox) chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
}

// ==================== 工具栏功能 ====================
// 切换表情面板
function toggleEmojiPanel() {
    const emojiPanel = document.getElementById('emoji-panel');
    const stickerPanel = document.getElementById('sticker-panel');
    
    if (emojiPanel?.style.display === 'grid') emojiPanel.style.display = 'none';
    else if (emojiPanel) {
        emojiPanel.style.display = 'grid';
        if (stickerPanel) stickerPanel.style.display = 'none';
    }
}

// 切换贴纸面板
function toggleStickerPanel() {
    const stickerPanel = document.getElementById('sticker-panel');
    const emojiPanel = document.getElementById('emoji-panel');
    
    if (stickerPanel?.style.display === 'grid') stickerPanel.style.display = 'none';
    else if (stickerPanel) {
        stickerPanel.style.display = 'grid';
        if (emojiPanel) emojiPanel.style.display = 'none';
    }
}

// 设置工具栏事件
function setupToolbarEvents() {
    const toolbarButtons = document.querySelectorAll('.chat-input-action.clickable');
    
    if (toolbarButtons.length >= 4) {
        const actions = [
            () => document.getElementById('file-input')?.click(),
            toggleEmojiPanel,
            toggleStickerPanel,
            showMoreTools
        ];
        
        toolbarButtons.forEach((button, index) => {
            if (!button.hasAttribute('data-listener-added')) {
                button.setAttribute('data-listener-added', 'true');
                button.addEventListener('click', actions[index]);
            }
        });
    }
}

// 初始化一些示例emoji
function initializeEmojiPanel() {
    const emojiPanel = document.getElementById('emoji-panel');
    if (!emojiPanel || emojiPanel.hasAttribute('data-initialized')) return;
    
    const emojis = [
        '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
        '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
        '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
        '🥳', '👍', '🙏', '😢', '🎉', '💯', '❤️', '🔥', '✨', '🎯',
        '🤔', '😴'
    ];

    emojis.forEach(emoji => {
        const emojiElement = document.createElement('div');
        emojiElement.className = 'emoji-item';
        emojiElement.textContent = emoji;
        emojiElement.addEventListener('click', function() {
            if (messageInput) {
                messageInput.value += emoji;
                emojiPanel.style.display = 'none';
                messageInput.focus();
            }
        });
        emojiPanel.appendChild(emojiElement);
    });
    
    emojiPanel.setAttribute('data-initialized', 'true');
}

// 初始化贴纸面板
function initializeStickerPanel() {
    const stickerPanel = document.getElementById('sticker-panel');
    if (!stickerPanel || stickerPanel.hasAttribute('data-initialized')) return;
    
    const stickers = ['xz.gif', 'xt.gif', 'xh.png', 'bb.gif', 'dc.gif', 'fx.gif', 'hh.gif', 'wj.gif'];

    stickers.forEach(file => {
        const img = document.createElement('img');
        img.src = 'stickers/' + file;
        img.className = 'sticker-img';
        img.addEventListener('click', function() {
            if (messageInput) {
                messageInput.value = `[sticker:${file}]`;
                if (chatForm) chatForm.dispatchEvent(new Event('submit'));
                stickerPanel.style.display = 'none';
            }
        });
        stickerPanel.appendChild(img);
    });
    
    stickerPanel.setAttribute('data-initialized', 'true');
}

function showMoreTools() {
    alert('更多工具功能待开发');
}

// ==================== 文件上传处理 ====================
// 文件上传处理
function setupFileUpload() {
    const fileInput = document.getElementById('file-input');
    if (fileInput && !fileInput.hasAttribute('data-listener-added')) {
        fileInput.setAttribute('data-listener-added', 'true');
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) document.getElementById('upload-form').submit();
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('file-input');
    if (fileInput && !fileInput.hasAttribute('data-listener-added')) {
        fileInput.setAttribute('data-listener-added', 'true');
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) document.getElementById('upload-form').submit();
        });
    }
});

// 点击外部关闭面板
function setupPanelCloseHandlers() {
    document.addEventListener('click', function(e) {
        const emojiPanel = document.getElementById('emoji-panel');
        const stickerPanel = document.getElementById('sticker-panel');
        
        if (emojiPanel?.style.display === 'grid' && 
            !e.target.closest('#emoji-panel') && 
            !e.target.closest('.chat-input-action.clickable:nth-child(2)')) {
            emojiPanel.style.display = 'none';
        }
        
        if (stickerPanel?.style.display === 'grid' && 
            !e.target.closest('#sticker-panel') && 
            !e.target.closest('.chat-input-action.clickable:nth-child(3)')) {
            stickerPanel.style.display = 'none';
        }
    });
}

// ==================== 共享文件功能 ====================
// 点击按钮显示共享文件并加载列表
function openSharedFiles() {
    const dialog = document.getElementById('shared-files-dialog');
    dialog.style.display = dialog.style.display === 'block' ? 'none' : 'block';
    loadSharedFiles();
}

function closeSharedFiles() {
    document.getElementById('shared-files-dialog').style.display = 'none';
}

async function loadSharedFiles() {
    try {
        const list = document.getElementById('shared-files-list');
        list.innerHTML = '';

        const localRes = await fetch('api.php?action=get_local_files');
        const localData = await localRes.json();

        const dbRes = await fetch('api.php?action=get_messages');
        const dbData = await dbRes.json();

        const fileInfoMap = {};
        if (dbData.status === 'ok' && Array.isArray(dbData.messages)) {
            dbData.messages.filter(m => m.type === 'file').forEach(f => {
                try {
                    const msgData = JSON.parse(f.message);
                    if (msgData.saved_name) {
                        fileInfoMap[msgData.saved_name] = {
                            username: f.username,
                            message_id: f.id,
                            filename: msgData.filename
                        };
                    }
                } catch(e) {}
            });
        }

        if (localData.status === 'ok' && Array.isArray(localData.files)) {
            const files = localData.files;

            if (files.length === 0) {
                list.innerHTML = '<li>暂无共享文件</li>';
            } else {
                files.forEach(file => {
                    const originalName = file.replace(/^\d+_/, '');
                    const fileInfo = fileInfoMap[file] || { username: '未知用户' };
                    
                    const li = document.createElement('li');
                    li.style.cssText = `
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                        padding: 8px;
                        border-bottom: 1px solid #eee;
                    `;

                    const fileContent = document.createElement('div');
                    fileContent.style.flex = '1';
                    
                    const link = document.createElement('a');
                    link.href = `uploads/${encodeURIComponent(file)}`;
                    link.download = originalName;
                    link.textContent = originalName;
                    link.style.cssText = 'font-weight: bold; text-decoration: none; color: #333;';
                    
                    const metaInfo = document.createElement('div');
                    metaInfo.style.cssText = 'font-size: 11px; color: #888;';
                    metaInfo.textContent = `上传者: ${fileInfo.username}`;
                    
                    fileContent.appendChild(link);
                    fileContent.appendChild(metaInfo);
                    li.appendChild(fileContent);

                    if (role === 'admin') {
                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = '删除';
                        deleteBtn.style.cssText = `
                            background: #f44336;
                            color: white;
                            border: none;
                            padding: 4px 8px;
                            border-radius: 3px;
                            cursor: pointer;
                            margin-left: 10px;
                            font-size: 12px;
                        `;
                        
                        deleteBtn.onclick = async () => {
                            if (confirm(`确定删除文件 "${originalName}" 吗？`)) {
                                try {
                                    if (fileInfo.message_id) {
                                        const deleteRes = await fetch('api.php?action=delete_message_admin', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                            body: `message_id=${fileInfo.message_id}`
                                        });
                                        
                                        const deleteData = await deleteRes.json();
                                        if (deleteData.status === 'ok') {
                                            li.remove();
                                            if (list.children.length === 0) list.innerHTML = '<li>暂无共享文件</li>';
                                        } else alert('文件删除失败: ' + deleteData.message);
                                    } else {
                                        const formData = new FormData();
                                        formData.append('filename', file);
                                        
                                        const deleteRes = await fetch('api.php?action=delete_local_file', {
                                            method: 'POST',
                                            body: formData
                                        });
                                        
                                        const deleteData = await deleteRes.json();
                                        if (deleteData.status === 'ok') {
                                            li.remove();
                                            if (list.children.length === 0) list.innerHTML = '<li>暂无共享文件</li>';
                                        } else alert('文件删除失败: ' + deleteData.message);
                                    }
                                } catch (error) {
                                    console.error('删除文件错误:', error);
                                    alert('删除文件时发生错误');
                                }
                            }
                        };
                        
                        li.appendChild(deleteBtn);
                    }

                    list.appendChild(li);
                });
            }
        } else list.innerHTML = '<li>加载失败</li>';
    } catch (err) {
        console.error('加载共享文件失败:', err);
        document.getElementById('shared-files-list').innerHTML = '<li>加载失败</li>';
    }
}

// ==================== 密码修改功能 ====================
// 切换密码菜单显示
function toggleChangePasswordMenu() {
    const menu = document.getElementById('change-password-menu');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    setTimeout(initPasswordToggle, 10);
}

function initPasswordToggle() {
    document.querySelectorAll('.toggle-password').forEach(button => {
        if (!button.hasAttribute('data-toggle-bound')) {
            button.setAttribute('data-toggle-bound', 'true');
            
            button.addEventListener('click', function() {
                const input = this.parentElement.querySelector('input');
                const isPassword = input.type === 'password';
                const icon = this.querySelector('.eye-icon');
                
                input.type = isPassword ? 'text' : 'password';
                
                if (isPassword) {
                    icon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
                } else {
                    icon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
                }
                
                this.setAttribute('aria-label', isPassword ? '隐藏密码' : '显示密码');
            });
        }
    });
}

// 通用密码修改
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('change-password-form');
    if (!form) return;
    
    initPasswordToggle();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const oldPassword = document.getElementById('old-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword !== confirmPassword) {
            alert('新密码与确认密码不一致！');
            return;
        }

        const formData = new FormData(form);

        try {
            const res = await fetch('api.php?action=change_password', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            alert(data.message);

            if (data.status === 'ok') {
                form.reset();
                document.getElementById('change-password-menu').style.display = 'none';
                window.location.href = 'logout.php';
            }
        } catch (err) {
            alert('修改密码失败，请稍后重试');
        }
    });
});

// ==================== 文本区域自动调整 ====================
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('message');
    const chatForm = document.getElementById('chat-form');
    
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            this.style.overflowY = this.scrollHeight > 120 ? 'auto' : 'hidden';
        });
        
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (e.shiftKey) return;
                e.preventDefault();
                chatForm?.dispatchEvent(new Event('submit'));
            }
        });
        
        // 初始化高度
        setTimeout(() => {
            messageInput.style.height = 'auto';
            messageInput.style.height = (messageInput.scrollHeight) + 'px';
        }, 100);
    }
});

// ==================== 主题功能 ====================
// 主题配置
const themes = {
    'default': {
        background: 'linear-gradient(135deg, rgba(58, 123, 213, 0.85) 0%, rgba(44, 62, 80, 0.85) 100%)',
        backdropFilter: 'blur(15px)',
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15), inset 1px 0 0 rgba(255, 255, 255, 0.1)',
        borderRight: '1px solid rgba(255, 255, 255, 0.15)'
    },
    'colorful': {
        background: 'linear-gradient(135deg, rgba(58, 123, 213, 0.22) 0%, rgba(156, 39, 176, 0.20) 40%, rgba(233, 30, 99, 0.18) 100%)',
        backdropFilter: 'blur(5px) saturate(160%)',
        boxShadow: 'inset 0 0 25px rgba(255, 255, 255, 0.08), 4px 0 20px rgba(0, 0, 0, 0.25)',
        borderRight: '1px solid rgba(255, 255, 255, 0.12)'
    },
    'crystal': {
        background: 'linear-gradient(135deg, rgba(58, 123, 213, 0.22) 0%, rgba(0, 210, 255, 0.18) 40%, rgba(44, 62, 80, 0.28) 100%)',
        backdropFilter: 'blur(4px) saturate(160%)',
        boxShadow: 'inset 0 0 25px rgba(255, 255, 255, 0.06), 4px 0 20px rgba(0, 0, 0, 0.25)',
        borderRight: '1px solid rgba(255, 255, 255, 0.12)'
    },
    'dark': {
        background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
        backdropFilter: 'blur(10px)',
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.3), inset 1px 0 0 rgba(255, 255, 255, 0.05)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)'
    }
};

// 页面加载时初始化主题功能
document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.endsWith('chat.php')) return;

    const themeToggle = document.getElementById('theme-toggle');
    const themePanel = document.getElementById('theme-panel');
    const themeOptions = document.querySelectorAll('.theme-option');
    const userList = document.querySelector('.user-list');

    if (!themeToggle || !themePanel || !userList) return;

    // 应用主题
    function applyTheme(theme) {
        const config = themes[theme];
        if (!config) return;
        userList.style.background = config.background;
        userList.style.backdropFilter = config.backdropFilter;
        userList.style.webkitBackdropFilter = config.backdropFilter;
        userList.style.boxShadow = config.boxShadow;
        userList.style.borderRight = config.borderRight;
        localStorage.setItem('selectedTheme', theme);
    }

    // 初始化主题
    const savedTheme = localStorage.getItem('selectedTheme') || 'default';
    applyTheme(savedTheme);
    themeOptions.forEach(opt => opt.classList.toggle('active', opt.getAttribute('data-theme') === savedTheme));

    // 切换主题面板显示
    themeToggle.addEventListener('click', e => {
        e.stopPropagation();
        themePanel.style.display = themePanel.style.display === 'block' ? 'none' : 'block';
    });

    // 选择主题
    themeOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const theme = opt.getAttribute('data-theme');
            applyTheme(theme);
            themePanel.style.display = 'none';
            themeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        });
    });

    // 点击其他区域关闭面板
    document.addEventListener('click', e => {
        if (!e.target.closest('#theme-panel') && !e.target.closest('#theme-toggle')) {
            themePanel.style.display = 'none';
        }
    });
});

// ==================== 签名功能 ====================

function initSignature() {
    const editBtn = document.getElementById('editSignatureBtn');
    const contentDiv = document.getElementById('signatureContent');
    const editDiv = document.getElementById('signatureEdit');
    const signatureInput = document.getElementById('signatureInput');
    const saveBtn = document.getElementById('saveSignatureBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    const hitokotoBtn = document.getElementById('hitokotoBtn');
    
    if (!editBtn) return;
    
    // 检查用户角色，如果不是管理员则隐藏一言按钮
    if (role !== 'admin') {
        hitokotoBtn.style.display = 'none';
        return;
    }
    
    // 编辑签名
    editBtn.addEventListener('click', function() {
        contentDiv.style.display = 'none';
        editDiv.style.display = 'block';
        signatureInput.focus();
    });
    
    // 保存签名
    saveBtn.addEventListener('click', function() {
        const newSignature = signatureInput.value.trim();
        
        fetch('api.php?action=save_signature', {
            method: 'POST',
            body: new URLSearchParams({ signature: newSignature })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'ok') {
                contentDiv.textContent = newSignature; // 只更新文本内容
                editDiv.style.display = 'none';
                contentDiv.style.display = 'block';
            } else {
                alert('保存失败: ' + (data.message || '未知错误'));
            }
        })
        .catch(error => {
            console.error('保存签名失败:', error);
            alert('保存失败，请稍后重试');
        });
    });
    
    // 取消编辑
    cancelBtn.addEventListener('click', function() {
        editDiv.style.display = 'none';
        contentDiv.style.display = 'block';
        // 恢复原始内容到输入框
        signatureInput.value = contentDiv.textContent;
    });
    
    // 获取一言（仅管理员可用）
    hitokotoBtn.addEventListener('click', function() {
        hitokotoBtn.disabled = true;
        hitokotoBtn.textContent = '获取中...';
        
        fetch('api.php?action=get_hitokoto')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'ok') {
                    signatureInput.value = data.hitokoto;
                } else {
                    alert('获取失败: ' + (data.message || '未知错误'));
                }
            })
            .catch(error => {
                console.error('获取一言失败:', error);
                alert('获取失败，请重试');
            })
            .finally(() => {
                setTimeout(() => {
                    hitokotoBtn.disabled = false;
                    hitokotoBtn.textContent = '获取一言';
                }, 30000);
            });
    });
    
    // 管理员：页面加载后尝试自动更新一言
    tryAutoRotateHitokoto();
}

// admin 自动更新一言
function tryAutoRotateHitokoto() {
    fetch('api.php?action=get_hitokoto')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'ok') {
                const newSig = data.hitokoto;
                const currentShown = document.getElementById('signatureContent').textContent.trim();
                
                // 如果与当前显示相同就不更新
                if (currentShown === newSig.trim()) return;
                
                // 自动保存到数据库
                fetch('api.php?action=save_signature', {
                    method: 'POST',
                    body: new URLSearchParams({ signature: newSig })
                })
                .then(response => response.json())
                .then(saveData => {
                    if (saveData.status === 'ok') {
                        const contentDiv = document.getElementById('signatureContent');
                        const signatureInput = document.getElementById('signatureInput');
                        
                        contentDiv.textContent = newSig; // 只更新文本内容
                        if (signatureInput) {
                            signatureInput.value = newSig;
                        }
                    }
                });
            }
        })
        .catch(error => {
            console.error('自动更新一言失败:', error);
        });
}

// DOM加载后初始化
document.addEventListener('DOMContentLoaded', initSignature);


// ==================== 兼容性支持 ====================
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || 
                                Element.prototype.webkitMatchesSelector;
}

if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        let el = this;
        do {
            if (el.matches(s)) return el;
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

// ==================== 页面事件监听 ====================
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        fetchUsers();
        sendHeartbeat();
    }
});

window.addEventListener('online', function() {
    showToast('网络连接已恢复', 'success');
    fetchUsers();
    sendHeartbeat();
});

window.addEventListener('offline', function() {
    showToast('网络连接已断开', 'error');
});

window.addEventListener('beforeunload', function() {
    stopHeartbeat();
    clearTimeout(inactivityTimer);
    clearTimeout(typingTimer);
});