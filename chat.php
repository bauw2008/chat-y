<?php
// chat.php - 聊天室主页面
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

// 如果未初始化，跳转到初始化页面
if (!$initialized) {
    header("Location: index.php");
    exit;
}

// 登录检查
if (!isset($_SESSION['username'])) {
    header("Location: login.php");
    exit;
}

// 设置用户信息
$username = $_SESSION['username'];
$role = $_SESSION['role'] ?? 'user';

// 更新最后活动时间
$db = new PDO("sqlite:$dbFile");
$stmt = $db->prepare("UPDATE users SET last_active=CURRENT_TIMESTAMP WHERE username=:u");
$stmt->execute([':u' => $username]);

// 使用DiceBear API生成头像（与JavaScript端保持一致）
$avatar = "https://api.dicebear.com/6.x/pixel-art/svg?seed=" . urlencode($username);
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>聊天室</title>
  <link rel="stylesheet" href="assets/css/chat.css">
</head>
<body>
    <!-- 遮罩层 -->
    <div class="side-menu-overlay" onclick="closeSideMenu()"></div>
    
    <!-- 菜单按钮 -->
    <button class="menu-toggle" onclick="toggleSideMenu()">☰</button>

    <div class="chat-container">
        <div class="user-list">
            <h3 class="user-list-title">
                聊天室
                <button class="close-side-menu" onclick="closeSideMenu()">×</button>
            </h3>
            
            <!-- 用户信息区域 -->
            <div class="user-profile">
                <div class="profile-header">
                    <img src="<?php echo $avatar; ?>" alt="用户头像" class="user-avatar">
                    <div class="user-details">
                        <div class="user-name"><?php echo htmlspecialchars($username); ?></div>
                        <div class="user-role"><?php echo $role === 'admin' ? '管理员' : '普通用户'; ?></div>
                    </div>
                </div>
                
                <div class="profile-actions">
                    <?php if ($role === 'admin'): ?>
                        <button class="profile-btn" onclick="toggleAdminPanel()">
                            <i>⚙️</i> 管理功能
                        </button>
                    <?php endif; ?>
                    <button class="profile-btn logout" onclick="logout()">
                        <i>🔓</i> 退出登录
                    </button>
                </div>
                
                <!-- 管理员面板 -->
                <?php if ($role === 'admin'): ?>
                <div id="admin-panel" class="admin-panel">
                    <button id="clear-chat" class="admin-btn">清理聊天记录</button>
                    <button id="manage-users" class="admin-btn">管理用户</button>
                    <div id="user-management" class="user-management">
                        <select id="user-select" class="user-select"></select>
                        <button id="delete-user" class="admin-btn delete-btn">删除用户</button>
                    </div>
                </div>
                <?php endif; ?>
            </div>
            
            <!-- 在线用户列表 -->
            <div class="online-users">
                <h4>在线用户</h4>
                <div id="users">
                    <!-- 用户列表将通过JavaScript动态加载 -->
                </div>
            </div>
        </div>

        <div class="chat-area">
            <!-- 聊天内容区域 -->
            <div id="chat-box" class="chat-box"></div>
            
            <!-- 工具栏区域 -->
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
                    
                    <!-- 可以在这里添加更多工具栏按钮 -->
                    <button type="button" class="toolbar-btn" onclick="showMoreTools()" title="更多工具">
                        <span class="toolbar-icon">➕</span>
                        <span class="toolbar-label">更多</span>
                    </button>
                </div>
                
                <!-- Emoji面板 -->
                <div id="emoji-panel" class="emoji-panel">
                    <!-- Emoji通过JavaScript动态加载 -->
                </div>
            </div>
            
            <!-- 输入区域 -->
            <form id="chat-form" class="chat-form">
                <input type="text" id="message" class="chat-input" placeholder="输入消息..." required>
                <button type="submit" class="send-btn">发送</button>
            </form>
        </div>
    </div>

    <script>
    const username = "<?php echo $username; ?>";
    const role = "<?php echo $role; ?>";
    
    // 侧边菜单功能
    function toggleSideMenu() {
      document.querySelector('.user-list').classList.toggle('active');
      document.querySelector('.side-menu-overlay').classList.toggle('active');
    }
    
    function closeSideMenu() {
      document.querySelector('.user-list').classList.remove('active');
      document.querySelector('.side-menu-overlay').classList.remove('active');
    }
    
    function logout() {
      if (confirm('确定要退出登录吗？')) {
        window.location.href = 'logout.php';
      }
    }
    
    // 切换管理员面板
    function toggleAdminPanel() {
      const adminPanel = document.getElementById('admin-panel');
      if (adminPanel) {
        adminPanel.style.display = adminPanel.style.display === 'block' ? 'none' : 'block';
      }
    }
    
    // 切换Emoji面板
    function toggleEmojiPanel() {
      const emojiPanel = document.getElementById('emoji-panel');
      emojiPanel.style.display = emojiPanel.style.display === 'grid' ? 'none' : 'grid';
    }
    
    // 显示更多工具
    function showMoreTools() {
      alert('更多工具功能待开发');
    }
    
    // 点击遮罩层关闭菜单
    document.querySelector('.side-menu-overlay').addEventListener('click', closeSideMenu);
    
    // 初始化一些示例emoji
    document.addEventListener('DOMContentLoaded', function() {
      const emojiPanel = document.getElementById('emoji-panel');
      const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳'];
      
      emojis.forEach(emoji => {
        const emojiElement = document.createElement('div');
        emojiElement.className = 'emoji-item';
        emojiElement.textContent = emoji;
        emojiElement.addEventListener('click', function() {
          document.getElementById('message').value += emoji;
          document.getElementById('emoji-panel').style.display = 'none';
        });
        emojiPanel.appendChild(emojiElement);
      });
    });
    </script>
    
    <script src="assets/js/chat.js"></script>
</body>
</html>