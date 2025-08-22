<?php
// debug.php - 调试脚本
session_start();
$db_file = 'data/chat.db';

echo "<h2>系统调试信息</h2>";

// 检查数据库文件
if (!file_exists($db_file)) {
    echo "❌ 数据库文件不存在<br>";
    echo "<a href='index.php'>请先初始化数据库</a>";
    exit;
}

echo "✅ 数据库文件存在<br>";

// 连接数据库
try {
    $db = new SQLite3($db_file);
    echo "✅ 数据库连接成功<br>";
    
    // 检查用户表
    $tableExists = $db->querySingle("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    if (!$tableExists) {
        echo "❌ 用户表不存在<br>";
        echo "<a href='index.php'>请初始化数据库</a>";
        exit;
    }
    echo "✅ 用户表存在<br>";
    
    // 检查管理员账户
    $adminExists = $db->querySingle("SELECT COUNT(*) FROM users WHERE username='admin'");
    if (!$adminExists) {
        echo "❌ 管理员账户不存在<br>";
        echo "<a href='index.php'>请重新初始化数据库</a>";
        exit;
    }
    echo "✅ 管理员账户存在<br>";
    
    // 显示用户数据
    echo "<h3>用户数据:</h3>";
    $result = $db->query("SELECT * FROM users");
    if ($result) {
        echo "<table border='1'>";
        echo "<tr><th>ID</th><th>用户名</th><th>密码哈希</th><th>角色</th><th>密码测试</th></tr>";
        
        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            echo "<tr>";
            echo "<td>" . $row['id'] . "</td>";
            echo "<td>" . $row['username'] . "</td>";
            echo "<td style='max-width: 300px; word-break: break-all;'>" . $row['password'] . "</td>";
            echo "<td>" . $row['role'] . "</td>";
            
            // 测试密码验证
            $testPassword = '123456';
            $isValid = password_verify($testPassword, $row['password']);
            echo "<td>" . ($isValid ? "✅ 成功" : "❌ 失败") . "</td>";
            echo "</tr>";
        }
        echo "</table>";
    }
    
    // 测试密码哈希函数
    echo "<h3>密码哈希功能测试:</h3>";
    $testPass = '123456';
    $hashed = password_hash($testPass, PASSWORD_DEFAULT);
    $verifyResult = password_verify($testPass, $hashed);
    
    echo "原始密码: " . $testPass . "<br>";
    echo "新哈希值: " . $hashed . "<br>";
    echo "验证结果: " . ($verifyResult ? "✅ 成功" : "❌ 失败") . "<br>";
    
} catch (Exception $e) {
    echo "❌ 数据库错误: " . $e->getMessage() . "<br>";
}
?>

<br>
<a href="index.php">返回首页</a> | 
<a href="login.php">登录页面</a>