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
$targetUser = $_GET['user'] ?? '';
if (!$targetUser) die("请选择聊天对象");
if ($targetUser === $me) die("不能与自己私聊");

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

$emojis = ["😀","😂","😎","😍","😭","😡","😱","🤔","👍","🎉","💖","😴","😜","🤯","🥳","🙈","🐱","🐶","🌹","🔥"];

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
                ':msg'=>$fileInfo, // 使用JSON格式
                ':type'=>$type
            ]);
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
    <div id="chat-box" class="chat-box"></div>

    <div class="toolbar-container">
      <div class="toolbar">
        <form id="upload-form" method="post" enctype="multipart/form-data" style="display:none;">
          <input type="file" name="file-input" id="file-input">
        </form>
        <button type="button" class="toolbar-btn" onclick="document.getElementById('file-input').click();" title="上传文件">
          <span class="toolbar-icon">📎</span><span class="toolbar-label">上传</span>
        </button>
        <button type="button" class="toolbar-btn" onclick="toggleEmojiPanel()" title="表情">
          <span class="toolbar-icon">😊</span><span class="toolbar-label">表情</span>
        </button>
        <button type="button" class="toolbar-btn" onclick="deletePrivateChatHistory()" title="清空历史">
          <span class="toolbar-icon">🧹</span><span class="toolbar-label">清空历史</span>
        </button>
        <button type="button" class="toolbar-btn" onclick="showMoreTools()" title="更多工具">
          <span class="toolbar-icon">➕</span><span class="toolbar-label">更多</span>
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
// 定义全局变量（在chat.js中使用）
const username = "<?= htmlspecialchars($me) ?>";
const role = "<?= $_SESSION['role'] ?? 'user' ?>";

// 私聊页面特定的初始化代码
document.addEventListener('DOMContentLoaded', function() {
    // 设置私聊特定的配置
    window.chatConfig = {
        isPrivateChat: true,
        currentUser: "<?= htmlspecialchars($me) ?>",
        targetUser: "<?= htmlspecialchars($targetUser) ?>",
        emojis: <?= json_encode($emojis) ?>
    };
    
    // 初始化私聊功能
    if (typeof initPrivateChat === 'function') {
        initPrivateChat();
    }
    
    // 文件上传处理
    document.getElementById('file-input').addEventListener('change', function() {
        if (this.files.length > 0) {
            document.getElementById('upload-form').submit();
        }
    });
});

// 私聊页面特有的函数
function toggleEmojiPanel() {
    const panel = document.getElementById('emoji-panel');
    panel.style.display = panel.style.display === 'grid' ? 'none' : 'grid';
}

function showMoreTools() {
    alert('功能待开发');
}

function deletePrivateChatHistory() {
    if (!window.chatConfig || !window.chatConfig.isPrivateChat) return;
    
    if (!confirm(`确定删除与 ${window.chatConfig.targetUser} 的所有聊天记录吗？`)) return;
    
    // 调用chat.js中的函数
    if (typeof deletePrivateChatHistory === 'function') {
        deletePrivateChatHistory();
    }
}
</script>
<script src="assets/js/chat.js"></script>
</body>
</html>
