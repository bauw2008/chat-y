// assets/js/chat.js

// ==================== 全局变量和配置 ====================
let lastMessageId = 0;
let isTyping = false;
let typingTimer = null;
let heartbeatInterval;
let isScrolledToBottom = true;
let autoScrollEnabled = true;
let messageInput, chatForm, sendButton;


// ==================== 用户活动检测 ====================
let inactivityTimer;
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5分钟

// ==================== 初始化函数 ====================

// 统一的初始化函数
function initChatRoom() {
    console.log('初始化聊天室...');
    
    // 首先设置正确的DOM元素引用
    messageInput = document.getElementById('message');
    chatForm = document.getElementById('chat-form');
    sendButton = document.querySelector('.chat-input-send');
	
	// 初始化用户活动检测
    setupInactivityTimer();
    
    // 检查是否在私聊页面
    const isPrivatePage = document.querySelector('.private-chat-container') !== null;
    
    if (isPrivatePage) {
        console.log('检测到私聊页面，初始化私聊功能');
        initPrivateChat();
        return;
    }
    
    console.log('初始化公共聊天功能');
    initializeChat();
    setupKeyboardShortcuts();
    startHeartbeat();
}

// ==================== 用户活动检测函数 ====================

// 设置用户活动检测计时器
function setupInactivityTimer() {
    // 重置计时器
    resetInactivityTimer();
    
    // 监听用户活动事件
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);
    document.addEventListener('scroll', resetInactivityTimer);
    document.addEventListener('touchstart', resetInactivityTimer);
    document.addEventListener('input', resetInactivityTimer);
    
    // 页面可见性变化时也重置计时器
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            resetInactivityTimer();
        }
    });
}

// 重置不活动计时器
function resetInactivityTimer() {
    // 清除现有计时器
    clearTimeout(inactivityTimer);
    
    // 设置新的计时器（5分钟）
    inactivityTimer = setTimeout(logoutDueToInactivity, INACTIVITY_TIMEOUT);
}

// 由于不活动而退出登录
function logoutDueToInactivity() {
    // 停止所有定时器
    stopHeartbeat();
    clearInterval(typingTimer);
    
    // 显示提示信息
    showToast('由于5分钟无操作，您已自动退出登录', 'warning');
    
    // 延迟一下让用户看到提示
    setTimeout(() => {
        window.location.href = 'logout.php?reason=inactivity';
    }, 2000);
}

// 修改原有的logout函数，清除计时器
function logout() {
    // 清除不活动计时器
    clearTimeout(inactivityTimer);
    
    if (confirm('确定要退出登录吗？')) {
        window.location.href = 'logout.php';
    }
}
// 在页面卸载时停止所有计时器
window.addEventListener('beforeunload', function() {
    stopHeartbeat();
    clearTimeout(inactivityTimer);
    clearTimeout(typingTimer);
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

function handleTyping() {
    if (!isTyping) isTyping = true;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 1000);
}

function stopTyping() {
    isTyping = false;
}

function setButtonLoading(button, text) {
    button.textContent = text;
    button.disabled = true;
}

function setButtonNormal(button, text) {
    button.textContent = text;
    button.disabled = false;
}

function showToast(message, type = 'info') {
    // 修复这里：使用正确的三元运算符语法
    const backgroundColor = type === 'error' ? '#e74c3c' : 
                          type === 'success' ? '#27ae60' : '#3498db';
    
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
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    
    console.log('初始化私聊功能，目标用户:', window.chatConfig.targetUser);
    
    // 设置事件监听器
    setupPrivateEventListeners();
	
	// 初始化私聊特定的工具栏事件
    setupPrivateToolbarEvents();
	
	// 初始化UI组件 - 使用公共的函数
    initializeEmojiPanel(); // 使用公共的表情面板初始化
    initializeStickerPanel(); // 使用公共的贴纸面板初始化
    setupToolbarEvents(); // 添加工具栏事件绑定
    setupPanelCloseHandlers(); // 添加面板关闭处理
	
	
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

// ==================== 私聊页面工具栏初始化 ====================

// 初始化私聊页面工具栏
function setupPrivateToolbarEvents() {
    console.log('初始化私聊页面工具栏...');
    
    // 获取所有工具栏按钮
    const toolbarButtons = document.querySelectorAll('.chat-input-action.clickable');
    
    if (toolbarButtons.length >= 5) {
        // 文件上传按钮 (第一个)
        if (!toolbarButtons[0].hasAttribute('data-listener-added')) {
            toolbarButtons[0].setAttribute('data-listener-added', 'true');
            toolbarButtons[0].addEventListener('click', function() {
                const fileInput = document.getElementById('file-input');
                if (fileInput) {
                    fileInput.click();
                }
            });
        }
        
        // 表情按钮 (第二个)
        if (!toolbarButtons[1].hasAttribute('data-listener-added')) {
            toolbarButtons[1].setAttribute('data-listener-added', 'true');
            toolbarButtons[1].addEventListener('click', function() {
                toggleEmojiPanel();
            });
        }
        
        // 贴纸按钮 (第三个)
        if (!toolbarButtons[2].hasAttribute('data-listener-added')) {
            toolbarButtons[2].setAttribute('data-listener-added', 'true');
            toolbarButtons[2].addEventListener('click', function() {
                toggleStickerPanel();
            });
        }
        
        // 清空按钮 (第四个) - 现在在JS中处理
        if (!toolbarButtons[3].hasAttribute('data-listener-added')) {
            toolbarButtons[3].setAttribute('data-listener-added', 'true');
            toolbarButtons[3].addEventListener('click', function() {
                deletePrivateChatHistory();
            });
        }
        
        // 更多工具按钮 (第五个)
        if (!toolbarButtons[4].hasAttribute('data-listener-added')) {
            toolbarButtons[4].setAttribute('data-listener-added', 'true');
            toolbarButtons[4].addEventListener('click', function() {
                showPrivateMoreTools();
            });
        }
    }
    
    console.log('私聊页面工具栏事件设置完成');
}

// 私聊页面更多工具
function showPrivateMoreTools() {
    alert('私聊页面更多工具功能待开发');
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
                console.warn('文件信息解析失败，尝试旧格式:', e);
                if (msg.message.includes('uploads/')) {
                    content = `<img src="${msg.message}" class="chat-img" onclick="previewImage(this)">`;
                } else {
                    content = `<a href="${msg.message}" target="_blank" class="chat-file">下载文件</a>`;
                }
            }
        } else if (msg.type === 'image') {
            isImageMessage = true;
            content = `<img src="${msg.message}" class="chat-img" onclick="previewImage(this)">`;
        } else if (msg.type === 'sticker') {
            // 处理贴纸消息（与公共聊天相同的逻辑）
            isImageMessage = true;
            content = `<img src="stickers/${escapeHtml(msg.message)}" class="chat-img file-preview" alt="${escapeHtml(msg.message)}" onclick="previewImage(this)">`;
        } else {
            // 普通文本消息（与公共聊天相同的处理逻辑）
            content = escapeHtml(msg.message);
            
            // 替换贴纸占位符 [sticker:文件名] -> <img>
            content = content.replace(/\[sticker:([^\]]+)\]/g, function(match, fileName) {
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

// ------------ 发送私聊消息  -----------------------
// 修改发送私聊消息函数，添加贴纸处理
async function sendPrivateMessage(e) {
    e.preventDefault();
    
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    if (!messageInput) return;
    
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
            
            const res = await fetch('api.php', {
                method: 'POST',
                body: form
            });
            
            const data = await res.json();
            if (data.status === 'ok') {
                messageInput.value = '';
                fetchPrivateMessages();
                stopTyping();
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
        
        if (sendButton) {
            sendButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>`;
            sendButton.disabled = false;
        }
    }
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
const DEBUG_MODE = false; // true 开启调试 false 关闭调试

// 用户状态调试函数
function debugUserStatus(users) {
    //console.group('🐛 用户状态调试');
	if (!DEBUG_MODE) return; // DEBUG_MODE 为 false 时直接退出
    
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
        '当前用户': username
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
    // 每30秒发送一次心跳
    heartbeatInterval = setInterval(async () => {
        try {
            await fetch('api.php?action=heartbeat');
        } catch (error) {
            console.error('心跳检测失败:', error);
        }
    }, 30000);
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
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                action: 'heartbeat',
                timestamp: Date.now()
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'ok') {
            if (data.users_updated) {
                fetchUsers();
            }
        }
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

// ==================== 页面可见性检测 ====================

// 监听页面可见性变化
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        fetchUsers();
        sendHeartbeat();
    }
});

// ==================== 网络状态检测 ====================

// 监听网络状态变化
window.addEventListener('online', function() {
    showToast('网络连接已恢复', 'success');
    fetchUsers();
    sendHeartbeat();
});

window.addEventListener('offline', function() {
    showToast('网络连接已断开', 'error');
});

// 在页面卸载时停止心跳
window.addEventListener('beforeunload', stopHeartbeat);

// 修改初始化函数，添加工具栏事件绑定
function initializeChat() {
    console.log('初始化聊天室功能...');
    
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
    if (chatBox) {
        scrollToBottom();
    }
    
    setupPrivateChat();
    startHeartbeat();
    
    console.log('聊天室初始化完成');
}

// DOM加载完成后初始化 - 替换原来的DOMContentLoaded
document.addEventListener('DOMContentLoaded', initChatRoom);

// 设置事件监听器
function setupEventListeners() {
    console.log('设置事件监听器...');
    
    // 消息发送表单 - 确保只添加一次监听器
    if (chatForm && !chatForm.hasAttribute('data-listener-added')) {
        chatForm.setAttribute('data-listener-added', 'true');
        chatForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            if (window.chatConfig && window.chatConfig.isPrivateChat) {
                sendPrivateMessage(e);
            } else {
                sendMessage(e);
            }
        });
    }
    
    // 输入框事件 - 确保只添加一次监听器
    if (messageInput && !messageInput.hasAttribute('data-listener-added')) {
        messageInput.setAttribute('data-listener-added', 'true');
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatForm) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
            }
        });
        
        messageInput.addEventListener('input', handleTyping);
    }
    
    // 退出登录按钮
    const logoutButtons = document.querySelectorAll('.logout, [onclick*="logout"]');
    logoutButtons.forEach(button => {
        if (!button.hasAttribute('data-listener-added')) {
            button.setAttribute('data-listener-added', 'true');
            button.addEventListener('click', function(e) {
                e.preventDefault();
                logout();
            });
        }
    });
    
    console.log('事件监听器设置完成');
}

// 设置私聊功能
function setupPrivateChat() {
    const usersContainer = document.getElementById('users');
    if (!usersContainer) return;
    
    usersContainer.addEventListener('click', function(e) {
        const userItem = e.target.closest('.user-item');
        if (!userItem) return;
        
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



// 获取用户信息
async function fetchUserInfo() {
    try {
        const res = await fetch('api.php?action=get_user_info');
        const data = await res.json();
        if (data.status === 'ok') {
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
            const currentMessageCount = chatBox.querySelectorAll('.message').length;
            if (currentMessageCount !== data.messages.length) {
                renderMessages(data.messages);
                
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
    let fileInfo = null;

    // 处理消息类型
    if (msg.type === 'file') {
        try {
            fileInfo = JSON.parse(msg.message);
            if (fileInfo.type === 'image') {
                isImageMessage = true;
                content = `<img src="uploads/${escapeHtml(fileInfo.saved_name)}" class="chat-img file-preview" alt="${escapeHtml(fileInfo.filename)}" onclick="previewImage(this)">`;
            } else {
                isFileMessage = true;
                content = `<a href="uploads/${escapeHtml(fileInfo.saved_name)}" target="_blank" class="chat-file">${escapeHtml(fileInfo.filename)}</a>`;
            }
        } catch (e) {
            console.error('解析文件消息失败', e);
            // 回退到普通文本显示
            content = escapeHtml(msg.message);
        }
    } else if (msg.type === 'image') {
        isImageMessage = true;
        content = `<img src="${msg.message}" class="chat-img" alt="图片消息" onclick="previewImage(this)">`;
    } else {
        // 普通文本消息，先处理贴纸，再处理链接和换行
        content = escapeHtml(msg.message);
        
        // 替换贴纸占位符 [sticker:文件名] -> <img>
        content = content.replace(/\[sticker:([^\]]+)\]/g, function(match, fileName) {
            console.log('匹配到贴纸:', match, '文件名:', fileName);
            isImageMessage = true; // 让外层 div 加上 image-message
    return `<img src="stickers/${fileName}" class="chat-img file-preview" alt="${fileName}" onclick="previewImage(this)">`;
});
        
        // 处理链接
        content = content.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        
        // 处理换行
        content = content.replace(/\n/g, '<br>');
    }

    const time = formatMessageTime(msg.created_at);
    let deleteBtn = '';
    
    // 只有自己的消息显示删除按钮
    if (msg.username === username) {
        deleteBtn = `<span class="delete-msg-btn" title="删除消息" onclick="deleteMessage(${msg.id}, this)">🗑️</span>`;
    }

    // 构建消息HTML
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
            <div class="message-time">${time}</div>
        </div>
    `;

    return div;
}

// 删除主窗口聊天消息
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

// 发送消息（公共聊天）
async function sendMessage(e) {
    e.preventDefault();
    
    if (!messageInput) return;
    
    const msg = messageInput.value.trim();
    if (!msg) return;
    
    try {
        const form = new URLSearchParams({
            action: 'send_message',
            message: msg
        });
        
        if (sendButton) {
            const originalHTML = sendButton.innerHTML;
            sendButton.innerHTML = '<div class="loading-spinner"></div>';
            sendButton.disabled = true;
            
            const response = await fetch('api.php', {
                method: 'POST',
                body: form
            });
            
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
        
        if (sendButton) {
            sendButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>`;
            sendButton.disabled = false;
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
            debugUserStatus(data.users);
            
            container.innerHTML = '';
            data.users.forEach(u => {
                const userElement = createUserElement(u);
                container.appendChild(userElement);
            });
            
            updateUsersStatusDisplay(data.users);
            updateOnlineUserCount(data.users);
        }
    } catch (error) {
        console.error('获取用户列表失败:', error);
    }
}

// 更新在线用户计数
function updateOnlineUserCount(users) {
    const onlineCount = users.filter(u => u.online).length;
    const onlineCountElement = document.getElementById('online-count');
    
    if (onlineCountElement) {
        onlineCountElement.textContent = `${onlineCount}人在线`;
    }
    
    if (onlineCount > 1) {
        document.title = `聊天室 (${onlineCount}人在线)`;
    }
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
            ${user.role !== 'user' ?
                `<span class="user-role" title="${user.role}">${user.role === 'admin' ? '👑' : '⭐'}</span>` :
                ''
            }
        </div>
        <div class="user-status" style="background: ${user.online ? '#2ecc71' : '#95a5a6'}" title="${user.online ? '在线' : '离线'}"></div>
        ${user.online ? '<span class="user-ping-indicator"></span>' : ''}
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

// 更新用户状态显示
function updateUsersStatusDisplay(users) {
    const userItems = document.querySelectorAll('.user-item');
    
    userItems.forEach(item => {
        const username = item.dataset.username;
        const user = users.find(u => u.username === username);
        
        if (user) {
            // 更新在线状态类
            item.classList.toggle('online', user.online);
            item.classList.toggle('offline', !user.online);
            
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
            
            // 更新ping指示器
            const pingIndicator = item.querySelector('.user-ping-indicator');
            if (pingIndicator) {
                if (user.online) {
                    pingIndicator.style.display = 'block';
                    // 根据最后活动时间设置ping状态
                    if (user.last_active) {
                        const lastActive = new Date(user.last_active);
                        const now = new Date();
                        const minutesDiff = (now - lastActive) / (1000 * 60);
                        
                        if (minutesDiff < 1) {
                            pingIndicator.style.background = '#2ecc71'; // 刚刚活动
                        } else if (minutesDiff < 5) {
                            pingIndicator.style.background = '#f39c12'; // 5分钟内活动
                        } else {
                            pingIndicator.style.background = '#e74c3c'; // 超过5分钟未活动
                        }
                    }
                } else {
                    pingIndicator.style.display = 'none';
                }
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
    // 移除原来的全局徽章（如果存在）
    const oldBadge = document.getElementById('unread-badge');
    if (oldBadge) {
        oldBadge.remove();
    }
    
    // 在私聊图标旁边显示徽章
    const privateChatIcons = document.querySelectorAll('.private-chat-icon');
    privateChatIcons.forEach(icon => {
        // 移除可能已存在的徽章
        const existingBadge = icon.parentElement.querySelector('.unread-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
        
        // 创建新的徽章
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
        
        // 添加到私聊图标的父元素中
        icon.parentElement.style.position = 'relative';
        icon.parentElement.appendChild(badge);
    });
}

function hideUnreadBadge() {
    // 移除所有未读徽章
    const badges = document.querySelectorAll('.unread-badge');
    badges.forEach(badge => badge.remove());
    
    // 也移除可能存在的全局徽章
    const globalBadge = document.getElementById('unread-badge');
    if (globalBadge) {
        globalBadge.remove();
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
                window.location.href = 'logout.php';
            }, 1000);
        } else {
            showToast('退出失败: ' + (data.message || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('退出失败:', error);
        showToast('网络错误，退出失败', 'error');
    }
}

// ------------设置管理员功能-------------

// 切换管理员面板
function toggleAdminPanel() {
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) {
        adminPanel.style.display = adminPanel.style.display === 'block' ? 'none' : 'block';
    }
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

// 管理员功能
function toggleAdminPopup() {
    const popup = document.getElementById('admin-popup');
    if (popup) {
        popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
    }
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
        
        if (userManagement.style.display === 'block') {
            loadDeletableUsers();
        }
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
            
            // 修复CSS属性名
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


// 信息默认滚动最新

function scrollToBottom() {
    const chatBox = document.getElementById('chat-box');
    if (chatBox) {
        chatBox.scrollTo({
            top: chatBox.scrollHeight,
            behavior: 'smooth'
        });
    }
}


// -------------------- 工具栏 --------------------
// ==================== 工具栏功能 ====================

// 切换表情面板
function toggleEmojiPanel() {
    const emojiPanel = document.getElementById('emoji-panel');
    const stickerPanel = document.getElementById('sticker-panel');
    
    if (emojiPanel && emojiPanel.style.display === 'grid') {
        emojiPanel.style.display = 'none';
    } else if (emojiPanel) {
        emojiPanel.style.display = 'grid';
        if (stickerPanel) {
            stickerPanel.style.display = 'none';
        }
    }
}

// 切换贴纸面板
function toggleStickerPanel() {
    const stickerPanel = document.getElementById('sticker-panel');
    const emojiPanel = document.getElementById('emoji-panel');
    
    if (stickerPanel && stickerPanel.style.display === 'grid') {
        stickerPanel.style.display = 'none';
    } else if (stickerPanel) {
        stickerPanel.style.display = 'grid';
        if (emojiPanel) {
            emojiPanel.style.display = 'none';
        }
    }
}


// 设置工具栏事件
function setupToolbarEvents() {
    console.log('设置工具栏事件...');
    
    // 获取所有工具栏按钮
    const toolbarButtons = document.querySelectorAll('.chat-input-action.clickable');
    
    if (toolbarButtons.length >= 4) {
        // 文件上传按钮 (第一个)
        if (!toolbarButtons[0].hasAttribute('data-listener-added')) {
            toolbarButtons[0].setAttribute('data-listener-added', 'true');
            toolbarButtons[0].addEventListener('click', function() {
                const fileInput = document.getElementById('file-input');
                if (fileInput) {
                    fileInput.click();
                }
            });
        }
        
        // 表情按钮 (第二个)
        if (!toolbarButtons[1].hasAttribute('data-listener-added')) {
            toolbarButtons[1].setAttribute('data-listener-added', 'true');
            toolbarButtons[1].addEventListener('click', toggleEmojiPanel);
        }
        
        // 贴纸按钮 (第三个)
        if (!toolbarButtons[2].hasAttribute('data-listener-added')) {
            toolbarButtons[2].setAttribute('data-listener-added', 'true');
            toolbarButtons[2].addEventListener('click', toggleStickerPanel);
        }
        
        // 更多工具按钮 (第四个)
        if (!toolbarButtons[3].hasAttribute('data-listener-added')) {
            toolbarButtons[3].setAttribute('data-listener-added', 'true');
            toolbarButtons[3].addEventListener('click', showMoreTools);
        }
    }
    
    console.log('工具栏事件设置完成');
}


// -------------------- Emoji面板面板 --------------------

// 切换Emoji面板
function toggleEmojiPanel() {
    const emojiPanel = document.getElementById('emoji-panel');
    const stickerPanel = document.getElementById('sticker-panel');
    
    if (emojiPanel.style.display === 'grid') {
        emojiPanel.style.display = 'none';
    } else {
        emojiPanel.style.display = 'grid';
        if (stickerPanel) {
            stickerPanel.style.display = 'none';
        }
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
    
// -------------------- 贴纸面板 --------------------
// 切换贴纸面板
function toggleStickerPanel() {
    const stickerPanel = document.getElementById('sticker-panel');
    const emojiPanel = document.getElementById('emoji-panel');
    
    if (stickerPanel.style.display === 'grid') {
        stickerPanel.style.display = 'none';
    } else {
        stickerPanel.style.display = 'grid';
        if (emojiPanel) {
            emojiPanel.style.display = 'none';
        }
    }
}

// 显示更多工具
function showMoreTools() {
    // 这里可以添加更多工具的功能
    alert('更多工具功能待开发');
    // 例如：清空聊天、设置等功能
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
                
                // 自动发送
                if (chatForm) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
                
                stickerPanel.style.display = 'none';
            }
        });
        stickerPanel.appendChild(img);
    });
    
    stickerPanel.setAttribute('data-initialized', 'true');
}


// ==================== 文件上传处理 ====================
// 文件上传处理
function setupFileUpload() {
    const fileInput = document.getElementById('file-input');
    if (fileInput && !fileInput.hasAttribute('data-listener-added')) {
        fileInput.setAttribute('data-listener-added', 'true');
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                document.getElementById('upload-form').submit();
            }
        });
    }
}


// 确保文件上传表单有正确的事件监听
document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('file-input');
    if (fileInput && !fileInput.hasAttribute('data-listener-added')) {
        fileInput.setAttribute('data-listener-added', 'true');
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                document.getElementById('upload-form').submit();
            }
        });
    }
});

// 点击外部关闭面板
function setupPanelCloseHandlers() {
    document.addEventListener('click', function(e) {
        const emojiPanel = document.getElementById('emoji-panel');
        const stickerPanel = document.getElementById('sticker-panel');
        
        // 如果点击的不是表情相关元素，关闭表情面板
        if (emojiPanel && emojiPanel.style.display === 'grid' && 
            !e.target.closest('#emoji-panel') && 
            !e.target.closest('.chat-input-action.clickable:nth-child(2)')) {
            emojiPanel.style.display = 'none';
        }
        
        // 如果点击的不是贴纸相关元素，关闭贴纸面板
        if (stickerPanel && stickerPanel.style.display === 'grid' && 
            !e.target.closest('#sticker-panel') && 
            !e.target.closest('.chat-input-action.clickable:nth-child(3)')) {
            stickerPanel.style.display = 'none';
        }
    });
}


// -------------- 共享文件--------------------------

// 点击按钮显示共享文件并加载列表
function openSharedFiles() {
    const dialog = document.getElementById('shared-files-dialog');
    dialog.style.display = (dialog.style.display === 'block') ? 'none' : 'block';
    loadSharedFiles(); // 每次打开都刷新列表
}

// 关闭共享文件菜单
function closeSharedFiles() {
    document.getElementById('shared-files-dialog').style.display = 'none';
}

// 加载服务器本地文件列表
async function loadSharedFiles() {
    try {
        const list = document.getElementById('shared-files-list');
        list.innerHTML = ''; // 先清空

        // 获取服务器本地文件列表
        const localRes = await fetch('api.php?action=get_local_files');
        const localData = await localRes.json();

        // 获取数据库中的文件信息以显示上传者和消息ID
        const dbRes = await fetch('api.php?action=get_messages');
        const dbData = await dbRes.json();

        // 创建文件名到消息信息的映射
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
                    // 从文件名中提取原始文件名（移除时间戳前缀）
                    const originalName = file.replace(/^\d+_/, '');
                    const fileInfo = fileInfoMap[file] || { username: '未知用户' };
                    
                    const li = document.createElement('li');
                    li.style.display = 'flex';
                    li.style.justifyContent = 'space-between';
                    li.style.alignItems = 'center';
                    li.style.marginBottom = '10px';
                    li.style.padding = '8px';
                    li.style.borderBottom = '1px solid #eee';

                    const fileContent = document.createElement('div');
                    fileContent.style.flex = '1';
                    
                    const link = document.createElement('a');
                    link.href = `uploads/${encodeURIComponent(file)}`;
                    link.download = originalName;
                    link.textContent = originalName;
                    link.style.fontWeight = 'bold';
                    link.style.textDecoration = 'none';
                    link.style.color = '#333';
                    
                    const metaInfo = document.createElement('div');
                    metaInfo.style.fontSize = '11px';
                    metaInfo.style.color = '#888';
                    metaInfo.textContent = `上传者: ${fileInfo.username}`;
                    
                    fileContent.appendChild(link);
                    fileContent.appendChild(metaInfo);
                    
                    li.appendChild(fileContent);

                    // 删除按钮（仅管理员显示）
                    if (role === 'admin') {
                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = '删除';
                        deleteBtn.style.background = '#f44336';
                        deleteBtn.style.color = 'white';
                        deleteBtn.style.border = 'none';
                        deleteBtn.style.padding = '4px 8px';
                        deleteBtn.style.borderRadius = '3px';
                        deleteBtn.style.cursor = 'pointer';
                        deleteBtn.style.marginLeft = '10px';
                        deleteBtn.style.fontSize = '12px';
                        
                        deleteBtn.onclick = async () => {
                            if (confirm(`确定删除文件 "${originalName}" 吗？`)) {
                                try {
                                    // 如果数据库中有记录，使用原有的删除接口
                                    if (fileInfo.message_id) {
                                        const deleteRes = await fetch('api.php?action=delete_message_admin', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/x-www-form-urlencoded'
                                            },
                                            body: `message_id=${fileInfo.message_id}`
                                        });
                                        
                                        const deleteData = await deleteRes.json();
                                        
                                        if (deleteData.status === 'ok') {
                                            // 从前端移除列表项
                                            li.remove();
                                            
                                            // 如果删除了所有文件，显示提示
                                            if (list.children.length === 0) {
                                                list.innerHTML = '<li>暂无共享文件</li>';
                                            }
                                        } else {
                                            alert('文件删除失败: ' + deleteData.message);
                                        }
                                    } else {
                                        // 如果数据库中没有记录，只删除物理文件
                                        const formData = new FormData();
                                        formData.append('filename', file);
                                        
                                        const deleteRes = await fetch('api.php?action=delete_local_file', {
                                            method: 'POST',
                                            body: formData
                                        });
                                        
                                        const deleteData = await deleteRes.json();
                                        
                                        if (deleteData.status === 'ok') {
                                            // 从前端移除列表项
                                            li.remove();
                                            
                                            // 如果删除了所有文件，显示提示
                                            if (list.children.length === 0) {
                                                list.innerHTML = '<li>暂无共享文件</li>';
                                            }
                                        } else {
                                            alert('文件删除失败: ' + deleteData.message);
                                        }
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
        } else {
            list.innerHTML = '<li>加载失败</li>';
        }

    } catch (err) {
        console.error('加载共享文件失败:', err);
        const list = document.getElementById('shared-files-list');
        list.innerHTML = '<li>加载失败</li>';
    }
}

// --------------- 密码修改 ---------------------------------------
// 切换密码菜单显示
function toggleChangePasswordMenu() {
    const menu = document.getElementById('change-password-menu');
    menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    
    // 确保切换功能已初始化
    setTimeout(initPasswordToggle, 10);
}

// 密码显示/隐藏功能 - 独立函数
function initPasswordToggle() {
    document.querySelectorAll('.toggle-password').forEach(button => {
        // 确保不会重复绑定事件
        if (!button.hasAttribute('data-toggle-bound')) {
            button.setAttribute('data-toggle-bound', 'true');
            
            button.addEventListener('click', function() {
                const input = this.parentElement.querySelector('input');
                const isPassword = input.type === 'password';
                const icon = this.querySelector('.eye-icon');
                
                // 切换输入框类型
                input.type = isPassword ? 'text' : 'password';
                
                // 切换图标
                if (isPassword) {
                    // 显示隐藏状态的图标（睁眼）
                    icon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
                } else {
                    // 显示可见状态的图标（闭眼）
                    icon.innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>';
                }
                
                // 更新ARIA标签
                this.setAttribute('aria-label', isPassword ? '隐藏密码' : '显示密码');
            });
        }
    });
}

// 通用密码修改
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('change-password-form');
    if (!form) return;
    
    // 页面加载时立即初始化密码显示/隐藏功能
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
                // 修改成功后退出到登录
                window.location.href = 'logout.php';
            }
        } catch (err) {
            alert('修改密码失败，请稍后重试');
        }
    });
});


// 支持Shift+Enter换行和自动调整高度
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('message');
    const chatForm = document.getElementById('chat-form');
    
    if (messageInput) {
        // 自动调整文本区域高度
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            
            // 限制最大高度
            if (this.scrollHeight > 120) {
                this.style.overflowY = 'auto';
            } else {
                this.style.overflowY = 'hidden';
            }
        });
        
        // 支持Shift+Enter换行
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    // Shift+Enter - 插入换行
                    return;
                } else {
                    // Enter - 提交表单
                    e.preventDefault();
                    if (chatForm) {
                        chatForm.dispatchEvent(new Event('submit'));
                    }
                }
            }
        });
        
        // 初始化高度
        setTimeout(() => {
            messageInput.style.height = 'auto';
            messageInput.style.height = (messageInput.scrollHeight) + 'px';
        }, 100);
    }
});

// ==================== 主题 ====================

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

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('selectedTheme') || 'default';
    applyTheme(savedTheme);
    
    // 标记当前选中的主题
    document.querySelectorAll('.theme-option').forEach(option => {
        if (option.getAttribute('data-theme') === savedTheme) {
            option.classList.add('active');
        } else {
            option.classList.remove('active');
        }
    });
}

// 应用主题
function applyTheme(theme) {
    const userList = document.querySelector('.user-list');
    const themeConfig = themes[theme];
    
    if (userList && themeConfig) {
        userList.style.background = themeConfig.background;
        userList.style.backdropFilter = themeConfig.backdropFilter;
        userList.style.webkitBackdropFilter = themeConfig.backdropFilter;
        userList.style.boxShadow = themeConfig.boxShadow;
        userList.style.borderRight = themeConfig.borderRight;
    }
    
    // 保存到本地存储
    localStorage.setItem('selectedTheme', theme);
}

// 主题切换功能
document.getElementById('theme-toggle').addEventListener('click', function(e) {
    e.stopPropagation();
    const themePanel = document.getElementById('theme-panel');
    themePanel.style.display = themePanel.style.display === 'block' ? 'none' : 'block';
});

// 点击主题选项
document.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', function() {
        const theme = this.getAttribute('data-theme');
        applyTheme(theme);
        document.getElementById('theme-panel').style.display = 'none';
        
        // 更新选中状态
        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.classList.remove('active');
        });
        this.classList.add('active');
    });
});

// 点击页面其他区域关闭主题面板
document.addEventListener('click', function(e) {
    if (!e.target.closest('#theme-panel') && !e.target.closest('#theme-toggle')) {
        document.getElementById('theme-panel').style.display = 'none';
    }
});

// 页面加载时初始化主题
document.addEventListener('DOMContentLoaded', initTheme);


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