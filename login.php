<?php
// login.php - 登录页面
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

// 如果已登录，直接跳转到聊天室
if (isset($_SESSION['username'])) {
    header("Location: chat.php");
    exit;
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>聊天室登录</title>
    <link rel="stylesheet" href="assets/css/login.css">
</head>
<body>
    <div class="login-container">
        <div class="login-box">
            <form id="loginForm">
                <h3 class="login-title">登录聊天室</h3>
                <input type="text" id="username" placeholder="用户名" required autocomplete="username">
                <input type="password" id="password" placeholder="密码" required autocomplete="current-password">
                <div id="loginError" class="error-message"></div>
                <button type="submit" class="login-btn">登录</button>
                <button type="button" class="login-btn register-btn" id="showRegister">注册</button>
            </form>
        </div>

        <div id="registerModal" class="modal">
            <div class="modal-content">
                <span class="close-btn" id="closeRegister">&times;</span>
                <form id="regForm">
                    <h3>注册</h3>
                    <input type="text" id="regUsername" placeholder="用户名" required autocomplete="username">
                    <input type="password" id="regPassword" placeholder="密码" required autocomplete="new-password">
                    <div id="regError" class="error-message"></div>
                    <button type="submit" class="login-btn">注册</button>
                </form>
            </div>
        </div>
    </div>

    <script src="assets/js/login.js"></script>
</body>
</html>