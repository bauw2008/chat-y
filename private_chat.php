<?php
session_start();

// 检查数据库是否已初始化
$dbFile = __DIR__ . '/data/chat.db';
$initialized = false;

if (file_exists($dbFile)) {
    try {
        $db = new PDO("sqlite:$dbFile");
        $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username = 'admin'");
        $stmt->execute();
        $initialized = (bool)$stmt->fetchColumn();
    } catch (Exception $e) {
        $initialized = false;
    }
}

if (!$initialized) {
    header("Location: index.php");
    exit;
}

if (!isset($_SESSION['username'])) {
    header("Location: login.php");
    exit;
}

$me = $_SESSION['username'];
$targetUser = $_GET['user'] ?? '';

if (!$targetUser) die("请选择聊天对象");
if ($targetUser === $me) die("不能与自己私聊");

try {
    $db = new PDO("sqlite:$dbFile");
    $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username = :user");
    $stmt->execute([':user' => $targetUser]);
    $userExists = (bool)$stmt->fetchColumn();
    if (!$userExists) die("用户不存在");
} catch (Exception $e) {
    die("数据库错误");
}

$stmt = $db->prepare("UPDATE users SET last_active=CURRENT_TIMESTAMP WHERE username=:u");
$stmt->execute([':u' => $me]);

$stmt = $db->prepare("UPDATE private_messages SET is_read = 1 WHERE receiver = :me AND sender = :sender AND is_read = 0");
$stmt->execute([':me' => $me, ':sender' => $targetUser]);

$emojis = ["😀","😂","😎","😍","😭","😡","😱","🤔","👍","🎉","💖","😴","😜","🤯","🥳","🙈","🐱","🐶","🌹","🔥"];
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>和 <?= htmlspecialchars($targetUser) ?> 的私聊</title>
<link rel="stylesheet" href="assets/css/chat.css">
</head>
<body>
<div class="chat-container private-chat-container">
  <div class="private-chat-header">
    <a href="chat.php" class="back-button">← 返回大厅</a>
    <div class="private-user-info">
      <div style="font-weight: 500;">与 <?= htmlspecialchars($targetUser) ?> 聊天</div>
      <div style="font-size: 12px; opacity: 0.8;" id="user-status">状态检测中...</div>
    </div>
  </div>

    <div class="chat-area">
        <div id="chat-box" class="chat-box"></div>

        <div class="toolbar-container">
            <div class="toolbar">
                <button type="button" class="toolbar-btn" onclick="document.getElementById('file-input').click()" title="上传文件">
                    <span class="toolbar-icon">📎</span>
                    <span class="toolbar-label">上传</span>
                </button>
                <input type="file" id="file-input" style="display: none">
                
                <button type="button" class="toolbar-btn" onclick="toggleEmojiPanel()" title="表情">
                    <span class="toolbar-icon">😊</span>
                    <span class="toolbar-label">表情</span>
                </button>
        
        <button type="button" class="toolbar-btn" onclick="deleteChatHistory()" title="清空历史">
          <span class="toolbar-icon">🧹</span>
          <span class="toolbar-label">清空历史</span>
        </button>
                
                <button type="button" class="toolbar-btn" onclick="showMoreTools()" title="更多工具">
                    <span class="toolbar-icon">➕</span>
                    <span class="toolbar-label">更多</span>
                </button>
            </div>

            <div id="emoji-panel" class="emoji-panel"></div>
        </div>

        <form id="chat-form" class="chat-form">
            <input type="hidden" id="target-user" value="<?= htmlspecialchars($targetUser) ?>">
            <input type="text" id="message" class="chat-input" placeholder="输入消息..." required>
            <button type="submit" class="send-btn">发送</button>
        </form>
    </div>
</div>

<script>
const me = "<?= htmlspecialchars($me) ?>";
const targetUser = "<?= htmlspecialchars($targetUser) ?>";
let isTyping = false;
let typingTimer = null;

document.addEventListener('DOMContentLoaded', function() {
    renderEmojis();
    fetchMessages();
    checkUserStatus();
    setInterval(fetchMessages, 2000);
    setInterval(checkUserStatus, 5000);

    document.getElementById('chat-form').addEventListener('submit', sendMessage);
    const messageInput = document.getElementById('message');
    messageInput.addEventListener('input', handleTyping);
    messageInput.addEventListener('keydown', function(e) {
        if(e.key==='Enter' && !e.shiftKey){e.preventDefault();document.getElementById('chat-form').dispatchEvent(new Event('submit'));}
    });
    messageInput.focus();
});

// 渲染emoji
function renderEmojis(){
    const emojis = <?= json_encode($emojis) ?>;
    const panel = document.getElementById('emoji-panel');
    panel.innerHTML = '';
    emojis.forEach(e=>{
        const div=document.createElement('div');
        div.className='emoji-item';
        div.textContent=e;
        div.onclick=()=>{document.getElementById('message').value+=e;document.getElementById('message').focus();panel.style.display='none';};
        panel.appendChild(div);
    });
}

// 切换emoji面板
function toggleEmojiPanel(){
    const panel=document.getElementById('emoji-panel');
    panel.style.display=panel.style.display==='grid'?'none':'grid';
}

// 更多工具
function showMoreTools(){alert('功能待开发');}

// 获取消息
async function fetchMessages(){
    try{
        const res=await fetch(`api.php?action=get_private_messages&target_user=${encodeURIComponent(targetUser)}`);
        const data=await res.json();
        if(data.status==='ok') renderMessages(data.messages);
    }catch(e){console.error(e);}
}

// 渲染消息
let lastMessageId = 0; // 记录最新消息ID

function renderMessages(messages){
    const chatBox = document.getElementById('chat-box');
    messages.forEach(msg=>{
        if(msg.id <= lastMessageId) return; // 跳过已渲染消息
        const div = document.createElement('div');
        div.className = `message ${msg.sender===me?'me':'other'} ${msg.is_read===0&&msg.receiver===me?'unread':''}`;
        
        const avatar = `https://api.dicebear.com/6.x/pixel-art/svg?seed=${encodeURIComponent(msg.sender)}`;
        let content = msg.type==='image' ? `<img src="${msg.message}" class="chat-img">` : escapeHtml(msg.message);
        content = content.replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank">$1</a>');

        const time = formatMessageTime(msg.created_at);

        // 删除按钮，只给自己发送的消息
        let deleteBtn = '';
        if(msg.sender === me){
            deleteBtn = `<span class="delete-msg-btn" title="删除消息" onclick="deleteMessage(${msg.id}, this)">🗑️</span>`;
        }

        div.innerHTML = `
            <div class="bubble">
                <div class="msg-header">
                    <img src="${avatar}" class="message-avatar">
                    <span>${escapeHtml(msg.sender)}</span>
                    ${deleteBtn}
                </div>
                <div class="message-content">${content}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
        chatBox.appendChild(div);
        lastMessageId = Math.max(lastMessageId, msg.id);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 删除消息函数
async function deleteMessage(messageId, btnElement){
    if(!confirm('确认删除这条消息吗？')) return;
    try{
        const form = new URLSearchParams({action:'delete_private_message', message_id:messageId});
        const res = await fetch('api.php', {method:'POST', body: form});
        const data = await res.json();
        if(data.status==='ok'){
            // 从 DOM 删除消息节点
            const messageDiv = btnElement.closest('.message');
            if(messageDiv) messageDiv.remove();
        } else {
            alert('删除失败: '+(data.message||'未知错误'));
        }
    }catch(e){
        console.error(e);
        alert('网络错误，删除失败');
    }
}


// 发送消息
async function sendMessage(e){
    e.preventDefault();
    const message=document.getElementById('message').value.trim();
    if(!message) return;
    const btn=document.querySelector('.send-btn');
    const orig=btn.textContent;
    btn.textContent='发送中...'; btn.disabled=true;
    try{
        const form=new URLSearchParams({action:'send_private_message',receiver:targetUser,message,message,type:'text'});
        const res=await fetch('api.php',{method:'POST',body:form});
        const data=await res.json();
        if(data.status==='ok'){document.getElementById('message').value='';fetchMessages();stopTyping();}
        else alert('发送失败:'+ (data.message||'未知错误'));
    }catch(e){console.error(e);alert('网络错误');}
    btn.textContent=orig; btn.disabled=false;
}

// 用户状态
async function checkUserStatus(){
    try{
        const res=await fetch('api.php?action=get_users');
        const data=await res.json();
        if(data.status==='ok'){
            const user=data.users.find(u=>u.username===targetUser);
            const status=document.getElementById('user-status');
            if(user && status){
                const online=user.online;
                status.textContent=online?'🟢 在线':'⚫ 离线';
                status.style.color=online?'#27ae60':'#95a5a6';
                document.title=online?`💬 与 ${targetUser} 私聊（在线）`:`💬 与 ${targetUser} 私聊（离线）`;
            }
        }
    }catch(e){console.error(e);}
}

async function deleteChatHistory(){
    if(!confirm(`确定删除与 ${targetUser} 的所有聊天记录吗？此操作不可撤销！`)) return;

    try{
        const form = new URLSearchParams({action: 'delete_private_chat_history', target_user: targetUser});
        const res = await fetch('api.php', {method: 'POST', body: form});
        const data = await res.json();

        if(data.status === 'ok'){
            const chatBox = document.getElementById('chat-box');
            chatBox.innerHTML = '';
            lastMessageId = 0; // 重置消息ID
            alert('聊天记录已删除');
        } else {
            alert('删除失败：' + (data.message || '未知错误'));
        }
    } catch(e) {
        console.error(e);
        alert('网络错误，删除失败');
    }
}


// 输入状态
function handleTyping(){if(!isTyping)isTyping=true;clearTimeout(typingTimer);typingTimer=setTimeout(stopTyping,1000);}
function stopTyping(){isTyping=false;}

// 工具函数
function escapeHtml(text){const div=document.createElement('div');div.textContent=text;return div.innerHTML;}
function formatMessageTime(timestamp){const t=new Date(timestamp);const diff=new Date()-t;const m=Math.floor(diff/60000);if(m<1)return'刚刚';if(m<60)return m+'分钟前';if(m<1440)return Math.floor(m/60)+'小时前';return t.toLocaleDateString();}
</script>
</body>
</html>
