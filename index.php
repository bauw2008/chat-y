<?php
// index.php - 系统初始化页面
session_start();

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

// 如果已初始化，直接跳转到登录页面
if ($initialized) {
    header("Location: login.php");
    exit;
}
?>



<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>聊天系统初始化</title>
    <link rel="stylesheet" href="assets/css/init.css">
</head>
<body>
    <div class="init-container">
        <div class="init-box">
            <div class="init-header">
                <h1 class="init-title">聊天系统初始化</h1>
                <p class="init-subtitle">自动检测和配置您的聊天应用程序</p>
            </div>

            <div class="init-content">
                <div class="status-box">
                    <div class="status-icon info">⏳</div>
                    <div class="status-message">正在检查系统状态...</div>
                    <div class="status-details">检测数据库和必要配置</div>

                    <div class="progress-container">
                        <div class="progress-bar" id="progressBar"></div>
                    </div>
                </div>

                <div class="action-buttons">
                    <button class="action-btn btn-primary" id="initBtn">初始化系统</button>
                    <a href="login.php" class="action-btn btn-secondary" id="loginBtn" style="display: none;">前往登录页面</a>
                </div>

                <div class="admin-info">
                    <h3 class="admin-title">管理员账户信息</h3>
                    <p>用户名: <span class="code">admin</span></p>
                    <p>密码: <span class="code">123456</span></p>
                    <p>请务必在首次登录后更改密码！</p>
                </div>
            </div>

            <div class="init-footer">
                <p>© 聊天系统 | 自动初始化程序</p>
            </div>
        </div>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
        const initBtn = document.getElementById('initBtn');
        const loginBtn = document.getElementById('loginBtn');
        const progressBar = document.getElementById('progressBar');
        const statusIcon = document.querySelector('.status-icon');
        const statusMessage = document.querySelector('.status-message');
        const statusDetails = document.querySelector('.status-details');

        // 检查数据库状态
        checkDatabaseStatus();

        initBtn.addEventListener('click', initializeSystem);

        function checkDatabaseStatus() {
            fetch('check_db.php')
                .then(response => response.json())
                .then(data => {
                    if (data.initialized) {
                        window.location.href = 'login.php';
                    } else {
                        statusIcon.textContent = "⚠️";
                        statusMessage.textContent = "需要系统初始化";
                        statusDetails.textContent = "检测到数据库尚未初始化";
                        initBtn.style.display = 'block';
                    }
                })
                .catch(error => {
                    statusIcon.textContent = "❌";
                    statusMessage.textContent = "检查失败";
                    statusDetails.textContent = "无法检查数据库状态";
                });
        }

        function initializeSystem() {
            initBtn.disabled = true;
            initBtn.style.opacity = '0.7';
            statusDetails.textContent = "初始化数据库中...";

            fetch('init_db.php')
                .then(response => response.json())
                .then(data => {
                    let progress = 0;
                    const interval = setInterval(() => {
                        progress += 10;
                        progressBar.style.width = progress + '%';
                        
                        if (progress >= 100) {
                            clearInterval(interval);
                            if (data.status === 'success') {
                                statusIcon.textContent = "✅";
                                statusIcon.classList.remove('info');
                                statusIcon.classList.add('success');
                                statusMessage.textContent = "系统初始化成功！";
                                statusDetails.textContent = data.message;
                                loginBtn.style.display = 'block';
                                initBtn.style.display = 'none';
                                
                                setTimeout(() => {
                                    window.location.href = 'login.php';
                                }, 3000);
                            } else {
                                statusIcon.textContent = "❌";
                                statusMessage.textContent = "初始化失败";
                                statusDetails.textContent = data.message;
                                initBtn.disabled = false;
                                initBtn.style.opacity = '1';
                            }
                        }
                    }, 150);
                })
                .catch(err => {
                    statusIcon.textContent = "❌";
                    statusMessage.textContent = "初始化失败";
                    statusDetails.textContent = "网络错误或服务器异常";
                    initBtn.disabled = false;
                    initBtn.style.opacity = '1';
                });
        }
    });
    </script>
</body>
</html>