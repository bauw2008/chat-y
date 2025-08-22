<?php
// check_db.php
header('Content-Type: application/json');
$dbFile = __DIR__ . '/data/chat.db';

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