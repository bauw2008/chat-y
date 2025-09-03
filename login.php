<?php
// login.php
session_start();

// 检查数据库是否已初始化
$dbFile = __DIR__ . '/data/chat.db';
$initialized = file_exists($dbFile);

if ($initialized) {
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

// 检查是否有被踢出的错误消息
$loginError = '';
if (isset($_GET['reason']) && $_GET['reason'] === 'session_terminated') {
    $loginError = '账号已在其他地方登录，当前会话已终止';
} elseif (isset($_SESSION['login_error'])) {
    $loginError = $_SESSION['login_error'];
    unset($_SESSION['login_error']);
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>聊天室登录</title>
    <link rel="stylesheet" href="assets/css/login.css">
	<link rel="icon" href="images/favicon.svg" type="image/svg+xml">
</head>
<body>
    <div class="login-container">
        <div class="login-box">
            <form id="loginForm">
                <h3 class="login-title">WEB聊天室</h3>
                <?php if (!empty($loginError)): ?>
                <div class="error-message"><?php echo htmlspecialchars($loginError); ?></div>
                <?php endif; ?>				

                <input type="text" id="username" name="username" placeholder="用户名" required autocomplete="username">
                <input type="password" id="password" name="password" placeholder="密码" required autocomplete="current-password">
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
                    <input type="text" id="regUsername" name="reg_username" placeholder="用户名" required autocomplete="username">
                    <input type="password" id="regPassword" name="reg_password" placeholder="密码" required autocomplete="new-password">
                    <div id="regError" class="error-message"></div>
                    <button type="submit" class="login-btn">注册</button>
                </form>
            </div>
        </div>
    </div>

    <script src="assets/js/login.js"></script>
</body>
</html>