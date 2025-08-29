<?php
// api.php
header('Content-Type: application/json; charset=utf-8');
error_reporting(0);
ini_set('display_errors', 0);

// 设置时区为上海（东八区）
date_default_timezone_set('Asia/Shanghai');
session_start();

$dbFile = __DIR__ . '/data/chat.db';

function json_response($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// 获取上海时间
function getShanghaiTime() {
    return date('Y-m-d H:i:s');
}

// 格式化相对时间
function formatRelativeTime($timestamp) {
    $now = time();
    $time = strtotime($timestamp);
    $diff = $now - $time;
    $minutes = floor($diff / 60);
    $hours = floor($diff / 3600);
    $days = floor($diff / 86400);
    
    if ($minutes < 1) return '刚刚';
    if ($minutes < 60) return "{$minutes}分钟前";
    if ($hours < 24) return "{$hours}小时前";
    if ($days < 7) return "{$days}天前";
    
    return date('Y-m-d H:i', $time);
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

            // 更新 last_active - 使用上海时间，并设置在线状态
            $currentTime = getShanghaiTime();
            $stmt = $db->prepare("UPDATE users SET last_active=:time, is_online=1 WHERE username=:u");
            $stmt->execute([':time'=>$currentTime, ':u'=>$user['username']]);

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
        $currentTime = getShanghaiTime();
        $stmt = $db->prepare("INSERT INTO users (username,password,role,last_active,is_online) VALUES (:u,:p,'user',:time,1)");
        $stmt->execute([':u'=>$username,':p'=>$hash,':time'=>$currentTime]);

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

        // 使用上海时间
        $currentTime = getShanghaiTime();
        $stmt = $db->prepare("INSERT INTO messages (username,message,type,created_at) VALUES (:u,:m,'text',:time)");
        $stmt->execute([':u'=>$_SESSION['username'],':m'=>$message,':time'=>$currentTime]);

        // 更新 last_active 和在线状态 - 使用上海时间
        $updateStmt = $db->prepare("UPDATE users SET last_active = :time, is_online = 1 WHERE username = :u");
        $updateStmt->execute([':time' => $currentTime, ':u' => $_SESSION['username']]);

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

	// 获取在线用户 - 修复版
	elseif ($action==='get_users') {
		// 首先清理长时间未活动的用户（标记为离线）
		$cleanupStmt = $db->prepare("UPDATE users SET is_online = 0 WHERE datetime(last_active) < datetime('now', '-5 minutes')");
		$cleanupStmt->execute();
		
		$stmt = $db->prepare("SELECT username, role, last_active, is_online FROM users ORDER BY is_online DESC, username ASC");
		$stmt->execute();
		$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

		// 使用数据库时间进行更准确的计算
		$timeStmt = $db->prepare("SELECT datetime('now') as current_db_time");
		$timeStmt->execute();
		$dbTime = $timeStmt->fetch(PDO::FETCH_ASSOC)['current_db_time'];
		$now = strtotime($dbTime);

		foreach ($users as &$u) {
			// 双重检查：优先使用 is_online 字段，其次使用时间计算
			if ($u['is_online'] == 1) {
				$u['online'] = true;
				$u['status_source'] = '实时状态';
			} else {
				// 如果 is_online 为 0，但最近有活动，也标记为在线（容错机制）
				if ($u['last_active']) {
					$lastActive = strtotime($u['last_active']);
					$u['online'] = ($now - $lastActive) < 300; // 5分钟内活跃算在线
					$u['status_source'] = $u['online'] ? '时间计算' : '离线';
				} else {
					$u['online'] = false;
					$u['status_source'] = '无活动记录';
				}
			}
			
			// 添加最后活动时间的友好显示
			if ($u['last_active']) {
				$u['last_active_friendly'] = formatRelativeTime($u['last_active']);
			} else {
				$u['last_active_friendly'] = '从未活动';
			}
		}

		json_response(['status'=>'ok','users'=>$users, 'server_time' => $dbTime]);
	}

    // 获取当前用户信息
    elseif ($action === 'get_user_info') {
        if (isset($_SESSION['username'])) {
            // 获取更详细的用户信息
            $stmt = $db->prepare("SELECT username, role, last_active, is_online FROM users WHERE username = :u");
            $stmt->execute([':u' => $_SESSION['username']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($user) {
                json_response([
                    'status' => 'ok',
                    'user' => [
                        'username' => $user['username'],
                        'role' => $user['role'],
                        'is_online' => (bool)$user['is_online'],
                        'last_active' => $user['last_active']
                    ]
                ]);
            } else {
                json_response(['status'=>'error','message'=>'用户不存在'],404);
            }
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
		try {
			if (!isset($_SESSION['username']) || ($_SESSION['role'] ?? '') !== 'admin') {
				json_response(['status'=>'error','message'=>'无权限'],403);
			}

			$usernameToDelete = trim($_POST['username'] ?? '');
			if ($usernameToDelete === '') {
				json_response(['status'=>'error','message'=>'用户名不能为空'],400);
			}
			
			if ($usernameToDelete === $_SESSION['username']) {
				json_response(['status'=>'error','message'=>'不能删除当前登录用户'],400);
			}

			// 先检查用户是否存在且不是管理员
			$checkStmt = $db->prepare("SELECT role FROM users WHERE username = :u");
			$checkStmt->execute([':u'=>$usernameToDelete]);
			$user = $checkStmt->fetch();
			
			if (!$user) {
				json_response(['status'=>'error','message'=>'用户不存在'],400);
			}
			
			if ($user['role'] === 'admin') {
				json_response(['status'=>'error','message'=>'不能删除管理员用户'],400);
			}

			// 执行删除
			$stmt = $db->prepare("DELETE FROM users WHERE username=:u");
			$stmt->execute([':u'=>$usernameToDelete]);

			json_response(['status'=>'ok','message'=>"用户 $usernameToDelete 已删除"]);
			
		} catch (PDOException $e) {
			error_log("删除用户错误: " . $e->getMessage());
			json_response(['status'=>'error','message'=>'数据库错误'],500);
		}
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
        
        // 使用上海时间
        $currentTime = getShanghaiTime();
        $stmt = $db->prepare("INSERT INTO private_messages (sender, receiver, message, type, created_at) VALUES (:s, :r, :m, :t, :time)");
        $stmt->execute([
            ':s' => $_SESSION['username'],
            ':r' => $receiver,
            ':m' => $message,
            ':t' => $type,
            ':time' => $currentTime
        ]);
        
        json_response(['status'=>'ok','message'=>'私聊消息发送成功']);
    }

    // 获取私聊消息
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
            SELECT pm.*, u.role as sender_role 
            FROM private_messages pm
            JOIN users u ON pm.sender = u.username
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
        $messages = array_reverse($messages);
        
        json_response(['status'=>'ok','messages'=>$messages]);
    }

    // 获取私聊用户列表
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

    // 获取未读私聊消息数量
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

    // 删除私聊消息
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
  
    // 删除主窗口聊天消息
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

	// 心跳动作 - 增强版
	elseif ($action === 'heartbeat') {
		if (!isset($_SESSION['username'])) {
			json_response(['status'=>'error','message'=>'未登录'],401);
		}
		
		// 验证会话有效性
		$username = $_SESSION['username'];
		$currentSessionId = session_id();
		$stmt = $db->prepare("SELECT session_id FROM users WHERE username = :u");
		$stmt->execute([':u' => $username]);
		$user = $stmt->fetch(PDO::FETCH_ASSOC);
		
		if ($user && $user['session_id'] !== $currentSessionId) {
			// 会话无效，清除会话
			session_destroy();
			json_response(['status'=>'error','message'=>'账号已在其他地方登录'],401);
		}
		
		// 更新最后活动时间和在线状态 - 使用上海时间
		$currentTime = getShanghaiTime();
		$stmt = $db->prepare("UPDATE users SET last_active = :time, is_online = 1 WHERE username = :u");
		$stmt->execute([':time' => $currentTime, ':u' => $_SESSION['username']]);
		
		// 清理长时间未活动的用户
		$cleanupStmt = $db->prepare("UPDATE users SET is_online = 0 WHERE datetime(last_active) < datetime('now', '-5 minutes')");
		$cleanupStmt->execute();
		
		json_response(['status'=>'ok','message'=>'心跳更新成功', 'users_updated' => true]);
	}

    // 时间检查动作
    elseif ($action === 'check_time') {
        $currentTime = getShanghaiTime();
        $stmt = $db->prepare("SELECT datetime('now') as db_time");
        $stmt->execute();
        $dbTime = $stmt->fetch(PDO::FETCH_ASSOC)['db_time'];
        
        json_response([
            'status'=>'ok',
            'shanghai_time'=>$currentTime,
            'database_time'=>$dbTime,
            'server_timezone'=>date_default_timezone_get()
        ]);
    }
	
	// 管理员删除消息（包括文件）
	elseif ($action === 'delete_message_admin') {
		// 检查登录与管理员身份
		if (!isset($_SESSION['username']) || ($_SESSION['role'] ?? '') !== 'admin') {
			json_response(['status'=>'error','message'=>'无权限'],403);
		}

		// 获取消息ID（支持POST或GET）
		$messageId = intval($_POST['message_id'] ?? $_GET['id'] ?? 0);
		if ($messageId <= 0) {
			json_response(['status'=>'error','message'=>'无效的消息ID'],400);
		}

		// 查询消息
		$stmt = $db->prepare("SELECT * FROM messages WHERE id = :id");
		$stmt->execute([':id' => $messageId]);
		$message = $stmt->fetch(PDO::FETCH_ASSOC);

		if (!$message) {
			json_response(['status'=>'error','message'=>'消息不存在'],404);
		}

		// 如果是文件类型，删除服务器文件
		if ($message['type'] === 'file') {
			$msgData = json_decode($message['message'], true);
			if (isset($msgData['saved_name'])) {
				$filePath = __DIR__ . '/uploads/' . $msgData['saved_name'];
				if (file_exists($filePath)) unlink($filePath);
			}
		}

		// 删除数据库记录
		$stmt = $db->prepare("DELETE FROM messages WHERE id = :id");
		$stmt->execute([':id' => $messageId]);

		json_response(['status'=>'ok','message'=>'消息已删除']);
	}
	

	// 获取服务器本地文件列表
	elseif ($action === 'get_local_files') {
		$uploadDir = __DIR__ . '/uploads/';
		$files = [];
		
		// 确保上传目录存在
		if (!file_exists($uploadDir)) {
			mkdir($uploadDir, 0777, true);
		}
		
		// 读取uploads目录中的所有文件
		if (file_exists($uploadDir)) {
			$fileList = scandir($uploadDir);
			foreach ($fileList as $file) {
				if ($file !== '.' && $file !== '..' && !is_dir($uploadDir . $file)) {
					$files[] = $file;
				}
			}
		}
		
		json_response(['status' => 'ok', 'files' => $files]);
	}

	// 删除服务器本地文件（仅删除物理文件，用于没有数据库记录的情况）
	elseif ($action === 'delete_local_file') {
		// 检查登录与管理员身份
		if (!isset($_SESSION['username']) || ($_SESSION['role'] ?? '') !== 'admin') {
			json_response(['status'=>'error','message'=>'无权限'],403);
		}

		// 获取文件名
		$filename = $_POST['filename'] ?? '';
		if (empty($filename)) {
			json_response(['status'=>'error','message'=>'文件名不能为空'],400);
		}

		// 安全过滤文件名
		$filename = basename($filename);
		$filePath = __DIR__ . '/uploads/' . $filename;
		
		// 检查文件是否存在
		if (!file_exists($filePath)) {
			json_response(['status'=>'error','message'=>'文件不存在'],404);
		}
		
		// 删除文件
		if (unlink($filePath)) {
			json_response(['status'=>'ok','message'=>'文件删除成功']);
		} else {
			json_response(['status'=>'error','message'=>'文件删除失败'],500);
		}
	}	
	
	// 修改密码接口
	elseif ($action === 'change_password') {
		session_start();
		if (!isset($_SESSION['username'])) {
			json_response(['status'=>'error','message'=>'未登录'], 401);
		}

		$oldPassword = $_POST['old_password'] ?? '';
		$newPassword = $_POST['new_password'] ?? '';

		if (empty($oldPassword) || empty($newPassword)) {
			json_response(['status'=>'error','message'=>'密码不能为空'], 400);
		}

		$username = $_SESSION['username'];

		$stmt = $db->prepare("SELECT password FROM users WHERE username = :username");
		$stmt->execute([':username' => $username]);
		$user = $stmt->fetch(PDO::FETCH_ASSOC);

		if (!$user) json_response(['status'=>'error','message'=>'用户不存在'], 404);

		if (!password_verify($oldPassword, $user['password'])) {
			json_response(['status'=>'error','message'=>'旧密码错误'], 403);
		}

		$newHash = password_hash($newPassword, PASSWORD_DEFAULT);
		$stmt = $db->prepare("UPDATE users SET password = :password WHERE username = :username");
		$stmt->execute([':password' => $newHash, ':username' => $username]);

		json_response(['status'=>'ok','message'=>'密码修改成功']);
	}

	// 退出登录 - 增强版
	elseif ($action==='logout') {
		if (isset($_SESSION['username'])) {
			// 将用户标记为离线并清除 session_id
			$stmt = $db->prepare("UPDATE users SET is_online = 0, session_id = NULL WHERE username = :u");
			$stmt->execute([':u' => $_SESSION['username']]);
		}
		
		session_destroy();
		json_response(['status'=>'ok','message'=>'已登出']);
	}
    else {
        json_response(['status'=>'error','message'=>'未知操作'],400);
    }

} catch (PDOException $e) {
    json_response(['status'=>'error','message'=>'数据库错误: '.$e->getMessage()],500);
}