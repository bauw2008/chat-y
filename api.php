<?php
// api.php - 统一API接口
header('Content-Type: application/json; charset=utf-8');
error_reporting(0);
ini_set('display_errors', 0);
session_start();

$dbFile = __DIR__ . '/data/chat.db';

function json_response($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// 数据库连接
try {
    $db = new PDO("sqlite:$dbFile");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $action = $_POST['action'] ?? $_GET['action'] ?? '';
    
    // 登录处理
    if ($action === 'login') {
        $username = trim($_POST['username'] ?? '');
        $password = trim($_POST['password'] ?? '');

        if ($username === '' || $password === '') {
            json_response(['status'=>'error','message'=>'用户名或密码不能为空'],400);
        }

        $stmt = $db->prepare("SELECT * FROM users WHERE username=:u LIMIT 1");
        $stmt->execute([':u'=>$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && password_verify($password,$user['password'])) {
            $_SESSION['username'] = $user['username'];
            $_SESSION['role'] = $user['role'] ?? 'user';

            // 更新 last_active
            $stmt = $db->prepare("UPDATE users SET last_active=CURRENT_TIMESTAMP WHERE username=:u");
            $stmt->execute([':u'=>$user['username']]);

            json_response(['status'=>'ok','message'=>'登录成功','redirect'=>'chat.php']);
        } else {
            json_response(['status'=>'error','message'=>'用户名或密码错误'],401);
        }
    }

    // 注册处理
    elseif ($action === 'register') {
        $username = trim($_POST['username'] ?? '');
        $password = trim($_POST['password'] ?? '');

        if (mb_strlen($username)<3 || mb_strlen($password)<3) {
            json_response(['status'=>'error','message'=>'用户名和密码至少 3 个字符'],400);
        }

        $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username=:u");
        $stmt->execute([':u'=>$username]);
        if ((int)$stmt->fetchColumn()>0) {
            json_response(['status'=>'exists','message'=>'用户名已存在'],409);
        }

        $hash = password_hash($password,PASSWORD_DEFAULT);
        $stmt = $db->prepare("INSERT INTO users (username,password,role) VALUES (:u,:p,'user')");
        $stmt->execute([':u'=>$username,':p'=>$hash]);

        json_response(['status'=>'ok','message'=>'注册成功，请登录']);
    }

    // 发送消息
    elseif ($action==='send_message') {
        if (!isset($_SESSION['username'])) {
            json_response(['status'=>'error','message'=>'未登录'],401);
        }
        $message = trim($_POST['message'] ?? '');
        if ($message==='') {
            json_response(['status'=>'error','message'=>'消息不能为空'],400);
        }

        $stmt = $db->prepare("INSERT INTO messages (username,message,type) VALUES (:u,:m,'text')");
        $stmt->execute([':u'=>$_SESSION['username'],':m'=>$message]);

        // 更新 last_active - 修复语法错误
        $updateStmt = $db->prepare("UPDATE users SET last_active = datetime('now') WHERE username = :u");
        $updateStmt->execute([':u' => $_SESSION['username']]);

        json_response(['status'=>'ok','message'=>'发送成功']);
    }

    // 获取消息
    elseif ($action==='get_messages') {
        $stmt = $db->prepare("SELECT * FROM messages ORDER BY created_at DESC LIMIT 100");
        $stmt->execute();
        $msgs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 按时间正序返回
        $msgs = array_reverse($msgs);

        json_response(['status'=>'ok','messages'=>$msgs]);
    }

    // 获取在线用户
    elseif ($action==='get_users') {
        $stmt = $db->prepare("SELECT username, role, last_active FROM users ORDER BY username ASC");
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // 使用数据库的当前时间而不是PHP的时间
        $timeStmt = $db->prepare("SELECT datetime('now') as current_db_time");
        $timeStmt->execute();
        $dbTime = $timeStmt->fetch(PDO::FETCH_ASSOC)['current_db_time'];
        $now = strtotime($dbTime);

        foreach ($users as &$u) {
            if ($u['last_active']) {
                $lastActive = strtotime($u['last_active']);
                // 调试输出
                error_log("用户: {$u['username']}, 最后活动: {$u['last_active']}, 当前时间: {$dbTime}, 时间差: " . ($now - $lastActive) . "秒");
                
                $u['online'] = ($now - $lastActive) < 300; // 5分钟内活跃算在线
            } else {
                $u['online'] = false;
            }
        }

        json_response(['status'=>'ok','users'=>$users]);
    }

    // 获取当前用户信息
    elseif ($action === 'get_user_info') {
        if (isset($_SESSION['username'])) {
            json_response([
                'status' => 'ok',
                'user' => [
                    'username' => $_SESSION['username'],
                    'role' => $_SESSION['role'] ?? 'user'
                ]
            ]);
        } else {
            json_response(['status'=>'error','message'=>'未登录'],401);
        }
    }

    // 清理聊天记录
    elseif ($action === 'clear_messages') {
        if (!isset($_SESSION['username']) || ($_SESSION['role'] ?? '') !== 'admin') {
            json_response(['status'=>'error','message'=>'无权限'],403);
        }

        $db->exec("DELETE FROM messages");
        json_response(['status'=>'ok','message'=>'聊天记录已清理']);
    }

    // 获取可删除用户列表
    elseif ($action === 'get_deletable_users') {
        if (!isset($_SESSION['username']) || ($_SESSION['role'] ?? '') !== 'admin') {
            json_response(['status'=>'error','message'=>'无权限'],403);
        }

        $stmt = $db->prepare("SELECT username FROM users WHERE role != 'admin' ORDER BY username ASC");
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_COLUMN);

        json_response(['status'=>'ok','users'=>$users]);
    }

    // 删除指定用户
    elseif ($action === 'delete_user') {
        if (!isset($_SESSION['username']) || ($_SESSION['role'] ?? '') !== 'admin') {
            json_response(['status'=>'error','message'=>'无权限'],403);
        }

        $usernameToDelete = trim($_POST['username'] ?? '');
        if ($usernameToDelete === '' || $usernameToDelete === $_SESSION['username']) {
            json_response(['status'=>'error','message'=>'无法删除该用户'],400);
        }

        $stmt = $db->prepare("DELETE FROM users WHERE username=:u AND role!='admin'");
        $stmt->execute([':u'=>$usernameToDelete]);

        json_response(['status'=>'ok','message'=>"用户 $usernameToDelete 已删除"]);
    }

    // ---------------------- 私聊消息 ----------------------
    elseif ($action === 'send_private_message') {
        if (!isset($_SESSION['username'])) {
            json_response(['status'=>'error','message'=>'未登录'],401);
        }
        
        $receiver = trim($_POST['receiver'] ?? '');
        $message = trim($_POST['message'] ?? '');
        $type = trim($_POST['type'] ?? 'text');
        
        if ($receiver === '' || $message === '') {
            json_response(['status'=>'error','message'=>'接收者和消息不能为空'],400);
        }
        
        if ($receiver === $_SESSION['username']) {
            json_response(['status'=>'error','message'=>'不能给自己发送私聊消息'],400);
        }
        
        // 检查接收者是否存在
        $stmt = $db->prepare("SELECT COUNT(*) FROM users WHERE username = :r");
        $stmt->execute([':r' => $receiver]);
        if ((int)$stmt->fetchColumn() === 0) {
            json_response(['status'=>'error','message'=>'用户不存在'],404);
        }
        
        $stmt = $db->prepare("INSERT INTO private_messages (sender, receiver, message, type) VALUES (:s, :r, :m, :t)");
        $stmt->execute([
            ':s' => $_SESSION['username'],
            ':r' => $receiver,
            ':m' => $message,
            ':t' => $type
        ]);
        
        json_response(['status'=>'ok','message'=>'私聊消息发送成功']);
    }

    elseif ($action === 'get_private_messages') {
        if (!isset($_SESSION['username'])) {
            json_response(['status'=>'error','message'=>'未登录'],401);
        }
        
        $targetUser = trim($_GET['target_user'] ?? '');
        if ($targetUser === '') {
            json_response(['status'=>'error','message'=>'需要指定聊天对象'],400);
        }
        
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = 50;
        $offset = ($page - 1) * $limit;
        
        $stmt = $db->prepare("
            SELECT * FROM private_messages
            WHERE (sender = :me AND receiver = :target)
               OR (sender = :target AND receiver = :me)
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        ");
        $stmt->bindValue(':me', $_SESSION['username'], PDO::PARAM_STR);
        $stmt->bindValue(':target', $targetUser, PDO::PARAM_STR);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $messages = array_reverse($messages); // 按时间正序
        
        json_response(['status'=>'ok','messages'=>$messages]);
    }

    elseif ($action === 'get_private_chat_users') {
        if (!isset($_SESSION['username'])) {
            json_response(['status'=>'error','message'=>'未登录'],401);
        }
        
        $stmt = $db->prepare("
            SELECT DISTINCT
                CASE
                    WHEN sender = :me THEN receiver
                    ELSE sender
                END as chat_user,
                MAX(created_at) as last_message_time
            FROM private_messages
            WHERE sender = :me OR receiver = :me
            GROUP BY chat_user
            ORDER BY last_message_time DESC
        ");
        $stmt->execute([':me' => $_SESSION['username']]);
        $chatUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        json_response(['status'=>'ok','chat_users'=>$chatUsers]);
    }

    elseif ($action === 'get_unread_private_count') {
        if (!isset($_SESSION['username'])) {
            json_response(['status'=>'error','message'=>'未登录'],401);
        }
        
        $stmt = $db->prepare("
            SELECT COUNT(*) as unread_count
            FROM private_messages
            WHERE receiver = :me AND is_read = 0
        ");
        $stmt->execute([':me' => $_SESSION['username']]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        json_response(['status'=>'ok','unread_count'=>intval($result['unread_count'])]);
    }

    // 在私聊消息部分添加删除功能
    elseif ($action === 'delete_private_message') {
    if (!isset($_SESSION['username'])) {
      json_response(['status'=>'error','message'=>'未登录'],401);
    }
    
    $messageId = intval($_POST['message_id'] ?? 0);
    if ($messageId <= 0) {
      json_response(['status'=>'error','message'=>'无效的消息ID'],400);
    }
    
    // 检查消息是否存在且属于当前用户
    $stmt = $db->prepare("SELECT * FROM private_messages WHERE id = :id AND sender = :sender");
    $stmt->execute([':id' => $messageId, ':sender' => $_SESSION['username']]);
    $message = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$message) {
      json_response(['status'=>'error','message'=>'消息不存在或无权删除'],403);
    }
    
    // 删除消息
    $stmt = $db->prepare("DELETE FROM private_messages WHERE id = :id");
    $stmt->execute([':id' => $messageId]);
    
    json_response(['status'=>'ok','message'=>'消息已删除']);
    }

  // 删除整个私聊历史
  elseif ($action === 'delete_private_chat_history') {
    if (!isset($_SESSION['username'])) {
      json_response(['status'=>'error','message'=>'未登录'],401);
    }

    $me = $_SESSION['username'];
    $targetUser = $_POST['target_user'] ?? '';
    if (!$targetUser) {
      json_response(['status'=>'error','message'=>'未指定聊天对象'],400);
    }

    // 删除两人之间所有私聊消息
    $stmt = $db->prepare("
      DELETE FROM private_messages 
      WHERE (sender = :me AND receiver = :target)
         OR (sender = :target AND receiver = :me)
    ");
    $stmt->execute([':me' => $me, ':target' => $targetUser]);

    json_response(['status'=>'ok','message'=>'聊天记录已删除']);
  }
  
  // 删除主窗口聊天个人信息
  elseif ($action === 'delete_message') {
    if (!isset($_SESSION['username'])) {
      json_response(['status'=>'error','message'=>'未登录'],401);
    }

    $messageId = intval($_POST['message_id'] ?? 0);
    if ($messageId <= 0) {
      json_response(['status'=>'error','message'=>'无效的消息ID'],400);
    }

    // 检查消息是否存在且属于当前用户
    $stmt = $db->prepare("SELECT * FROM messages WHERE id = :id AND username = :username");
    $stmt->execute([':id' => $messageId, ':username' => $_SESSION['username']]);
    $message = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$message) {
      json_response(['status'=>'error','message'=>'消息不存在或无权删除'],403);
    }

    // 删除消息
    $stmt = $db->prepare("DELETE FROM messages WHERE id = :id");
    $stmt->execute([':id' => $messageId]);

    json_response(['status'=>'ok','message'=>'消息已删除']);
  }



    // 心跳动作
    elseif ($action === 'heartbeat') {
        if (!isset($_SESSION['username'])) {
            json_response(['status'=>'error','message'=>'未登录'],401);
        }
        
        // 更新最后活动时间
        $stmt = $db->prepare("UPDATE users SET last_active = datetime('now') WHERE username = :u");
        $stmt->execute([':u' => $_SESSION['username']]);
        
        json_response(['status'=>'ok','message'=>'心跳更新成功']);
    }

    // 时间检查动作
    elseif ($action === 'check_time') {
        $stmt = $db->prepare("SELECT datetime('now') as server_time");
        $stmt->execute();
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        json_response(['status'=>'ok','server_time'=>$result['server_time']]);
    }

    // 退出登录
    elseif ($action==='logout') {
        session_destroy();
        json_response(['status'=>'ok','message'=>'已登出']);
    }

    else {
        json_response(['status'=>'error','message'=>'未知操作'],400);
    }

} catch (PDOException $e) {
    json_response(['status'=>'error','message'=>'数据库错误: '.$e->getMessage()],500);
}