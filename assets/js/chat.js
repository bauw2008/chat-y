// assets/js/chat.js

// 用户状态调试函数
//function debugUserStatus(users) {
    //console.group('🐛 用户状态调试');
    //console.table(users.map(user => ({
        //用户名: user.username,
       // 在线状态: user.online ? '🟢 在线' : '🔴 离线',
        //最后活动: user.last_active || '无记录',
        //角色: user.role
    //})));
    //console.groupEnd();
//}

// 聊天室前端逻辑
const emojis = ['😀','😂','😍','👍','🙏','😢','🎉','💯','❤️','🔥','✨','🎯','🤔','😴','🥳'];
let isScrolledToBottom = true;
let autoScrollEnabled = true;
let heartbeatInterval;

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

// 在初始化时启动心跳
document.addEventListener('DOMContentLoaded', function() {
    // ... 其他初始化代码 ...
    startHeartbeat();
});

// 在页面卸载时停止心跳
window.addEventListener('beforeunload', stopHeartbeat);

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('初始化聊天室，用户:', username, '角色:', role);
    
    initializeChat();
    setupEventListeners();
    setupKeyboardShortcuts();
});

// 初始化聊天室
function initializeChat() {
    renderEmojis();
    fetchUserInfo();
    fetchMessages();
    fetchUsers();
    
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
    // 消息发送
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', sendMessage);
    }
    
    // 退出登录
    const logoutIcon = document.getElementById('logout-icon');
    if (logoutIcon) {
        logoutIcon.addEventListener('click', logout);
    }
    
    // 管理员功能
    if (role === 'admin') {
        setupAdminFeatures();
    }
    
    // 表情点击
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('emoji')) {
            const messageInput = document.getElementById('message');
            if (messageInput) {
                messageInput.value += e.target.textContent;
                messageInput.focus();
            }
        }
    });
    
    // 输入框按键事件
    const messageInput = document.getElementById('message');
    if (messageInput) {
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
                fetchMessages();
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
      // 调试输出
            // debugUserStatus(data.users);
      
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

// 工具函数
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