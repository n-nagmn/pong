# Node.js WebSocket Pong

Node.js (Socket.IO) と Nginx を活用した、リアルタイム・マルチプレイヤー対戦型Pongゲーム。

## Requirements

- **Runtime**: Node.js (v18+)
- **Web Server**: Nginx
- **OS**: Ubuntu / Debian Linux

## Installation

### 1. Setup Application
リポジトリをクローンし、依存パッケージをインストールします。

```bash
# クローンとセットアップ
git clone [https://github.com/YOUR_USERNAME/pong-server.git](https://github.com/YOUR_USERNAME/pong-server.git) ~/pong-server
cd ~/pong-server
npm install
````

### 2\. Setup Client

クライアント用HTMLをWeb公開ディレクトリに配置します。

```bash
sudo mkdir -p /var/www/html/pong
sudo cp index.html /var/www/html/pong/
```

## Configuration & Deployment

リポジトリ内の `conf/` ディレクトリにある設定ファイルを使用します。

### Systemd Service (Auto Start)

サーバー起動時にNode.jsを自動起動させる設定です。

```bash
# サービスファイルをシステムにコピー
sudo cp conf/pong.service /etc/systemd/system/

# サービスの有効化と起動
sudo systemctl daemon-reload
sudo systemctl enable pong.service
sudo systemctl start pong.service
```

### Nginx (Reverse Proxy)

WebSocket通信をNode.jsに転送するリバースプロキシ設定です。

```bash
# 設定ファイルをNginxにコピー
sudo cp conf/nginx.conf /etc/nginx/sites-available/pong

# 設定の有効化（シンボリックリンク作成）
sudo ln -s /etc/nginx/sites-available/pong /etc/nginx/sites-enabled/

# Nginxの再読み込み
sudo nginx -t
sudo systemctl reload nginx
```

## Usage

ブラウザで `http://your-server-ip/pong/` にアクセスしてください。
2つのタブまたはデバイスで接続すると、自動的にゲームが開始されます。

## License

MIT License