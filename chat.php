<?php
// chat.php - 修复版聊天室主页面
session_start();

// 检查数据库是否已初始化
$dbFile = __DIR__ . '/data/chat.db';
$initialized = false;

if (file_exists($dbFile)) {
    try {
        $db = new PDO("sqlite:$dbFile");
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // 检查数据库结构
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

// 会话验证 - 检查当前会话是否有效
try {
    $db = new PDO("sqlite:$dbFile");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $stmt = $db->prepare("SELECT session_id FROM users WHERE username = :username");
    $stmt->execute([':username' => $_SESSION['username']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($user && $user['session_id'] !== session_id()) {
        // 会话无效，说明在别处登录了
        session_destroy();
        header("Location: login.php?error=账号已在其他地方登录");
        exit;
    }
} catch (Exception $e) {
    // 处理数据库错误，继续执行
    error_log("会话验证错误: " . $e->getMessage());
}

// 设置用户信息
$username = $_SESSION['username'];
$role = $_SESSION['role'] ?? 'user';

// 处理公告发布
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['announcement']) && $role === 'admin') {
    $announcement = trim($_POST['announcement']);
    if (!empty($announcement)) {
        try {
            $stmt = $db->prepare("INSERT OR REPLACE INTO announcements (id, content, created_by, created_at) VALUES (1, :content, :user, datetime('now'))");
            $stmt->execute([
                ':content' => $announcement,
                ':user' => $username
            ]);
        } catch (Exception $e) {
            // 如果announcements表不存在，创建它
            if (strpos($e->getMessage(), 'no such table') !== false) {
                $db->exec("CREATE TABLE announcements (id INTEGER PRIMARY KEY, content TEXT, created_by TEXT, created_at DATETIME)");
                $stmt = $db->prepare("INSERT INTO announcements (id, content, created_by, created_at) VALUES (1, :content, :user, datetime('now'))");
                $stmt->execute([
                    ':content' => $announcement,
                    ':user' => $username
                ]);
            }
        }
    }
    header("Location: chat.php");
    exit;
}

// 处理公告删除
if (isset($_GET['delete_announcement']) && $role === 'admin') {
    try {
        $stmt = $db->prepare("DELETE FROM announcements WHERE id = 1");
        $stmt->execute();
    } catch (Exception $e) {
        // 表不存在时忽略错误
    }
    header("Location: chat.php");
    exit;
}

// 获取当前公告
$currentAnnouncement = '';
try {
    $stmt = $db->prepare("SELECT content FROM announcements WHERE id = 1");
    $stmt->execute();
    $announcement = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($announcement) {
        $currentAnnouncement = htmlspecialchars($announcement['content']);
    }
} catch (Exception $e) {
    // 表不存在时忽略
}

// 获取服务器本地uploads目录的文件列表
$localFiles = [];
$uploadDir = __DIR__ . '/uploads/';

// 确保上传目录存在
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

// 读取uploads目录中的所有文件
if (file_exists($uploadDir)) {
    $files = scandir($uploadDir);
    foreach ($files as $file) {
        if ($file !== '.' && $file !== '..' && !is_dir($uploadDir . $file)) {
            // 从文件名中提取原始文件名（移除时间戳前缀）
            $originalName = preg_replace('/^\d+_/', '', $file);
            
            $localFiles[] = [
                'filename' => $originalName,
                'saved_name' => $file,
                'filepath' => $uploadDir . $file,
                'filesize' => filesize($uploadDir . $file),
                'filetime' => filemtime($uploadDir . $file)
            ];
        }
    }
    
    // 按修改时间倒序排列
    usort($localFiles, function($a, $b) {
        return $b['filetime'] - $a['filetime'];
    });
}

// 更新最后活动时间
$db = new PDO("sqlite:$dbFile");
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$stmt = $db->prepare("UPDATE users SET last_active=CURRENT_TIMESTAMP WHERE username=:u");
$stmt->execute([':u' => $username]);

// 使用DiceBear API生成头像
$avatar = "https://api.dicebear.com/6.x/pixel-art/svg?seed=" . urlencode($username);

// 文件上传处理
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file-input'])) {
    $uploadDir = __DIR__ . '/uploads/';
    
    // 确保上传目录存在
    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }
    
    $file = $_FILES['file-input'];
    $fileName = time() . '_' . basename($file['name']);
    $filePath = $uploadDir . $fileName;
    
    // 检查文件类型和大小
    $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'text/plain'];
    $maxFileSize = 5 * 1024 * 1024; // 5MB
    
    if (in_array($file['type'], $allowedTypes) && $file['size'] <= $maxFileSize) {
        if (move_uploaded_file($file['tmp_name'], $filePath)) {
            // 使用上海时间
            date_default_timezone_set('Asia/Shanghai');
            $currentTime = date('Y-m-d H:i:s');
            
            // 保存文件信息到数据库
            $fileExt = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            $fileType = in_array($fileExt, ['jpg', 'jpeg', 'png', 'gif']) ? 'image' : 'file';
            
            $stmt = $db->prepare("INSERT INTO messages (username, message, type, created_at) VALUES (:u, :m, :t, :time)");
            $stmt->execute([
                ':u' => $username,
                ':m' => json_encode([
                    'filename' => $file['name'],
                    'saved_name' => $fileName,
                    'type' => $fileType
                ]),
                ':t' => 'file',
                ':time' => $currentTime  // 使用上海时间
            ]);
            
            // 重定向以避免重复提交
            header("Location: chat.php");
            exit;
        }
    }
}
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
                    
                    <button class="profile-btn" onclick="openSharedFiles()">
                            <i>📂</i> 共享文件
                    </button>
                    
                    <button class="profile-btn" onclick="toggleChangePasswordMenu()">
                            <i>🔑</i> 修改密码
                    </button>

                    <button class="profile-btn logout" onclick="logout()">
                            <i>🔓</i> 退出登录
                    </button>
                </div>
                
                <!-- 管理员面板 -->
                <?php if ($role === 'admin'): ?>
                <div id="admin-panel" class="admin-panel">
                    <button id="clear-chat" class="admin-btn">清理内容</button>
                    <button id="manage-users" class="admin-btn">管理用户</button>
                    <button id="manage-announcement" class="admin-btn" onclick="toggleAnnouncementForm()">发布公告</button>
                    
                    <!-- 公告表单 -->
                    <div id="announcement-form" class="announcement-form">
                        <form method="post">
                            <textarea name="announcement" class="announcement-input" placeholder="请输入公告内容（支持表情）..." rows="3"><?php echo $currentAnnouncement; ?></textarea>
                            <button type="submit" class="announcement-submit">发布公告</button>
                            <?php if (!empty($currentAnnouncement)): ?>
                            <button type="button" class="announcement-btn" onclick="if(confirm('确定要删除公告吗？')) window.location.href='?delete_announcement=1'">删除公告</button>
                            <?php endif; ?>
                        </form>
                    </div>
                    
                    <div id="user-management" class="user-management">
                        <select id="user-select" class="user-select"></select>
                        <button id="delete-user" class="admin-btn delete-btn">删除用户</button>
                    </div>
					
					    <!-- 额外的跳转菜单 -->
					<div class="admin-menu">
						<a href="debug.php" class="admin-btn">调试</a>
						<a href="index.php" class="admin-btn" onclick="return confirm('⚠️ 确定要重置吗？此操作不可撤销！')">重置</a>
					</div>
                </div>
                <?php endif; ?>
            </div>
            
			<!-- 共享文件对话框 -->
			<div class="dialog-overlay" id="shared-files-dialog">
				<div class="dialog-box">
					<div class="dialog-header">
						共享文件
						<button class="dialog-close" onclick="closeSharedFiles()">×</button>
					</div>
					<div class="dialog-content">
						<ul id="shared-files-list">
							<?php if (empty($localFiles)): ?>
								<li>暂无共享文件</li>
							<?php else: ?>
								<?php foreach ($localFiles as $file): ?>
								<li style="margin-bottom: 10px; padding: 5px; border-bottom: 1px solid #eee;">
									<a href="uploads/<?php echo urlencode($file['saved_name']); ?>" 
									   download="<?php echo htmlspecialchars($file['filename']); ?>">
										<?php echo htmlspecialchars($file['filename']); ?>
									</a>
								</li>
								<?php endforeach; ?>
							<?php endif; ?>
						</ul>
					</div>
				</div>
			</div>

            <!-- 修改密码弹窗 -->
			<div id="change-password-menu" class="dropdown-menu" style="display: none;">
				<form id="change-password-form">
					<!-- 旧密码字段 -->
					<div class="password-input-container">
						<input type="password" id="old-password" name="old_password" placeholder="旧密码" required autocomplete="current-password">
						<button type="button" class="toggle-password" aria-label="显示密码">
							<svg viewBox="0 0 24 24" class="eye-icon">
								<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
							</svg>
						</button>
					</div>
					
					<!-- 新密码字段 -->
					<div class="password-input-container">
						<input type="password" id="new-password" name="new_password" placeholder="新密码" required autocomplete="new-password">
						<button type="button" class="toggle-password" aria-label="显示密码">
							<svg viewBox="0 0 24 24" class="eye-icon">
								<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
							</svg>
						</button>
					</div>
					
					<!-- 确认密码字段 -->
					<div class="password-input-container">
						<input type="password" id="confirm-password" name="confirm_password" placeholder="确认新密码" required autocomplete="new-password">
						<button type="button" class="toggle-password" aria-label="显示密码">
							<svg viewBox="0 0 24 24" class="eye-icon">
								<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
							</svg>
						</button>
					</div>
					
					<button type="submit">提交修改</button>
				</form>
			</div>

            <!-- 在线用户列表 -->
            <div class="online-users">
                <h4>在线用户</h4>
                <div id="users">
                    <!-- 用户列表将通过JavaScript动态加载 -->
                </div>
            </div>
        </div> <!-- 关闭user-list div -->

        <div class="chat-area">
            <!-- 公告区域 -->
            <?php if (!empty($currentAnnouncement)): ?>
            <div class="announcement-container">
                <div class="announcement-scroll">
                    <span class="announcement-icon">📢</span>
                    <span class="announcement-content"><?php echo $currentAnnouncement; ?></span>
                </div>
                <?php if ($role === 'admin'): ?>
                <div class="announcement-controls">
                    <!-- <button class="announcement-btn" onclick="toggleAnnouncementForm()">编辑</button> -->
                    <button class="announcement-btn" onclick="if(confirm('确定要删除公告吗？')) window.location.href='?delete_announcement=1'">删除</button>
                </div>
                <?php endif; ?>
            </div>
            <?php endif; ?>
            
            <!-- 聊天内容区域 -->
            <div id="chat-box" class="chat-box">
                <!-- 消息将通过JavaScript动态加载 -->
            </div>
           
            <!-- 输入面板 -->
            <div class="input-container">
                <div class="chat-input-panel">
                    <!-- 工具栏区域 -->
                    <div class="chat-input-actions">
                        <div class="chat-input-action clickable">
                            <div class="chat-icon">📎</div>
                            <div class="chat-text">上传</div>
                        </div>
                        <div class="chat-input-action clickable">
                            <div class="chat-icon">😊</div>
                            <div class="chat-text">表情</div>
                        </div>
                        <div class="chat-input-action clickable">
                            <div class="chat-icon">🖼️</div>
                            <div class="chat-text">贴纸</div>
                        </div>
                        <div class="chat-input-action clickable">
                            <div class="chat-icon">➕</div>
                            <div class="chat-text">更多</div>
                        </div>
						
						    <!-- 添加主题切换按钮 -->
						<div class="chat-input-action clickable" id="theme-toggle">
							<div class="chat-icon">🎨</div>
							<div class="chat-text">主题</div>
						</div>
						
						    <!-- 添加菜单按钮 -->
						<div class="chat-input-action clickable" id="menu-toggle">
							<div class="chat-icon">☰</div>
							<div class="chat-text">菜单</div>
						</div>
                    </div>
                    
                    <!-- 输入区域 -->
                    <div class="chat-input-panel-inner">
                        <form id="chat-form" class="chat-form">
                            <textarea id="message" name="message" class="chat-input" placeholder="输入消息... (Shift+Enter 换行)" rows="1" required></textarea>
                            <button type="submit" class="chat-input-send">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                                </svg>
                            </button>
                        </form>
                    </div>
                </div>               

				<!-- 侧滑菜单 -->
				<div class="user-list">
					<!-- 菜单内容 -->
				</div>
				
				<!-- 主题选择面板 -->
				<div id="theme-panel" class="theme-panel">
					<div class="theme-title">选择主题</div>
					<div class="theme-options">
						<div class="theme-option" data-theme="default" title="默认">
							<div class="theme-color" style="background: linear-gradient(135deg, #3a7bd5, #2c3e50);"></div>
							<div class="theme-name">默认</div>
						</div>
						<div class="theme-option" data-theme="colorful" title="多彩琉璃水晶">
							<div class="theme-color" style="background: linear-gradient(135deg, #3a7bd5, #9c27b0, #e91e63);"></div>
							<div class="theme-name">多彩</div>
						</div>
						<div class="theme-option" data-theme="crystal" title="琉璃水晶透明">
							<div class="theme-color" style="background: linear-gradient(135deg, #3a7bd5, #00d2ff, #2c3e50);"></div>
							<div class="theme-name">水晶</div>
						</div>
						<div class="theme-option" data-theme="dark" title="全暗">
							<div class="theme-color" style="background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);"></div>
							<div class="theme-name">全暗</div>
						</div>
					</div>
				</div>

				<!-- 遮罩层 -->
				<div class="side-menu-overlay" onclick="closeSideMenu()"></div>
			
                <!-- 表情和贴纸面板 -->
                <div id="emoji-panel" class="emoji-panel">
                    <!-- Emoji通过JavaScript动态加载 -->
                </div>
                
                <div id="sticker-panel" class="sticker-panel">
                    <!-- 贴纸图片通过JavaScript动态加载 -->
                </div>
             
                <!-- 隐藏的文件上传表单 -->
                <form id="upload-form" action="chat.php" method="post" enctype="multipart/form-data" style="display: none;">
                    <input type="file" name="file-input" id="file-input" required>
                </form>
            </div>
        </div>
    </div>
<script>
// 定义全局变量
const username = "<?php echo $username; ?>";
const role = "<?php echo $role; ?>";

// 点击遮罩层关闭菜单
document.querySelector('.side-menu-overlay').addEventListener('click', closeSideMenu);

// 绑定菜单按钮的点击事件
document.getElementById('menu-toggle').addEventListener('click', toggleSideMenu);

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

// 切换公告表单
function toggleAnnouncementForm() {
    const form = document.getElementById('announcement-form');
    form.style.display = form.style.display === 'block' ? 'none' : 'block';
}

// 显示更多工具
function showMoreTools() {
    alert('更多工具功能待开发');
}

// 文件上传自动提交
document.getElementById('file-input').addEventListener('change', function() {
    if (this.files.length > 0) {
        document.getElementById('upload-form').submit();
    }
});

</script>

<script src="assets/js/chat.js"></script>
</body>
</html>