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

// 处理登录请求
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['username']) && isset($_POST['password'])) {
    $username = trim($_POST['username']);
    $password = trim($_POST['password']);
    
    try {
        $db = new PDO("sqlite:$dbFile");
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // 验证用户 credentials
        $stmt = $db->prepare("SELECT * FROM users WHERE username = :username");
        $stmt->execute([':username' => $username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($user && password_verify($password, $user['password'])) {
            // 生成新的会话ID
            $newSessionId = session_id();
            
            // 检查该用户是否已经在其他地方登录
            if (!empty($user['session_id'])) {
                // 如果已有会话，记录日志（踢掉前一个登录）
                error_log("用户 {$username} 被新登录踢出，旧会话: {$user['session_id']}");
            }
            
            // 更新用户的当前会话ID和最后活动时间
            $stmt = $db->prepare("UPDATE users SET session_id = :session_id, last_active = datetime('now'), is_online = 1 WHERE username = :username");
            $stmt->execute([
                ':session_id' => $newSessionId,
                ':username' => $username
            ]);
            
            // 设置用户会话信息
            $_SESSION['username'] = $username;
            $_SESSION['role'] = $user['role'];
            
            echo json_encode(['status' => 'success', 'message' => '登录成功']);
            exit;
        } else {
            echo json_encode(['status' => 'error', 'message' => '用户名或密码错误']);
            exit;
        }
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => '登录失败，请稍后重试']);
        exit;
    }
}

// 处理注册请求
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['reg_username']) && isset($_POST['reg_password'])) {
    $username = trim($_POST['reg_username']);
    $password = trim($_POST['reg_password']);
    
    if (strlen($username) < 3) {
        echo json_encode(['status' => 'error', 'message' => '用户名至少3个字符']);
        exit;
    }
    
    if (strlen($password) < 6) {
        echo json_encode(['status' => 'error', 'message' => '密码至少6个字符']);
        exit;
    }
    
    try {
        $db = new PDO("sqlite:$dbFile");
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        // 检查用户名是否已存在
        $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username = :username");
        $stmt->execute([':username' => $username]);
        if ($stmt->fetchColumn() > 0) {
            echo json_encode(['status' => 'error', 'message' => '用户名已存在']);
            exit;
        }
        
        // 创建新用户
        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $db->prepare("INSERT INTO users (username, password, role, created_at) VALUES (:username, :password, 'user', datetime('now'))");
        $stmt->execute([
            ':username' => $username,
            ':password' => $hashedPassword
        ]);
        
        echo json_encode(['status' => 'success', 'message' => '注册成功，请登录']);
        exit;
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => '注册失败，请稍后重试']);
        exit;
    }
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