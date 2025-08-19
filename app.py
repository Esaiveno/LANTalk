from flask import Flask, render_template, request, send_file
from flask_socketio import SocketIO, emit
import json
import os
import base64
import uuid
from datetime import datetime

app = Flask(__name__, static_folder='static')
app.config['SECRET_KEY'] = 'lantalk_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*", 
                   transports=['polling', 'websocket'],
                   async_mode='threading',
                   max_http_buffer_size=2*1024*1024*1024)  # 2GB

# 存储每个IP的聊天记录
chat_history = {}
# 存储全局消息历史
global_messages = []
# 存储在线用户
online_users = {}
# 文件分块缓存
file_chunks = {}

# 数据文件路径
DATA_FILE = 'chat_data.json'
# 文件存储目录
FILES_DIR = 'uploaded_files'

# 确保文件存储目录存在
if not os.path.exists(FILES_DIR):
    os.makedirs(FILES_DIR)

def save_file_data(file_data, filename):
    """保存文件数据到文件系统，返回文件路径"""
    try:
        print(f"保存文件: {filename}")
        
        # 生成唯一文件名
        file_id = str(uuid.uuid4())
        file_extension = os.path.splitext(filename)[1]
        saved_filename = f"{file_id}{file_extension}"
        file_path = os.path.join(FILES_DIR, saved_filename)
        
        # 如果传入的是原始字节，直接写入
        if isinstance(file_data, (bytes, bytearray)):
            file_bytes = bytes(file_data)
        else:
            # 解码base64数据并保存
            if file_data.startswith('data:'):
                # 移除data URL前缀
                header, data = file_data.split(',', 1)
                print(f"Data URL header: {header}")
                print(f"Base64 data length: {len(data)}")
                
                # 验证并修正Base64数据
                data = data.strip()
                padding_needed = (4 - len(data) % 4) % 4
                if padding_needed > 0:
                    data += '=' * padding_needed
                    print(f"添加了 {padding_needed} 个填充字符")
                
                file_bytes = base64.b64decode(data)
            else:
                print(f"纯Base64数据长度: {len(file_data)}")
                
                # 验证并修正Base64数据
                data = file_data.strip()
                padding_needed = (4 - len(data) % 4) % 4
                if padding_needed > 0:
                    data += '=' * padding_needed
                    print(f"添加了 {padding_needed} 个填充字符")
                
                file_bytes = base64.b64decode(data)
        
        with open(file_path, 'wb') as f:
            f.write(file_bytes)
        
        print(f"文件保存成功: {saved_filename}, 大小: {len(file_bytes)} 字节")
        return saved_filename
    except Exception as e:
        print(f"保存文件失败: {e}")
        import traceback
        traceback.print_exc()
        return None

def load_chat_data():
    """从文件加载聊天数据"""
    global chat_history, global_messages
    try:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                chat_history = data.get('chat_history', {})
                global_messages = data.get('global_messages', [])
                print(f"已加载聊天数据，包含 {len(chat_history)} 个用户的记录和 {len(global_messages)} 条全局消息")
        else:
            print("聊天数据文件不存在，将创建新文件")
    except Exception as e:
        print(f"加载聊天数据失败: {e}")
        chat_history = {}
        global_messages = []

def save_chat_data():
    """保存聊天数据到文件"""
    try:
        data = {
            'chat_history': chat_history,
            'global_messages': global_messages
        }
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"保存数据失败: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/history')
def get_history():
    """获取全局聊天历史"""
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR', 'unknown'))
    return {
        'history': global_messages,
        'current_ip': client_ip
    }

@app.route('/files/<filename>')
def download_file(filename):
    """下载文件"""
    try:
        file_path = os.path.join(FILES_DIR, filename)
        if os.path.exists(file_path):
            # 获取原始文件名（去掉UUID前缀）
            original_name = filename
            # 如果文件名包含UUID，尝试获取原始文件名
            if len(filename) > 36 and filename[36] == '.' and '-' in filename[:36]:
                # 从文件名中提取扩展名部分作为原始名称的提示
                extension = os.path.splitext(filename)[1]
                original_name = f"downloaded_file{extension}"
            
            print(f"下载文件: {filename} -> {original_name}")
            return send_file(file_path, as_attachment=True, download_name=original_name)
        else:
            print(f"文件不存在: {filename}")
            return "文件不存在", 404
    except Exception as e:
        print(f"文件下载失败: {e}")
        import traceback
        traceback.print_exc()
        return "下载失败", 500

@socketio.on('connect')
def handle_connect():
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR', 'unknown'))
    online_users[request.sid] = client_ip
    online_count = len(online_users)
    
    # 发送全局历史消息给新连接的用户
    emit('history', {'messages': global_messages})
    
    print(f"用户连接: {client_ip} (会话ID: {request.sid})")
    
    # 通知其他用户有新用户上线（仅通知给除自己外的其他用户）
    emit('user_status', {
        'type': 'join',
        'ip': client_ip,
        'timestamp': datetime.now().strftime('%H:%M:%S'),
        'online_count': online_count
    }, broadcast=True, include_self=False)
    
    # 向新连接的用户发送当前在线人数
    emit('online_count_update', {'count': online_count})

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in online_users:
        client_ip = online_users[request.sid]
        del online_users[request.sid]
        online_count = len(online_users)
        
        print(f"用户断开连接: {client_ip}")
        
        # 广播用户离线通知和更新在线人数（不包括自己）
        emit('user_status', {
            'type': 'leave',
            'ip': client_ip,
            'timestamp': datetime.now().strftime('%H:%M:%S'),
            'online_count': online_count
        }, broadcast=True, include_self=False)
        
        # 广播在线人数更新给所有用户
        emit('online_count_update', {'count': online_count}, broadcast=True)

@socketio.on('file_chunk')
def handle_file_chunk(data):
    """处理文件分块"""
    try:
        file_id = data['fileId']
        chunk_index = data['chunkIndex']
        total_chunks = data['totalChunks']
        file_name = data['fileName']
        file_size = data['fileSize']
        file_type = data['fileType']
        chunk_data = data['data']
        
        print(f"接收文件分块: {file_name}, 分块 {chunk_index + 1}/{total_chunks}")
        
        # 初始化文件分块存储
        if file_id not in file_chunks:
            file_chunks[file_id] = {
                'fileName': file_name,
                'fileSize': file_size,
                'fileType': file_type,
                'totalChunks': total_chunks,
                'chunks': {},
                'receivedChunks': 0
            }
        
        # 存储分块数据
        # 对于第一个分块，保留完整的data URL；对于后续分块，只保留base64数据部分
        if chunk_index == 0:
            # 第一个分块保留完整的data URL
            file_chunks[file_id]['chunks'][chunk_index] = chunk_data
        else:
            # 后续分块只保留base64数据部分
            if chunk_data.startswith('data:'):
                # 如果包含data URL头部，去掉它
                _, base64_data = chunk_data.split(',', 1)
                file_chunks[file_id]['chunks'][chunk_index] = base64_data
            else:
                # 如果已经是纯base64数据，直接存储
                file_chunks[file_id]['chunks'][chunk_index] = chunk_data
        
        file_chunks[file_id]['receivedChunks'] += 1
        
        # 发送确认
        emit('file_chunk_ack', {'success': True, 'chunkIndex': chunk_index})
        
        # 每10个分块打印一次进度
        if (file_chunks[file_id]['receivedChunks'] % 10 == 0) or (file_chunks[file_id]['receivedChunks'] == total_chunks):
            print(f"已接收 {file_chunks[file_id]['receivedChunks']}/{total_chunks} 个分块")
        
    except Exception as e:
        print(f"处理文件分块失败: {e}")
        emit('file_chunk_ack', {'success': False, 'error': str(e)})

@socketio.on('file_upload_complete')
def handle_file_upload_complete(data):
    """处理文件上传完成"""
    try:
        file_id = data['fileId']
        message = data.get('message', '')
        client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR', 'unknown'))
        
        if file_id not in file_chunks:
            print(f"文件ID {file_id} 不存在")
            return
        
        file_info = file_chunks[file_id]
        
        # 检查是否所有分块都已接收
        if file_info['receivedChunks'] != file_info['totalChunks']:
            print(f"文件分块不完整: {file_info['receivedChunks']}/{file_info['totalChunks']}")
            return
        
        print(f"开始重组文件: {file_info['fileName']}")
        print(f"总分块数: {file_info['totalChunks']}, 已接收: {file_info['receivedChunks']}")
        print(f"原始文件大小: {file_info['fileSize']} 字节")
        
        # 重组文件数据（逐块解码为字节再拼接，避免Base64拼接导致的数据破坏）
        base64_parts = []
        for i in range(file_info['totalChunks']):
            if i in file_info['chunks']:
                chunk_data = file_info['chunks'][i]
                if i == 0 and isinstance(chunk_data, str) and chunk_data.startswith('data:'):
                    # 第一个分块可能包含data URL头部
                    if ',' in chunk_data:
                        _, b64 = chunk_data.split(',', 1)
                    else:
                        b64 = chunk_data
                else:
                    b64 = chunk_data
                base64_parts.append(b64)
        
        if not base64_parts:
            print("错误：未找到任何分块数据进行重组")
            return
        
        bytes_segments = []
        total_decoded = 0
        for idx, part in enumerate(base64_parts):
            if not isinstance(part, str):
                print(f"警告：分块 {idx} 不是字符串，已跳过")
                continue
            data_str = part.strip()
            # 为每个分块单独补齐填充
            padding_needed = (4 - len(data_str) % 4) % 4
            if padding_needed:
                data_str += '=' * padding_needed
            try:
                seg = base64.b64decode(data_str)
                bytes_segments.append(seg)
                total_decoded += len(seg)
            except Exception as e:
                print(f"分块 {idx} 解码失败: {e}")
                return
        
        file_bytes = b''.join(bytes_segments)
        print(f"重组后的字节总大小: {len(file_bytes)}，原始大小: {file_info['fileSize']}")
        if len(file_bytes) != file_info['fileSize']:
            print("警告：重组字节大小与原始大小不一致")
        
        # 保存重组后的文件（直接写入字节）
        saved_filename = save_file_data(file_bytes, file_info['fileName'])
        
        if saved_filename:
            # 创建消息
            file_message = {
                'ip': client_ip,
                'message': message,
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'type': 'file',
                'file_data': {
                    'name': file_info['fileName'],
                    'size': file_info['fileSize'],
                    'type': file_info['fileType'],
                    'filename': saved_filename,
                    'download_url': f'/files/{saved_filename}'
                }
            }
            
            # 保存到全局消息历史
            global_messages.append(file_message)
            
            # 同时保存到发送者的个人聊天记录（用于备份）
            if client_ip not in chat_history:
                chat_history[client_ip] = []
            chat_history[client_ip].append(file_message)
            
            # 先向发送者确认消息已发送
            emit('message_sent', {'ip': client_ip})
            
            # 广播消息
            emit('new_message', file_message, broadcast=True)
            
            print(f"大文件上传完成: {file_info['fileName']} -> {saved_filename}")
            
            # 清理分块缓存
            del file_chunks[file_id]
            
            # 保存聊天数据
            save_chat_data()
        else:
            print(f"大文件保存失败: {file_info['fileName']}")
            
    except Exception as e:
        print(f"处理文件上传完成失败: {e}")
        import traceback
        traceback.print_exc()

@socketio.on('send_message')
def handle_message(data):
    client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR', 'unknown'))
    
    message = {
        'ip': client_ip,
        'message': data.get('message', ''),
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'type': data.get('type', 'text')
    }
    
    # 如果是图片消息，添加图片数据
    if message['type'] == 'image':
        message['image_data'] = data.get('image_data', '')
    
    # 处理文件数据
    if data.get('file_data'):
        file_data = data['file_data']
        # 保存文件到文件系统
        saved_filename = save_file_data(file_data['data'], file_data['name'])
        if saved_filename:
            # 只保存文件元数据，不保存实际数据
            message['file_data'] = {
                'name': file_data['name'],
                'size': file_data['size'],
                'type': file_data['type'],
                'filename': saved_filename,  # 服务器上的文件名
                'download_url': f'/files/{saved_filename}'  # 下载链接
            }
        else:
            # 文件保存失败，记录错误
            print(f"文件保存失败: {file_data['name']}")
            return  # 不发送消息
    
    # 保存到全局消息历史
    global_messages.append(message)
    
    # 同时保存到发送者的个人聊天记录（用于备份）
    if client_ip not in chat_history:
        chat_history[client_ip] = []
    chat_history[client_ip].append(message)
    
    # 保存数据到文件
    save_chat_data()
    
    # 先向发送者确认消息已发送
    emit('message_sent', {'ip': client_ip})
    
    # 广播消息给所有连接的用户
    emit('new_message', message, broadcast=True)
    
    message_type = '图片' if message['type'] == 'image' else '文本'
    print(f"收到{message_type}消息 - IP: {client_ip}, 内容: {data.get('message', '图片消息')}")

if __name__ == '__main__':
    # 启动时加载聊天数据
    load_chat_data()
    
    print("LANTalk 聊天服务器启动中...")
    print("访问地址: http://localhost:5000")
    print("局域网访问: http://[你的IP]:5000")
    
    # 启动服务器，允许局域网访问
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)