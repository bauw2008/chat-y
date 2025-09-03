<?php
// api.php
header('Content-Type: application/json; charset=utf-8');
error_reporting(0);
ini_set('display_errors', 0);
date_default_timezone_set('Asia/Shanghai');
session_start();

$dbFile = __DIR__ . '/data/chat.db';

// ==================== 核心工具函数 ====================
function json_response($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function get_param($name, $default = '') {
    return trim($_POST[$name] ?? $_GET[$name] ?? $default);
}

function getShanghaiTime() {
    return date('Y-m-d H:i:s');
}

function formatRelativeTime($timestamp) {
    if (!$timestamp) return '从未活动';
    
    $diff = time() - strtotime($timestamp);
    if ($diff < 60) return '刚刚';
    if ($diff < 3600) return floor($diff/60) . '分钟前';
    if ($diff < 86400) return floor($diff/3600) . '小时前';
    if ($diff < 604800) return floor($diff/86400) . '天前';
    
    return date('Y-m-d H:i', strtotime($timestamp));
}

// ==================== 数据库操作函数 ====================
function db_query($db, $sql, $params = []) {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function db_query_one($db, $sql, $params = []) {
    return db_query($db, $sql, $params)->fetch(PDO::FETCH_ASSOC);
}

function db_query_all($db, $sql, $params = []) {
    return db_query($db, $sql, $params)->fetchAll(PDO::FETCH_ASSOC);
}

function db_query_column($db, $sql, $params = [], $column = 0) {
    return db_query($db, $sql, $params)->fetchAll(PDO::FETCH_COLUMN, $column);
}

function db_execute($db, $sql, $params = []) {
    return db_query($db, $sql, $params)->rowCount();
}

// ==================== 验证函数 ====================
function validate_required($fields, $error_message = '参数不能为空') {
    foreach ($fields as $field => $value) {
        if (empty($value)) {
            json_response(['status' => 'error', 'message' => $error_message], 400);
        }
    }
}

function validate_length($value, $min, $max, $field_name) {
    $length = mb_strlen($value);
    if ($length < $min || $length > $max) {
        json_response(['status' => 'error', 'message' => "{$field_name}长度必须在{$min}-{$max}字符之间"], 400);
    }
}

function require_auth($require_admin = false) {
    if (!isset($_SESSION['username'])) {
        json_response(['status' => 'error', 'message' => '未登录'], 401);
    }
    
    if ($require_admin && ($_SESSION['role'] ?? '') !== 'admin') {
        json_response(['status' => 'error', 'message' => '无权限'], 403);
    }
}

function validate_user_exists($db, $username, $error_message = '用户不存在') {
    $exists = db_query_one($db, "SELECT COUNT(*) as count FROM users WHERE username = :username", 
        [':username' => $username]);
    
    if (!$exists || $exists['count'] == 0) {
        json_response(['status' => 'error', 'message' => $error_message], 404);
    }
}

function validate_message_ownership($db, $message_id, $username, $table = 'messages') {
    $message = db_query_one($db, "SELECT * FROM {$table} WHERE id = :id", [':id' => $message_id]);
    
    if (!$message) {
        json_response(['status' => 'error', 'message' => '消息不存在'], 404);
    }
    
    if ($message['username'] !== $username && $message['sender'] !== $username) {
        json_response(['status' => 'error', 'message' => '无权操作此消息'], 403);
    }
    
    return $message;
}

// ==================== 业务函数 ====================
function update_user_activity($db, $username) {
    db_execute($db, 
        "UPDATE users SET last_active = :time, is_online = 1 WHERE username = :username",
        [':time' => getShanghaiTime(), ':username' => $username]
    );
}

function cleanup_inactive_users($db) {
    db_execute($db, "UPDATE users SET is_online = 0 WHERE datetime(last_active) < datetime('now', '-5 minutes')");
}

function get_db_time($db) {
    return db_query_one($db, "SELECT datetime('now') as current_time")['current_time'];
}

function process_user_online_status($db, &$users) {
    $db_time = get_db_time($db);
    $now = strtotime($db_time);
    
    foreach ($users as &$user) {
        $user['online'] = ($user['is_online'] == 1);
        
        // 容错机制
        if (!$user['online'] && $user['last_active']) {
            $last_active = strtotime($user['last_active']);
            $user['online'] = ($now - $last_active) < 300;
        }
        
        $user['last_active_friendly'] = formatRelativeTime($user['last_active']);
    }
}

function delete_file_if_exists($file_path) {
    if (file_exists($file_path)) {
        unlink($file_path);
    }
}

// ==================== 文件操作函数 ====================
function ensure_upload_directory() {
    $upload_dir = __DIR__ . '/uploads/';
    if (!file_exists($upload_dir)) {
        mkdir($upload_dir, 0777, true);
    }
    return $upload_dir;
}

function get_local_files() {
    $upload_dir = ensure_upload_directory();
    $files = [];
    
    if (file_exists($upload_dir)) {
        $file_list = scandir($upload_dir);
        foreach ($file_list as $file) {
            if ($file !== '.' && $file !== '..' && !is_dir($upload_dir . $file)) {
                $files[] = $file;
            }
        }
    }
    
    return $files;
}

// ==================== 备注签名函数 ====================
function ensureSignatureColumnExists($db) {
    // 检查signature字段是否已存在
    $stmt = $db->query("PRAGMA table_info(users)");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $signatureExists = false;
    foreach ($columns as $column) {
        if ($column['name'] === 'signature') {
            $signatureExists = true;
            break;
        }
    }
    
    if (!$signatureExists) {
        try {
            $db->exec("ALTER TABLE users ADD COLUMN signature TEXT DEFAULT ''");
            error_log("已添加signature字段到users表");
        } catch (PDOException $e) {
            error_log("添加signature字段失败: " . $e->getMessage());
            // 不抛出异常，让操作继续
        }
    }
}

// ==================== 主逻辑 ====================
try {
    $db = new PDO("sqlite:$dbFile");
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $action = get_param('action');
    
    switch ($action) {
        // ---------- 公开操作 ----------
        case 'login':
            $username = get_param('username');
            $password = get_param('password');
            
            validate_required(['用户名' => $username, '密码' => $password], '用户名或密码不能为空');
            
            $user = db_query_one($db, "SELECT * FROM users WHERE username = :username", [':username' => $username]);
            
            if ($user && password_verify($password, $user['password'])) {
                $_SESSION['username'] = $user['username'];
                $_SESSION['role'] = $user['role'] ?? 'user';
                
                db_execute($db, 
                    "UPDATE users SET last_active = :time, is_online = 1, session_id = :session_id WHERE username = :username",
                    [':time' => getShanghaiTime(), ':session_id' => session_id(), ':username' => $user['username']]
                );
                
                json_response(['status' => 'success', 'message' => '登录成功', 'redirect' => 'chat.php']);
            }
            
            json_response(['status' => 'error', 'message' => '用户名或密码错误'], 401);
            break;
            
        case 'register':
            $username = get_param('username');
            $password = get_param('password');
            
            validate_required(['用户名' => $username, '密码' => $password]);
            validate_length($username, 3, 50, '用户名');
            validate_length($password, 3, 100, '密码');
            
            $exists = db_query_one($db, "SELECT COUNT(*) as count FROM users WHERE username = :username", 
                [':username' => $username]);
            
            if ($exists['count'] > 0) {
                json_response(['status' => 'exists', 'message' => '用户名已存在'], 409);
            }
            
            db_execute($db, 
                "INSERT INTO users (username, password, role, last_active, is_online) VALUES (:username, :password, 'user', :time, 1)",
                [':username' => $username, ':password' => password_hash($password, PASSWORD_DEFAULT), ':time' => getShanghaiTime()]
            );
            
            json_response(['status' => 'ok', 'message' => '注册成功，请登录']);
            break;
            
        case 'get_messages':
            $messages = db_query_all($db, "SELECT * FROM messages ORDER BY created_at DESC LIMIT 100");
            json_response(['status' => 'ok', 'messages' => array_reverse($messages)]);
            break;
            
        // ---------- 需要登录的操作 ----------
        case 'send_message':
            require_auth();
            $message = get_param('message');
            
            validate_required(['消息' => $message]);
            
            db_execute($db, 
                "INSERT INTO messages (username, message, type, created_at) VALUES (:username, :message, 'text', :time)",
                [':username' => $_SESSION['username'], ':message' => $message, ':time' => getShanghaiTime()]
            );
            
            update_user_activity($db, $_SESSION['username']);
            json_response(['status' => 'ok', 'message' => '发送成功']);
            break;
            
        case 'get_users':
            require_auth();
            cleanup_inactive_users($db);
            
            $users = db_query_all($db, 
                "SELECT username, role, last_active, is_online FROM users ORDER BY is_online DESC, username ASC"
            );
            
            process_user_online_status($db, $users);
            json_response(['status' => 'ok', 'users' => $users, 'server_time' => get_db_time($db)]);
            break;
            
        case 'get_user_info':
            require_auth();
            
            $user = db_query_one($db, 
                "SELECT username, role, last_active, is_online FROM users WHERE username = :username",
                [':username' => $_SESSION['username']]
            );
            
            if ($user) {
                json_response(['status' => 'ok', 'user' => $user]);
            } else {
                json_response(['status' => 'error', 'message' => '用户不存在'], 404);
            }
            break;
            
        case 'heartbeat':
            require_auth();
            
            $user = db_query_one($db, 
                "SELECT session_id FROM users WHERE username = :username",
                [':username' => $_SESSION['username']]
            );
            
            if ($user && $user['session_id'] !== session_id()) {
                session_destroy();
                json_response(['status' => 'error', 'message' => '账号已在其他地方登录'], 401);
            }
            
            update_user_activity($db, $_SESSION['username']);
            cleanup_inactive_users($db);
            
            json_response(['status' => 'ok', 'message' => '心跳更新成功', 'users_updated' => true]);
            break;
            
        // ---------- 私聊操作 ----------
        case 'send_private_message':
            require_auth();
            
            $receiver = get_param('receiver');
            $message = get_param('message');
            $type = get_param('type', 'text');
            
            validate_required(['接收者' => $receiver, '消息' => $message]);
            
            if ($receiver === $_SESSION['username']) {
                json_response(['status' => 'error', 'message' => '不能给自己发送私聊消息'], 400);
            }
            
            validate_user_exists($db, $receiver);
            
            db_execute($db, 
                "INSERT INTO private_messages (sender, receiver, message, type, created_at) VALUES (:sender, :receiver, :message, :type, :time)",
                [':sender' => $_SESSION['username'], ':receiver' => $receiver, ':message' => $message, ':type' => $type, ':time' => getShanghaiTime()]
            );
            
            json_response(['status' => 'ok', 'message' => '私聊消息发送成功']);
            break;
            
        case 'get_private_messages':
            require_auth();
            
            $target_user = get_param('target_user');
            validate_required(['聊天对象' => $target_user]);
            
            $page = max(1, intval(get_param('page', 1)));
            $limit = 50;
            $offset = ($page - 1) * $limit;
            
            $messages = db_query_all($db, "
                SELECT pm.*, u.role as sender_role 
                FROM private_messages pm
                JOIN users u ON pm.sender = u.username
                WHERE (sender = :me AND receiver = :target) OR (sender = :target AND receiver = :me)
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            ", [
                ':me' => $_SESSION['username'],
                ':target' => $target_user,
                ':limit' => $limit,
                ':offset' => $offset
            ]);
            
            json_response(['status' => 'ok', 'messages' => array_reverse($messages)]);
            break;
            
        case 'get_private_chat_users':
            require_auth();
            
            $chat_users = db_query_all($db, "
                SELECT DISTINCT
                    CASE WHEN sender = :me THEN receiver ELSE sender END as chat_user,
                    MAX(created_at) as last_message_time
                FROM private_messages
                WHERE sender = :me OR receiver = :me
                GROUP BY chat_user
                ORDER BY last_message_time DESC
            ", [':me' => $_SESSION['username']]);
            
            json_response(['status' => 'ok', 'chat_users' => $chat_users]);
            break;
            
        case 'delete_private_message':
            require_auth();
            
            $message_id = intval(get_param('message_id'));
            if ($message_id <= 0) {
                json_response(['status' => 'error', 'message' => '无效的消息ID'], 400);
            }
            
            validate_message_ownership($db, $message_id, $_SESSION['username'], 'private_messages');
            db_execute($db, "DELETE FROM private_messages WHERE id = :id", [':id' => $message_id]);
            
            json_response(['status' => 'ok', 'message' => '消息已删除']);
            break;
		
        case 'get_unread_private_count':
            require_auth();
            
            $unread_count = db_query_one($db, 
                "SELECT COUNT(*) as unread_count FROM private_messages WHERE receiver = :me AND is_read = 0",
                [':me' => $_SESSION['username']]
            );
            
            json_response(['status' => 'ok', 'unread_count' => intval($unread_count['unread_count'])]);
            break;
            
        case 'delete_private_chat_history':
            require_auth();
            
            $target_user = get_param('target_user');
            validate_required(['聊天对象' => $target_user]);
            
            db_execute($db, "
                DELETE FROM private_messages 
                WHERE (sender = :me AND receiver = :target)
                   OR (sender = :target AND receiver = :me)
            ", [':me' => $_SESSION['username'], ':target' => $target_user]);
            
            json_response(['status' => 'ok', 'message' => '聊天记录已删除']);
            break;
            
        // ---------- 消息管理 ----------
        case 'delete_message':
            require_auth();
            
            $message_id = intval(get_param('message_id'));
            if ($message_id <= 0) {
                json_response(['status' => 'error', 'message' => '无效的消息ID'], 400);
            }
            
            validate_message_ownership($db, $message_id, $_SESSION['username']);
            db_execute($db, "DELETE FROM messages WHERE id = :id", [':id' => $message_id]);
            
            json_response(['status' => 'ok', 'message' => '消息已删除']);
            break;
            
        // ---------- 管理员操作 ----------
        case 'clear_messages':
            require_auth(true);
            db_execute($db, "DELETE FROM messages");
            json_response(['status' => 'ok', 'message' => '聊天记录已清理']);
            break;
            
        case 'get_deletable_users':
            require_auth(true);
            
            $users = db_query_column($db, 
                "SELECT username FROM users WHERE role != 'admin' ORDER BY username ASC"
            );
            
            json_response(['status' => 'ok', 'users' => $users]);
            break;
            
        case 'delete_user':
            require_auth(true);
            
            $username_to_delete = get_param('username');
            validate_required(['用户名' => $username_to_delete]);
            
            if ($username_to_delete === $_SESSION['username']) {
                json_response(['status' => 'error', 'message' => '不能删除当前登录用户'], 400);
            }
            
            $user = db_query_one($db, "SELECT role FROM users WHERE username = :username", 
                [':username' => $username_to_delete]);
            
            if (!$user) {
                json_response(['status' => 'error', 'message' => '用户不存在'], 400);
            }
            
            if ($user['role'] === 'admin') {
                json_response(['status' => 'error', 'message' => '不能删除管理员用户'], 400);
            }
            
            db_execute($db, "DELETE FROM users WHERE username = :username", [':username' => $username_to_delete]);
            json_response(['status' => 'ok', 'message' => "用户 {$username_to_delete} 已删除"]);
            break;
            
        case 'delete_message_admin':
            require_auth(true);
            
            $message_id = intval(get_param('message_id', get_param('id', 0)));
            if ($message_id <= 0) {
                json_response(['status' => 'error', 'message' => '无效的消息ID'], 400);
            }
            
            $message = db_query_one($db, "SELECT * FROM messages WHERE id = :id", [':id' => $message_id]);
            
            if (!$message) {
                json_response(['status' => 'error', 'message' => '消息不存在'], 404);
            }
            
            // 删除关联的文件
            if ($message['type'] === 'file') {
                $message_data = json_decode($message['message'], true);
                if (isset($message_data['saved_name'])) {
                    delete_file_if_exists(__DIR__ . '/uploads/' . $message_data['saved_name']);
                }
            }
            
            db_execute($db, "DELETE FROM messages WHERE id = :id", [':id' => $message_id]);
            json_response(['status' => 'ok', 'message' => '消息已删除']);
            break;
            
        // ---------- 文件管理 ----------
        case 'get_local_files':
            require_auth();
            json_response(['status' => 'ok', 'files' => get_local_files()]);
            break;
            
        case 'delete_local_file':
            require_auth(true);
            
            $filename = get_param('filename');
            validate_required(['文件名' => $filename]);
            
            $filename = basename($filename);
            $file_path = __DIR__ . '/uploads/' . $filename;
            
            if (!file_exists($file_path)) {
                json_response(['status' => 'error', 'message' => '文件不存在'], 404);
            }
            
            if (unlink($file_path)) {
                json_response(['status' => 'ok', 'message' => '文件删除成功']);
            } else {
                json_response(['status' => 'error', 'message' => '文件删除失败'], 500);
            }
            break;
            
        // ---------- 账户管理 ----------
        case 'change_password':
            require_auth();
            
            $old_password = get_param('old_password');
            $new_password = get_param('new_password');
            
            validate_required(['旧密码' => $old_password, '新密码' => $new_password]);
            
            $user = db_query_one($db, 
                "SELECT password FROM users WHERE username = :username",
                [':username' => $_SESSION['username']]
            );
            
            if (!$user) {
                json_response(['status' => 'error', 'message' => '用户不存在'], 404);
            }
            
            if (!password_verify($old_password, $user['password'])) {
                json_response(['status' => 'error', 'message' => '旧密码错误'], 403);
            }
            
            db_execute($db, 
                "UPDATE users SET password = :password WHERE username = :username",
                [':password' => password_hash($new_password, PASSWORD_DEFAULT), ':username' => $_SESSION['username']]
            );
            
            json_response(['status' => 'ok', 'message' => '密码修改成功']);
            break;

        // ---------- 签名备注 ----------			
		case 'save_signature':
			require_auth();
			
			$signature = get_param('signature');
			validate_length($signature, 0, 500, '签名');
			
			ensureSignatureColumnExists($db);
			
			// 保存签名到数据库
			db_execute($db, 
				"UPDATE users SET signature = :signature WHERE username = :username",
				[':signature' => $signature, ':username' => $_SESSION['username']]
			);
			
			json_response(['status' => 'ok', 'message' => '签名保存成功']);
			break;


        // ---------- 当前用户查看签名 ----------
		case 'get_signature':
			require_auth();
			
			ensureSignatureColumnExists($db);
			
			$user = db_query_one($db, 
				"SELECT signature FROM users WHERE username = :username",
				[':username' => $_SESSION['username']]
			);
			
			json_response([
				'status' => 'ok', 
				'signature' => $user['signature'] ?? ''
			]);
			break;

        // ---------- 所有用户查看签名 ----------
		case 'get_user_signature':
			require_auth();
			$username = get_param('username'); // 要查询的用户
			ensureSignatureColumnExists($db);

			$user = db_query_one($db,
				"SELECT signature FROM users WHERE username = :username",
				[':username' => $username]
			);

			$signature = $user['signature'] ?? '';
			// 普通用户不管一言签名，管理员可以看到标记即可
			json_response([
				'status' => 'ok',
				'signature' => $signature
			]);
			break;

		// ---------- 一言 ----------
		case 'get_hitokoto':
			require_auth();
			
			// 只有管理员可以使用一言功能
			if (($_SESSION['role'] ?? '') !== 'admin') {
				json_response(['status' => 'error', 'message' => '无权限'], 403);
			}
			
			// 检查上次调用时间，防止频繁调用
			$lastCall = $_SESSION['hitokoto_last_call'] ?? 0;
			$currentTime = time();
			
			// 限制每60秒只能调用一次
			if ($currentTime - $lastCall < 30) {
				json_response(['status' => 'error', 'message' => '调用过于频繁，请稍后再试'], 429);
			}
			
			$_SESSION['hitokoto_last_call'] = $currentTime;
			
			try {
				$context = stream_context_create([
					'http' => [
						'timeout' => 5,
						'header' => "User-Agent: ChatApp/1.0\r\n"
					]
				]);
				
				$response = file_get_contents('https://v1.hitokoto.cn/', false, $context);
				$data = json_decode($response, true);
				
				if ($data && isset($data['hitokoto'])) {
					$hitokoto = $data['hitokoto'] . (isset($data['from']) ? ' —— ' . $data['from'] : '');
					json_response(['status' => 'ok', 'hitokoto' => $hitokoto]);
				} else {
					json_response(['status' => 'error', 'message' => '获取一言失败'], 500);
				}
			} catch (Exception $e) {
				json_response(['status' => 'error', 'message' => 'API调用失败'], 500);
			}
			break;					
		  
        // ---------- 登出 ----------  
        case 'logout':
            if (isset($_SESSION['username'])) {
                db_execute($db, 
                    "UPDATE users SET is_online = 0, session_id = NULL WHERE username = :username",
                    [':username' => $_SESSION['username']]
                );
            }
            
            session_destroy();
            json_response(['status' => 'ok', 'message' => '已登出']);
            break;
            
        case 'check_time':
            json_response([
                'status' => 'ok',
                'shanghai_time' => getShanghaiTime(),
                'database_time' => get_db_time($db),
                'server_timezone' => date_default_timezone_get()
            ]);
            break;
            
        default:
            json_response(['status' => 'error', 'message' => '未知操作'], 400);
    }
    
} catch (PDOException $e) {
    json_response(['status' => 'error', 'message' => '数据库错误: ' . $e->getMessage()], 500);
}