# 必要環境
- Node.js

# インストール手順(Ubuntuを想定)
``` bash
# node.jsのインストール
curl -fsSL https://deb.nodesource.com/setup_lts.x
sudo -E bash -
sudo apt install nodejs
# node.jsのインストールの確認
node -v
```

# 実行方法
``` bash
cd somapp
sh execute.sh
```
# 実行後
```bash
pkill -f "node agent"
pkill -f "node vapp"
pkill -f "node backend-server"
```
