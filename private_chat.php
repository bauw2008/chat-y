<?php
session_start();

// 检查数据库是否已初始化
$dbFile = __DIR__ . '/data/chat.db';
$initialized = false;

if (file_exists($dbFile)) {
    try {
        $db = new PDO("sqlite:$dbFile");
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
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

// 修复：优先从GET参数获取，如果没有则从SESSION中获取
$targetUser = $_GET['user'] ?? $_SESSION['private_chat_target'] ?? '';

if (!$targetUser) die("请选择聊天对象");
if ($targetUser === $me) die("不能与自己私聊");

// 修复：保存目标用户到SESSION，供后续使用
$_SESSION['private_chat_target'] = $targetUser;

// 检查目标用户是否存在
try {
    $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username=:user");
    $stmt->execute([':user'=>$targetUser]);
    if (!(bool)$stmt->fetchColumn()) die("用户不存在");
} catch (Exception $e) {
    die("数据库错误");
}

// 更新最后活动时间
$stmt = $db->prepare("UPDATE users SET last_active=CURRENT_TIMESTAMP WHERE username=:u");
$stmt->execute([':u'=>$me]);

// 标记消息已读
$stmt = $db->prepare("UPDATE private_messages SET is_read=1 WHERE receiver=:me AND sender=:sender AND is_read=0");
$stmt->execute([':me'=>$me,':sender'=>$targetUser]);

// 文件上传处理
$uploadError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file-input'])) {
    $uploadDir = __DIR__ . '/uploads/';
    if (!file_exists($uploadDir)) mkdir($uploadDir,0777,true);

    $file = $_FILES['file-input'];
    $fileName = time().'_'.basename($file['name']);
    $serverPath = $uploadDir . $fileName;
    $webPath = 'uploads/' . rawurlencode($fileName);
    $allowedTypes = ['image/jpeg','image/png','image/gif','text/plain'];
    $maxFileSize = 5*1024*1024;

    if (in_array($file['type'],$allowedTypes) && $file['size'] <= $maxFileSize) {
        if (move_uploaded_file($file['tmp_name'],$serverPath)) {
            $fileExt = strtolower(pathinfo($file['name'],PATHINFO_EXTENSION));
            
            // 使用与公共聊天相同的JSON格式
            $fileInfo = json_encode([
                'filename' => $file['name'],
                'saved_name' => $fileName,
                'type' => in_array($fileExt,['jpg','jpeg','png','gif']) ? 'image' : 'file',
                'size' => $file['size'],
                'upload_time' => time()
            ]);
            
            // 统一使用'file'类型，通过JSON中的type区分具体类型
            $type = 'file';
            
            $stmt = $db->prepare("INSERT INTO private_messages (sender,receiver,message,type,created_at,is_read) VALUES (:sender,:receiver,:msg,:type,CURRENT_TIMESTAMP,0)");
            $stmt->execute([
                ':sender'=>$me,
                ':receiver'=>$targetUser,
                ':msg'=>$fileInfo,
                ':type'=>$type
            ]);
            
            // 修复：重定向时使用SESSION中的目标用户
            header("Location: private_chat.php?user=".urlencode($targetUser));
            exit;
        } else {
            $uploadError = '上传失败';
        }
    } else {
        $uploadError = '文件类型或大小不允许';
    }
}
?>


<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>和 <?= htmlspecialchars($targetUser) ?> 的私聊</title>
<link rel="stylesheet" href="assets/css/chat.css">
</head>
<body>
<div class="chat-container private-chat-container">
  <div class="private-chat-header">
    <a href="chat.php" class="back-button">← 返回大厅</a>
    <div class="private-user-info">
      <div style="font-weight:500;">与 <?= htmlspecialchars($targetUser) ?> 聊天</div>
      <div style="font-size:12px; opacity:0.8;" id="user-status">状态检测中...</div>
    </div>
  </div>

  <div class="chat-area">
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
                            <div class="chat-icon">🧹</div>
                            <div class="chat-text">清空</div>
                        </div>						
                        <div class="chat-input-action clickable">
                            <div class="chat-icon">➕</div>
                            <div class="chat-text">更多</div>
                        </div>
                    </div>
            
            <!-- 输入区域 -->
            <div class="chat-input-panel-inner">
                <form id="chat-form" class="chat-form">
                    <input type="hidden" id="target-user" value="<?= htmlspecialchars($targetUser) ?>">
                    <textarea id="message" name="message" class="chat-input" placeholder="输入消息... (Shift+Enter 换行)" rows="1" required></textarea>
                    <button type="submit" class="chat-input-send">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                        </svg>
                    </button>
                </form>
            </div>
        </div>
        
        <!-- 表情和贴纸面板 -->
        <div id="emoji-panel" class="emoji-panel">
            <!-- Emoji通过JavaScript动态加载 -->
        </div>
        
        <div id="sticker-panel" class="sticker-panel">
            <!-- 贴纸图片通过JavaScript动态加载 -->
        </div>	
		
        <!-- 更多工具菜单 -->
        <div id="private-more-tools" class="dropdown-menu"">
            <!-- 贴纸图片通过JavaScript动态加载 -->
        </div>
        
		<!-- 隐藏的文件上传表单 -->
		<form id="upload-form" action="private_chat.php" method="post" enctype="multipart/form-data" style="display: none;">
			<input type="file" name="file-input" id="file-input" required>
		</form>
    </div>
  </div>
</div>

<script>
// 定义全局变量
const username = "<?= htmlspecialchars($me) ?>";
const role = "<?= $_SESSION['role'] ?? 'user' ?>";
const targetUser = "<?= htmlspecialchars($targetUser) ?>";

// 设置私聊配置
window.chatConfig = {
    isPrivateChat: true,
    currentUser: username,
    targetUser: targetUser,
};

// 文件上传自动提交
document.getElementById('file-input').addEventListener('change', function() {
    console.log('文件选择变化');
    if (this.files.length > 0) {
        console.log('提交上传表单');
        document.getElementById('upload-form').submit();
    }
});

</script>
<script src="assets/js/chat.js"></script>
</body>
</html>