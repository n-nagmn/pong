const http = require('http');
const { Server } = require("socket.io");

const httpServer = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Socket.IO Server Running");
});

const allowedOrigins = [
    "http://ubuntu.local", // ローカルテスト用（残しておいても良い）
    "https://your-cloudflare-domain.com" // ★ あなたのCloudflareドメインに変更 (httpsの場合)
    // "http://your-cloudflare-domain.com" // (httpの場合)
  ];

const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      // リストに含まれているか、(Postmanなどからの)オリジンが無いアクセスを許可
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"]
  }
});

// --- ゲームの基本設定 ---
const FIELD_WIDTH = 800;
const FIELD_HEIGHT = 600;
const PLAYER_HEIGHT = 100;
const PLAYER_WIDTH = 20;
const PLAYER_SPEED = 5;
const BALL_SPEED_X_INIT = 5;
const BALL_SPEED_Y_INIT = 2;
const BALL_RADIUS = 10;

// ★ 複数のルームを管理するオブジェクト
// rooms = {
//   'room_123': {
//     players: { p1: 'socketId1', p2: 'socketId2' },
//     playerMove: { p1: null, p2: null },
//     gameState: { ... },
//     intervalId: 123
//   },
//   'room_456': { ... }
// }
const rooms = {};


// --- 3. サーバー側のゲームループ (ルームごとに実行) ---
function startGameLoop(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // このルーム専用のゲームループを開始
    room.intervalId = setInterval(() => {
        if (!rooms[roomId]) { // ルームが削除されていたらループ停止
            clearInterval(room.intervalId);
            return;
        }
        
        // (A) ゲームロジックの更新
        updateGameState(roomId);
        
        // (B) このルームの全員に状態をブロードキャスト
        // io.emit() ではなく、 io.to(roomId).emit() を使う
        io.to(roomId).emit("gameState", room.gameState);
        
    }, 1000 / 60);
}

// --- 2. ゲームロジックの関数 (ルームIDを受け取る) ---
function updateGameState(roomId) {
    const room = rooms[roomId];
    if (!room || room.gameState.status !== 'playing') return;

    // このルームの gameState と playerMove を取り出す
    const { gameState, playerMove } = room;

    // (A-1) プレイヤーの移動処理
    if (playerMove.p1 === 'up') gameState.player1.y -= PLAYER_SPEED;
    else if (playerMove.p1 === 'down') gameState.player1.y += PLAYER_SPEED;
    if (playerMove.p2 === 'up') gameState.player2.y -= PLAYER_SPEED;
    else if (playerMove.p2 === 'down') gameState.player2.y += PLAYER_SPEED;

    // (A-2, A-3) 壁制限
    const p1Top = gameState.player1.y - PLAYER_HEIGHT / 2;
    const p1Bottom = gameState.player1.y + PLAYER_HEIGHT / 2;
    if (p1Top < 0) gameState.player1.y = PLAYER_HEIGHT / 2;
    if (p1Bottom > FIELD_HEIGHT) gameState.player1.y = FIELD_HEIGHT - PLAYER_HEIGHT / 2;
    
    const p2Top = gameState.player2.y - PLAYER_HEIGHT / 2;
    const p2Bottom = gameState.player2.y + PLAYER_HEIGHT / 2;
    if (p2Top < 0) gameState.player2.y = PLAYER_HEIGHT / 2;
    if (p2Bottom > FIELD_HEIGHT) gameState.player2.y = FIELD_HEIGHT - PLAYER_HEIGHT / 2;

    // (A-4) ボールの移動処理
    gameState.ball.x += gameState.ball.vx;
    gameState.ball.y += gameState.ball.vy;

    // (B-1) 上下の壁
    if ((gameState.ball.y - BALL_RADIUS < 0 && gameState.ball.vy < 0) || (gameState.ball.y + BALL_RADIUS > FIELD_HEIGHT && gameState.ball.vy > 0)) {
        gameState.ball.vy = -gameState.ball.vy;
    }

    // (B-2) ゴール
    if (gameState.ball.x + BALL_RADIUS > FIELD_WIDTH) {
        gameState.score.p1++;
        resetBall(roomId, -1);
    } else if (gameState.ball.x - BALL_RADIUS < 0) {
        gameState.score.p2++;
        resetBall(roomId, 1);
    }
    
    // (B-3) P1(左バー)
    if (gameState.ball.vx < 0 && gameState.ball.x - BALL_RADIUS < (10 + PLAYER_WIDTH) && gameState.ball.y > p1Top && gameState.ball.y < p1Bottom) {
        gameState.ball.vx = -gameState.ball.vx;
    }

    // (B-4) P2(右バー)
    if (gameState.ball.vx > 0 && gameState.ball.x + BALL_RADIUS > (FIELD_WIDTH - 30) && gameState.ball.y > p2Top && gameState.ball.y < p2Bottom) {
        gameState.ball.vx = -gameState.ball.vx;
    }
}

// ボールを中央に戻す (ルームID指定)
function resetBall(roomId, direction = 1) {
    if (!rooms[roomId]) return;
    const gameState = rooms[roomId].gameState;
    gameState.ball.x = FIELD_WIDTH / 2;
    gameState.ball.y = FIELD_HEIGHT / 2;
    gameState.ball.vx = BALL_SPEED_X_INIT * direction;
    gameState.ball.vy = BALL_SPEED_Y_INIT * (Math.random() > 0.5 ? 1 : -1);
}

// ★ socket.id からルームを探すヘルパー
function findRoomBySocketId(socketId) {
    for (const roomId in rooms) {
        if (rooms[roomId].players.p1 === socketId || rooms[roomId].players.p2 === socketId) {
            return roomId;
        }
    }
    return null;
}

// --- 4. クライアントからの接続処理 ---
io.on('connection', (socket) => {
    console.log('クライアントが接続しました:', socket.id);

    // ★ 1. 待機中のルームを探す
    let joinedRoomId = null;
    for (const roomId in rooms) {
        // P2がまだいないルームを探す
        if (rooms[roomId].gameState.status === 'waiting') {
            joinedRoomId = roomId;
            break;
        }
    }

    if (joinedRoomId) {
        // ★ 2. 待機中のルームに参加 (P2として)
        const room = rooms[joinedRoomId];
        room.players.p2 = socket.id;
        room.gameState.status = 'playing';

        socket.join(joinedRoomId); // Socket.IOのルーム機能で、このソケットをルームに入れる
        console.log(`[${socket.id}] が プレイヤー2 (p2) としてルーム ${joinedRoomId} に参加`);
        
        // 2人揃ったのでゲーム開始
        // P1 (既Sに待機していた人) に通知
        io.to(room.players.p1).emit('gameStart', { role: 'p1', roomId: joinedRoomId });
        // P2 (今参加した人) に通知
        socket.emit('gameStart', { role: 'p2', roomId: joinedRoomId }); 
        
        resetBall(joinedRoomId); // ボールをサーブ
        startGameLoop(joinedRoomId); // このルームのループを開始

    } else {
        // ★ 3. 待機中のルームがない -> 新しいルームを作成 (P1として)
        const newRoomId = `room_${socket.id}`;
        socket.join(newRoomId); // 新しいルームに自分だけ入る
        
        // rooms オブジェクトに新しいルーム情報を追加
        rooms[newRoomId] = {
            players: { p1: socket.id, p2: null },
            playerMove: { p1: null, p2: null },
            gameState: {
                status: "waiting", // 待機状態
                player1: { y: FIELD_HEIGHT / 2, height: PLAYER_HEIGHT },
                player2: { y: FIELD_HEIGHT / 2, height: PLAYER_HEIGHT },
                ball: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 0, vy: 0 },
                score: { p1: 0, p2: 0 },
                field: { width: FIELD_WIDTH, height: FIELD_HEIGHT }
            },
            intervalId: null // ループはまだ開始しない
        };
        
        console.log(`[${socket.id}] が プレイヤー1 (p1) としてルーム ${newRoomId} を作成`);
        // 待機中であることをクライアントに通知
        socket.emit('waitingForPlayer');
    }


    // (A) 'move' イベント
    socket.on('move', (data) => {
        // このソケットが属するルームIDを探す
        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !rooms[roomId]) return;
        
        const room = rooms[roomId];
        // 自分がP1かP2か判断
        const playerId = (socket.id === room.players.p1) ? 'p1' : 'p2';
        
        // そのルームの移動情報を更新
        room.playerMove[playerId] = data.direction;
    });

    // (B) 'stop' イベント
    socket.on('stop', () => {
        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !rooms[roomId]) return;

        const room = rooms[roomId];
        const playerId = (socket.id === room.players.p1) ? 'p1' : 'p2';

        room.playerMove[playerId] = null;
    });

    // (C) クライアントが切断した時の処理
    socket.on('disconnect', () => {
        console.log('クライアントが切断しました:', socket.id);
        const roomId = findRoomBySocketId(socket.id);
        
        if (roomId && rooms[roomId]) { // ルームに参加していた場合
            const room = rooms[roomId];
            
            // ループを停止
            if (room.intervalId) {
                clearInterval(room.intervalId);
            }
            
            // 生き残ったプレイヤーを探す
            const otherPlayerSocketId = (socket.id === room.players.p1) ? room.players.p2 : room.players.p1;
            
            if (otherPlayerSocketId) {
                // 相手に切断を通知
                io.to(otherPlayerSocketId).emit('opponentDisconnected');
            }

            // ルームを削除
            console.log(`ルーム ${roomId} を削除します`);
            delete rooms[roomId];
        }
    });
});

// --- 5. サーバー起動 ---
const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Socket.IOサーバーが http://localhost:${PORT} で起動しました`);
});
