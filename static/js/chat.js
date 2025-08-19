// 初始化Socket.IO连接
const socket = io({
    transports: ['polling'],
    upgrade: false,
    rememberUpgrade: false,
    maxHttpBufferSize: 2 * 1024 * 1024 * 1024  // 2GB
});

// DOM元素
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const connectionStatus = document.getElementById('connectionStatus');
const statusText = document.getElementById('statusText');
const userIP = document.getElementById('userIP');
const onlineCount = document.getElementById('onlineCount');
const imageInput = document.getElementById('imageInput');
const imageButton = document.getElementById('imageButton');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const removeImageButton = document.getElementById('removeImage');
const fileInput = document.getElementById('fileInput');
const fileButton = document.getElementById('fileButton');

// 当前选择的图片和文件
let selectedImage = null;
let selectedFile = null;

// 当前用户IP
let currentUserIP = null;

// 用户头像缓存
let userAvatars = {};

// 拖拽状态
let isDragOver = false;

// 自定义确认对话框
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleElement = document.getElementById('confirmTitle');
        const messageElement = document.getElementById('confirmMessage');
        const okButton = document.getElementById('confirmOk');
        const cancelButton = document.getElementById('confirmCancel');
        
        titleElement.textContent = title;
        messageElement.textContent = message;
        
        modal.style.display = 'flex';
        
        // 处理确认按钮点击
        const handleOk = () => {
            modal.style.display = 'none';
            okButton.removeEventListener('click', handleOk);
            cancelButton.removeEventListener('click', handleCancel);
            resolve(true);
        };
        
        // 处理取消按钮点击
        const handleCancel = () => {
            modal.style.display = 'none';
            okButton.removeEventListener('click', handleOk);
            cancelButton.removeEventListener('click', handleCancel);
            resolve(false);
        };
        
        okButton.addEventListener('click', handleOk);
        cancelButton.addEventListener('click', handleCancel);
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        });
    });
}

// 生成随机头像
function generateAvatar(userIP) {
    // 如果已经有缓存的头像，直接返回
    if (userAvatars[userIP]) {
        return userAvatars[userIP];
    }
    
    // 头像背景色数组
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
        '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
    ];
    
    // 根据IP生成一个稳定的随机数
    let hash = 0;
    for (let i = 0; i < userIP.length; i++) {
        const char = userIP.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
    }
    
    // 使用hash选择颜色和图案
    const colorIndex = Math.abs(hash) % colors.length;
    const backgroundColor = colors[colorIndex];
    
    // 生成用户名首字母或IP最后一位数字
    const lastDigit = userIP.split('.').pop();
    const avatarText = lastDigit || '?';
    
    // 创建SVG头像
    const svg = `
        <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="24" fill="${backgroundColor}"/>
            <text x="24" y="31" font-family="Arial, sans-serif" font-size="18" font-weight="bold" 
                  text-anchor="middle" fill="white">${avatarText}</text>
        </svg>
    `;
    
    const avatarDataUrl = 'data:image/svg+xml;base64,' + btoa(svg);
    
    // 缓存头像
    userAvatars[userIP] = avatarDataUrl;
    
    return avatarDataUrl;
}

// Toast 通知函数
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // 触发显示动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 自动移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// 进度条控制函数
let uploadStartTime = null;
let uploadedBytes = 0;
let totalBytes = 0;

function showProgress(title = '正在处理...') {
    const progressOverlay = document.getElementById('progressOverlay');
    const progressContainer = document.getElementById('progressContainer');
    const progressTitle = document.getElementById('progressTitle');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const speedText = document.getElementById('speedText');
    
    progressTitle.textContent = title;
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    speedText.textContent = '0 KB/s';
    progressOverlay.style.display = 'block';
    progressContainer.style.display = 'block';
    
    // 重置速度计算参数
    uploadStartTime = Date.now();
    uploadedBytes = 0;
    totalBytes = 0;
}

function updateProgress(percent, bytesTransferred = null, totalFileSize = null) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const speedText = document.getElementById('speedText');
    
    progressBar.style.width = percent + '%';
    progressText.textContent = Math.round(percent) + '%';
    
    // 如果提供了字节信息，计算并显示传输速度
    if (bytesTransferred !== null && totalFileSize !== null) {
        uploadedBytes = bytesTransferred;
        totalBytes = totalFileSize;
        
        const currentTime = Date.now();
        const elapsedSeconds = (currentTime - uploadStartTime) / 1000;
        
        if (elapsedSeconds > 0) {
            const speed = uploadedBytes / elapsedSeconds; // bytes per second
            speedText.textContent = formatSpeed(speed);
        }
    }
}

function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond < 1024) {
        return Math.round(bytesPerSecond) + ' B/s';
    } else if (bytesPerSecond < 1024 * 1024) {
        return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
    } else {
        return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s';
    }
}

function hideProgress() {
    const progressOverlay = document.getElementById('progressOverlay');
    const progressContainer = document.getElementById('progressContainer');
    
    progressOverlay.style.display = 'none';
    progressContainer.style.display = 'none';
    
    // 重置速度计算参数
    uploadStartTime = null;
    uploadedBytes = 0;
    totalBytes = 0;
}

// 带进度条的文件下载函数
function downloadFileWithProgress(dataUrl, fileName) {
    showProgress('正在准备下载...');
    
    // 模拟下载进度
    let progress = 0;
    const downloadInterval = setInterval(() => {
        progress += Math.random() * 15 + 5; // 随机增加5-20%
        if (progress >= 100) {
            progress = 100;
            clearInterval(downloadInterval);
            updateProgress(100);
            
            // 实际下载文件
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            setTimeout(() => {
                hideProgress();
                showToast('文件下载完成', 'success');
            }, 500);
        } else {
            updateProgress(progress);
        }
    }, 100);
}

// 初始化聊天
function initializeChat() {
    // 获取用户IP和历史记录
    fetch('/api/history')
        .then(response => response.json())
        .then(data => {
            // 设置当前用户IP
            if (data.current_ip) {
                setCurrentUserIP(data.current_ip);
            }
            
            // 清空聊天区域，避免重复渲染
            chatMessages.innerHTML = '';
            
            // 显示历史消息
            if (data.history && data.history.length > 0) {
                data.history.forEach(message => {
                    displayMessage(message, true);
                });
                scrollToBottom();
            }
        })
        .catch(error => console.error('获取历史记录失败:', error));
}

// Socket事件处理
function setupSocketEvents() {
    // 连接事件
    socket.on('connect', function() {
        connectionStatus.className = 'connection-status connected';
        statusText.textContent = '已连接到聊天服务器';
        console.log('已连接到服务器');
    });
    
    socket.on('disconnect', function() {
        connectionStatus.className = 'connection-status disconnected';
        statusText.textContent = '连接已断开';
        console.log('与服务器断开连接');
    });
    
    // 接收历史消息
    socket.on('history', function(data) {
        // 清空聊天区域，避免重复渲染
        chatMessages.innerHTML = '';
        
        data.messages.forEach(message => {
            displayMessage(message, true);
        });
        scrollToBottom();
    });
    
    // 接收新消息
    socket.on('new_message', function(message) {
        // 如果是文件消息且不是自己发送的，显示接收进度
        if (message.type === 'file' && message.ip !== getCurrentUserIP()) {
            showProgress('正在接收文件...');
            
            // 模拟接收进度
            let progress = 0;
            const receiveInterval = setInterval(() => {
                progress += Math.random() * 20 + 10; // 随机增加10-30%
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(receiveInterval);
                    updateProgress(100);
                    
                    setTimeout(() => {
                        hideProgress();
                        displayMessage(message, false);
                        scrollToBottom();
                        showToast('文件接收完成', 'success');
                    }, 500);
                } else {
                    updateProgress(progress);
                }
            }, 150);
        } else {
            displayMessage(message, false);
            scrollToBottom();
        }
    });
    
    // 用户状态变化
    socket.on('user_status', function(data) {
        const statusMessage = data.type === 'join' ? 
            `${data.ip} 加入了聊天室` : 
            `${data.ip} 离开了聊天室`;
        
        const systemDiv = document.createElement('div');
        systemDiv.className = 'system-message';
        systemDiv.textContent = `${statusMessage} (${data.timestamp})`;
        chatMessages.appendChild(systemDiv);
        
        // 更新在线人数
        if (data.online_count !== undefined) {
            onlineCount.textContent = data.online_count;
        }
        
        scrollToBottom();
    });
    
    // 在线人数更新
    socket.on('online_count_update', function(data) {
        onlineCount.textContent = data.count;
    });
    
    // 监听自己发送的消息确认
    socket.on('message_sent', function(data) {
        if (!currentUserIP) {
            setCurrentUserIP(data.ip);
        }
    });
}

// 显示消息
function displayMessage(message, isHistory) {
    const messageDiv = document.createElement('div');
    
    // 判断是否是自己的消息
    const isOwnMessage = message.ip === getCurrentUserIP();
    messageDiv.className = `message ${isOwnMessage ? 'own' : 'other'}`;
    
    // 创建头像
    const avatar = document.createElement('img');
    avatar.className = 'message-avatar';
    avatar.src = generateAvatar(message.ip);
    avatar.alt = `${message.ip}的头像`;
    
    // 创建消息内容容器
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    messageInfo.textContent = `${message.ip} • ${message.timestamp}`;
    
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    
    // 检查是否是图片消息
    if (message.type === 'image') {
        // 图片消息不要背景
        messageBubble.classList.add('message-image-only');
        
        const img = document.createElement('img');
        img.className = 'message-image';
        img.src = message.image_data;
        img.alt = '图片';
        img.onclick = function() {
            openImageViewer(message.image_data);
        };
        messageBubble.appendChild(img);
        
        // 如果有文字说明，添加到图片下方
        if (message.message && message.message.trim()) {
            const textDiv = document.createElement('div');
            textDiv.style.marginTop = '8px';
            textDiv.style.padding = '8px 12px';
            textDiv.style.background = isOwnMessage ? '#6c6c70' : '#f2f2f7';
            textDiv.style.color = isOwnMessage ? '#ffffff' : '#1d1d1f';
            textDiv.style.borderRadius = '12px';
            textDiv.textContent = message.message;
            messageBubble.appendChild(textDiv);
        }
    } else if (message.type === 'file') {
        // 文件消息
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-message';
        
        const fileIcon = document.createElement('div');
        fileIcon.className = 'file-icon';
        fileIcon.textContent = '📎';
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = message.file_data.name;
        
        const fileDetails = document.createElement('div');
        fileDetails.className = 'file-details';
        let fileSize;
        if (message.file_data.size >= 1024 * 1024) {
            fileSize = (message.file_data.size / (1024 * 1024)).toFixed(1) + ' MB';
        } else {
            fileSize = (message.file_data.size / 1024).toFixed(1) + ' KB';
        }
        fileDetails.textContent = `${fileSize} • ${message.file_data.type}`;
        
        const downloadLink = document.createElement('a');
        // 使用服务器下载URL而不是base64数据
        const downloadUrl = message.file_data.download_url || message.file_data.data;
        downloadLink.href = downloadUrl;
        downloadLink.download = message.file_data.name;
        downloadLink.className = 'file-download';
        downloadLink.textContent = '下载';
        
        // 如果是新的下载URL格式，直接下载；否则使用进度条
        if (message.file_data.download_url) {
            // 新格式：直接下载
            downloadLink.onclick = function(e) {
                showToast('开始下载文件...', 'info');
            };
        } else {
            // 旧格式：使用进度条（兼容性）
            downloadLink.onclick = function(e) {
                e.preventDefault();
                downloadFileWithProgress(message.file_data.data, message.file_data.name);
            };
        }
        
        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileDetails);
        
        fileDiv.appendChild(fileIcon);
        fileDiv.appendChild(fileInfo);
        fileDiv.appendChild(downloadLink);
        
        messageBubble.appendChild(fileDiv);
        
        // 如果有文字说明，添加到文件下方
        if (message.message && message.message.trim()) {
            const textDiv = document.createElement('div');
            textDiv.style.marginTop = '8px';
            textDiv.style.padding = '8px 12px';
            textDiv.style.background = isOwnMessage ? '#6c6c70' : '#f2f2f7';
            textDiv.style.color = isOwnMessage ? '#ffffff' : '#1d1d1f';
            textDiv.style.borderRadius = '12px';
            textDiv.textContent = message.message;
            messageBubble.appendChild(textDiv);
        }
    } else {
        const textContent = document.createElement('div');
        textContent.className = 'text-content';
        textContent.textContent = message.message;
        messageBubble.appendChild(textContent);
    }
    
    // 将消息信息和气泡添加到内容容器
    messageContent.appendChild(messageInfo);
    messageContent.appendChild(messageBubble);
    
    // 将头像和内容添加到消息容器
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
}

// 获取当前用户IP
function getCurrentUserIP() {
    return currentUserIP;
}

// 设置当前用户IP
function setCurrentUserIP(ip) {
    currentUserIP = ip;
    userIP.textContent = ip;
}

// 发送消息
// 直接发送小文件
function sendFileDirectly(file, message) {
    const reader = new FileReader();
    
    // 显示进度条
    showProgress('正在读取文件...');
    
    reader.onprogress = function(e) {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 50; // 读取占50%
            updateProgress(percent);
        }
    };
    
    reader.onload = function(e) {
        try {
            updateProgress(50);
            document.getElementById('progressTitle').textContent = '正在发送文件...';
            
            // 开始网络发送，初始化速度统计
            uploadStartTime = Date.now();
            totalBytes = file.size;
            document.getElementById('speedText').textContent = '计算中...';
            
            socket.emit('send_message', {
                type: 'file',
                message: message,
                file_data: {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: e.target.result
                }
            }, function(response) {
                // 发送完成回调（使用总大小和耗时计算平均速度）
                updateProgress(100, file.size, file.size);
                setTimeout(() => {
                    hideProgress();
                    showToast('文件发送成功', 'success');
                }, 500);
            });
            
            // 保持进度条平滑到接近完成
            let sendProgress = 50;
            const sendInterval = setInterval(() => {
                sendProgress += 5;
                if (sendProgress >= 95) {
                    clearInterval(sendInterval);
                    updateProgress(95);
                } else {
                    updateProgress(sendProgress);
                }
            }, 100);
            
            // 发送完成后清除选择
            clearFileSelection();
        } catch (error) {
            console.error('文件发送失败:', error);
            hideProgress();
            showToast('文件发送失败，请重试', 'error');
        }
    };
    
    reader.onerror = function() {
        console.error('文件读取失败');
        hideProgress();
        showToast('文件读取失败，请重试', 'error');
    };
    
    reader.readAsDataURL(file);
}

// 分块发送大文件
function sendFileInChunks(file, message) {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = generateUUID();
    let currentChunk = 0;
    let transferredBytes = 0; // 已确认传输的字节数
    
    showProgress('正在准备发送大文件...');
    
    function sendNextChunk() {
        if (currentChunk >= totalChunks) {
            // 所有分块发送完成
            socket.emit('file_upload_complete', {
                fileId: fileId,
                message: message
            });
            
            updateProgress(100, file.size, file.size);
            setTimeout(() => {
                hideProgress();
                showToast('大文件发送成功', 'success');
                clearFileSelection();
            }, 500);
            return;
        }
        
        const start = currentChunk * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        const chunkSizeLocal = end - start;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            // 更新标题，实际进度与服务端确认后再更新
            document.getElementById('progressTitle').textContent = `正在发送文件 (${currentChunk + 1}/${totalChunks})`;
            
            socket.emit('file_chunk', {
                 fileId: fileId,
                 chunkIndex: currentChunk,
                 totalChunks: totalChunks,
                 fileName: file.name,
                 fileSize: file.size,
                 fileType: file.type,
                 data: e.target.result
             });
             
             // 等待分块确认
             const ackHandler = function(response) {
                 if (response && response.success && response.chunkIndex === currentChunk) {
                     socket.off('file_chunk_ack', ackHandler); // 立即移除当前监听器
                     clearTimeout(ackTimeout); // 清除超时定时器
                     
                     // 该分块已确认，更新累计字节与进度/速度
                     transferredBytes += chunkSizeLocal;
                     const progress = (transferredBytes / file.size) * 100;
                     updateProgress(progress, transferredBytes, file.size);
                     
                     currentChunk++;
                     setTimeout(sendNextChunk, 100); // 稍微延迟避免过快发送
                 } else if (response && !response.success) {
                     socket.off('file_chunk_ack', ackHandler); // 移除当前监听器
                     clearTimeout(ackTimeout); // 清除超时定时器
                     hideProgress();
                     showToast('文件分块发送失败，请重试', 'error');
                 }
             };
             
             socket.on('file_chunk_ack', ackHandler);
             
             // 设置超时机制（30秒）
             const ackTimeout = setTimeout(() => {
                 socket.off('file_chunk_ack', ackHandler);
                 hideProgress();
                 showToast(`分块 ${currentChunk + 1} 确认超时，请重试`, 'error');
             }, 30000);
        };
        
        reader.onerror = function() {
            hideProgress();
            showToast('文件读取失败，请重试', 'error');
        };
        
        reader.readAsDataURL(chunk);
    }
    
    // 网络发送速度从第一块开始计算
    uploadStartTime = Date.now();
    totalBytes = file.size;
    
    sendNextChunk();
}

// 生成UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function sendMessage() {
    const message = messageInput.value.trim();
    
    // 检查是否为空消息
    if (!selectedImage && !selectedFile && !message) {
        showToast('不能发送空消息哦！！！', 'warning');
        return;
    }
    
    if (selectedImage) {
        // 发送图片消息
        if (socket.connected) {
            socket.emit('send_message', {
                type: 'image',
                message: message,
                image_data: selectedImage
            });
            clearImagePreview();
            messageInput.value = '';
        }
    } else if (selectedFile) {
        // 发送文件消息
        if (socket.connected && selectedFile) {
            const fileToSend = selectedFile; // 保存文件引用
            
            // 检查文件大小，决定使用普通传输还是分块传输
            const CHUNK_THRESHOLD = 10 * 1024 * 1024; // 10MB阈值
            
            if (fileToSend.size > CHUNK_THRESHOLD) {
                // 大文件分块传输
                sendFileInChunks(fileToSend, message);
            } else {
                // 小文件直接传输
                sendFileDirectly(fileToSend, message);
            }
            
            messageInput.value = '';
            messageInput.disabled = false;
        } else {
            showToast('连接已断开，无法发送文件', 'warning');
            messageInput.disabled = false;
        }
    } else if (message && socket.connected) {
        // 发送文本消息
        socket.emit('send_message', {
            type: 'text',
            message: message
        });
        messageInput.value = '';
    }
}

// 处理图片选择
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        // 检查图片大小（限制为5MB）
        if (file.size > 5 * 1024 * 1024) {
            showToast('图片文件过大，请选择小于5MB的图片', 'warning');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedImage = e.target.result;
            imagePreview.src = selectedImage;
            imagePreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

// 清除图片预览
function clearImagePreview() {
    selectedImage = null;
    imagePreview.src = '';
    imagePreviewContainer.style.display = 'none';
    imageInput.value = '';
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        // 检查文件大小（限制为2GB）
        if (file.size > 2 * 1024 * 1024 * 1024) {
            showToast('文件大小不能超过2GB', 'warning');
            return;
        }
        
        // 对大文件给出提示
        if (file.size > 100 * 1024 * 1024) { // 100MB
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
            showToast(`检测到大文件 (${fileSizeMB}MB)，上传可能需要较长时间`, 'info', 5000);
        }
        
        selectedFile = file;
        // 显示文件信息
        const fileName = file.name;
        let fileSize;
        if (file.size >= 1024 * 1024) {
            fileSize = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
        } else {
            fileSize = (file.size / 1024).toFixed(1) + ' KB';
        }
        
        // 在输入框中显示文件信息
        messageInput.value = `📎 ${fileName} (${fileSize})`;
        messageInput.disabled = true;
    }
}

// 清除文件选择
function clearFileSelection() {
    selectedFile = null;
    fileInput.value = '';
    messageInput.disabled = false;
    if (!selectedImage) {
        messageInput.value = '';
    }
}

// 滚动到底部
function scrollToBottom() {
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth'
    });
}

// 初始化拖拽功能
function initializeDragAndDrop() {
    const chatContainer = document.querySelector('.chat-container');
    
    // 防止默认拖拽行为
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        chatContainer.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // 拖拽进入
    ['dragenter', 'dragover'].forEach(eventName => {
        chatContainer.addEventListener(eventName, highlight, false);
    });
    
    // 拖拽离开
    ['dragleave', 'drop'].forEach(eventName => {
        chatContainer.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight(e) {
        if (!isDragOver) {
            isDragOver = true;
            chatContainer.style.backgroundColor = '#f0f8ff';
            chatContainer.style.border = '2px dashed #007aff';
            chatContainer.style.opacity = '0.8';
        }
    }
    
    function unhighlight(e) {
        isDragOver = false;
        chatContainer.style.backgroundColor = '';
        chatContainer.style.border = '';
        chatContainer.style.opacity = '';
    }
    
    // 处理文件拖放
    chatContainer.addEventListener('drop', handleDrop, false);
    
    async function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            const file = files[0];
            
            // 确认对话框
            const isImage = file.type.startsWith('image/');
            const fileType = isImage ? '图片' : '文件';
            let fileSize;
            if (file.size >= 1024 * 1024) {
                fileSize = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
            } else {
                fileSize = (file.size / 1024).toFixed(1) + ' KB';
            }
            const confirmMessage = `确定要发送这个${fileType}吗？\n\n文件名: ${file.name}\n大小: ${fileSize}`;
            
            const confirmed = await showConfirm(`发送${fileType}`, confirmMessage);
            if (confirmed) {
                if (isImage) {
                    handleImageFile(file);
                } else {
                    handleNonImageFile(file);
                }
            }
        }
    }
}

// 处理图片文件
function handleImageFile(file) {
    // 检查图片大小（限制为5MB）
    if (file.size > 5 * 1024 * 1024) {
        showToast('图片文件过大，请选择小于5MB的图片', 'warning');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        selectedImage = e.target.result;
        imagePreview.src = selectedImage;
        imagePreviewContainer.style.display = 'block';
        // 拖拽上传后自动发送
        sendMessage();
    };
    reader.readAsDataURL(file);
}

// 处理非图片文件
function handleNonImageFile(file) {
    // 检查文件大小（限制为2GB）
    if (file.size > 2 * 1024 * 1024 * 1024) {
        showToast('文件大小不能超过2GB', 'warning');
        return;
    }
    
    selectedFile = file;
    // 显示文件信息
    const fileName = file.name;
    let fileSize;
    if (file.size >= 1024 * 1024) {
        fileSize = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    } else {
        fileSize = (file.size / 1024).toFixed(1) + ' KB';
    }
    
    // 在输入框中显示文件信息
    messageInput.value = `📎 ${fileName} (${fileSize})`;
    messageInput.disabled = true;
    // 拖拽上传后自动发送
    sendMessage();
}

// 设置事件监听器
function setupEventListeners() {
    sendButton.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 清理拖拽文件状态
    function clearDraggedFileState() {
        if (selectedFile && messageInput.disabled) {
            selectedFile = null;
            messageInput.disabled = false;
            messageInput.value = '';
        }
    }
    
    // 监听输入框变化，如果用户手动清空了拖拽文件信息，则清理状态
    messageInput.addEventListener('input', function() {
        if (messageInput.disabled && messageInput.value === '') {
            clearDraggedFileState();
        }
    });
    
    imageButton.addEventListener('click', function() {
        imageInput.click();
    });
    
    fileButton.addEventListener('click', function() {
        fileInput.click();
    });
    
    imageInput.addEventListener('change', handleImageSelect);
    
    fileInput.addEventListener('change', handleFileSelect);
    
    removeImageButton.addEventListener('click', clearImagePreview);
    
    // 自动调整输入框高度
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
}

// 初始化应用
function initApp() {
    setupSocketEvents();
    setupEventListeners();
    initializeDragAndDrop();
    initializeChat();
    
    // 如果还没有设置用户IP，设置为本地用户
    if (!currentUserIP) {
        setCurrentUserIP('本地用户');
    }
}

// 图片查看器功能
let imageViewer = null;
let imageViewerImg = null;
let imageViewerCounter = null;
let imageViewerPrev = null;
let imageViewerNext = null;
let imageViewerClose = null;
let currentImages = [];
let currentImageIndex = 0;

// 初始化图片查看器
function initImageViewer() {
    imageViewer = document.getElementById('imageViewer');
    imageViewerImg = document.getElementById('imageViewerImg');
    imageViewerCounter = document.getElementById('imageViewerCounter');
    imageViewerPrev = document.getElementById('imageViewerPrev');
    imageViewerNext = document.getElementById('imageViewerNext');
    imageViewerClose = document.getElementById('imageViewerClose');
    
    // 绑定事件
    imageViewerClose.addEventListener('click', closeImageViewer);
    imageViewerPrev.addEventListener('click', showPrevImage);
    imageViewerNext.addEventListener('click', showNextImage);
    
    // 点击背景关闭
    imageViewer.addEventListener('click', function(e) {
        if (e.target === imageViewer || e.target.classList.contains('image-viewer-overlay')) {
            closeImageViewer();
        }
    });
    
    // 键盘事件
    document.addEventListener('keydown', function(e) {
        if (imageViewer.classList.contains('show')) {
            switch(e.key) {
                case 'Escape':
                    closeImageViewer();
                    break;
                case 'ArrowLeft':
                    showPrevImage();
                    break;
                case 'ArrowRight':
                    showNextImage();
                    break;
            }
        }
    });
}

// 收集所有图片
function getAllImages() {
    const images = [];
    const messageImages = document.querySelectorAll('.message-image');
    messageImages.forEach(img => {
        images.push(img.src);
    });
    return images;
}

// 打开图片查看器
function openImageViewer(imageSrc) {
    currentImages = getAllImages();
    currentImageIndex = currentImages.indexOf(imageSrc);
    
    if (currentImageIndex === -1) {
        currentImageIndex = 0;
    }
    
    updateImageViewer();
    imageViewer.style.display = 'flex';
    
    // 使用setTimeout确保display生效后再添加show类
    setTimeout(() => {
        imageViewer.classList.add('show');
    }, 10);
}

// 关闭图片查看器
function closeImageViewer() {
    imageViewer.classList.remove('show');
    setTimeout(() => {
        imageViewer.style.display = 'none';
    }, 300);
}

// 显示上一张图片
function showPrevImage() {
    if (currentImageIndex > 0) {
        currentImageIndex--;
        updateImageViewer();
    }
}

// 显示下一张图片
function showNextImage() {
    if (currentImageIndex < currentImages.length - 1) {
        currentImageIndex++;
        updateImageViewer();
    }
}

// 更新图片查看器
function updateImageViewer() {
    if (currentImages.length === 0) return;
    
    imageViewerImg.src = currentImages[currentImageIndex];
    imageViewerCounter.textContent = `${currentImageIndex + 1} / ${currentImages.length}`;
    
    // 更新按钮状态
    imageViewerPrev.disabled = currentImageIndex === 0;
    imageViewerNext.disabled = currentImageIndex === currentImages.length - 1;
    
    // 如果只有一张图片，隐藏切换按钮
    if (currentImages.length <= 1) {
        imageViewerPrev.style.display = 'none';
        imageViewerNext.style.display = 'none';
    } else {
        imageViewerPrev.style.display = 'flex';
        imageViewerNext.style.display = 'flex';
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    initImageViewer();
});