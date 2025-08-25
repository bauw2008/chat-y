<?php
// check_db.php
session_start();
header('Content-Type: application/json');
$dbFile = __DIR__ . '/data/chat.db';



// ==================== 权限验证代码 ====================
if (!isset($_SESSION['username'])) {
    // 未登录：先存储想访问的页面地址，再跳转到登录页
    $_SESSION['redirect_after_login'] = $_SERVER['REQUEST_URI'];
    header("Location: login.php");
    exit;
}

if ($_SESSION['role'] !== 'admin') {
    // 已登录，但不是管理员
    header('HTTP/1.1 403 Forbidden');
    echo '<!DOCTYPE html>
    <html>
    <head>
        <title>权限不足</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; margin-top: 100px; }
            .error { color: #d32f2f; font-size: 18px; }
        </style>
    </head>
    <body>
        <h2 class="error">⚠️ 权限不足</h2>
        <p>您需要管理员权限才能访问系统初始化页面</p>
        <a href="chat.php">返回聊天室</a> | 
        <a href="logout.php">退出登录</a>
    </body>
    </html>';
    exit;
}
// ==================== 验证结束 ====================


if (!file_exists($dbFile)) {
    echo json_encode(['initialized' => false]);
    exit;
}

try {
    $db = new PDO("sqlite:$dbFile");
    
    // 检查用户表是否存在
    $tableExists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")->fetch();
    if (!$tableExists) {
        echo json_encode(['initialized' => false]);
        exit;
    }
    
    // 检查管理员账户是否存在
    $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username = :username");
    $stmt->execute([':username' => 'admin']);
    $exists = $stmt->fetchColumn();

    echo json_encode(['initialized' => $exists > 0]);
} catch (PDOException $e) {
    echo json_encode(['initialized' => false]);
}