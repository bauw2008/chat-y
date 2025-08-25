<?php
// init_db.php
header('Content-Type: application/json; charset=utf-8');

$dbFile = __DIR__ . '/data/chat.db';

// 删除现有数据库文件
if (file_exists($dbFile)) {
    if (!unlink($dbFile)) {
        echo json_encode(['status' => 'error', 'message' => '无法删除数据库文件']);
        exit;
    }
}

// 重新创建数据目录
if (!is_dir('data')) {
    if (!mkdir('data', 0755, true)) {
        echo json_encode(['status' => 'error', 'message' => '无法创建data目录']);
        exit;
    }
}

try {
    $db = new PDO("sqlite:$dbFile");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 用户表（包含 is_online 和 session_id 字段）
    $db->exec("
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            last_active DATETIME,
            is_online INTEGER DEFAULT 0,
            session_id VARCHAR(255) NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 聊天消息表
    $db->exec("
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'text',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 私聊消息表
    $db->exec("
        CREATE TABLE private_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'text',
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 创建索引
    $db->exec("CREATE INDEX idx_messages_created_at ON messages(created_at);");
    $db->exec("CREATE INDEX idx_users_last_active ON users(last_active);");
    $db->exec("CREATE INDEX idx_users_is_online ON users(is_online);");
    $db->exec("CREATE INDEX idx_private_sender_receiver ON private_messages(sender, receiver)");
    $db->exec("CREATE INDEX idx_private_receiver_sender ON private_messages(receiver, sender)");
    $db->exec("CREATE INDEX idx_private_created_at ON private_messages(created_at)");
    $db->exec("CREATE INDEX idx_private_is_read ON private_messages(is_read)");

    // 创建默认管理员
    $passwordHash = password_hash("123456", PASSWORD_DEFAULT);
    $currentTime = date('Y-m-d H:i:s');
    $stmt = $db->prepare("INSERT INTO users (username, password, role, last_active, is_online) VALUES (:u, :p, 'admin', :time, 1)");
    $stmt->execute([':u' => 'admin', ':p' => $passwordHash, ':time' => $currentTime]);

    echo json_encode(['status' => 'success', 'message' => '数据库重新初始化成功！']);

} catch (PDOException $e) {
    echo json_encode(['status' => 'error', 'message' => '数据库错误: ' . $e->getMessage()]);
}