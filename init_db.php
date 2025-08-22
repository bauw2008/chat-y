<?php
// init_db.php
header('Content-Type: application/json; charset=utf-8');
error_reporting(0);
ini_set('display_errors', 0);

// 创建数据目录
if (!is_dir('data')) {
    mkdir('data', 0755, true);
}

$dbFile = __DIR__ . '/data/chat.db';

try {
    $db = new PDO("sqlite:$dbFile");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 用户表（账号）+ last_active 字段
    $db->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            last_active DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 聊天消息表
    $db->exec("
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'text',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // 索引
    $db->exec("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);");

	// 私聊消息表
	$db->exec("
		CREATE TABLE IF NOT EXISTS private_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sender TEXT NOT NULL,
			receiver TEXT NOT NULL,
			message TEXT NOT NULL,
			type TEXT NOT NULL DEFAULT 'text',
			is_read INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (sender) REFERENCES users(username),
			FOREIGN KEY (receiver) REFERENCES users(username)
		);
	");

	// 私聊消息索引
	$db->exec("CREATE INDEX IF NOT EXISTS idx_private_sender_receiver ON private_messages(sender, receiver)");
	$db->exec("CREATE INDEX IF NOT EXISTS idx_private_receiver_sender ON private_messages(receiver, sender)");
	$db->exec("CREATE INDEX IF NOT EXISTS idx_private_created_at ON private_messages(created_at)");
	$db->exec("CREATE INDEX IF NOT EXISTS idx_private_is_read ON private_messages(is_read)");

    // 创建默认管理员
    $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username = :u");
    $stmt->execute([':u' => 'admin']);
    $exists = (int)$stmt->fetchColumn();
    if (!$exists) {
        $passwordHash = password_hash("123456", PASSWORD_DEFAULT);
        $stmt = $db->prepare("INSERT INTO users (username, password, role, last_active) VALUES (:u, :p, 'admin', CURRENT_TIMESTAMP)");
        $stmt->execute([':u' => 'admin', ':p' => $passwordHash]);
    }

    echo json_encode(['status' => 'success', 'message' => '数据库初始化成功！']);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}