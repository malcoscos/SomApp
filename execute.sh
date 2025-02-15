#!/bin/bash

# 引数チェック
if [ -z "$1" ]; then
  echo "起動台数を指定してください。"
  echo "例: sh execute.sh 100"
  exit 1
fi

# 起動する台数
COUNT=$1

# バックエンドサーバの起動 (バックグラウンドで動かす)
node backend-server &

# vapp/agent を指定台数だけ起動 (49152 から順にポートを割り当て)
for (( i=0; i<COUNT; i++ )); do
  port=$((49152 + i))
  # vapp -> agent の順に起動、どちらもバックグラウンド
  node vapp "$port" &
  node agent "$port" &
done

# 必要に応じて、すべてのバックグラウンドジョブが終了するのを待つ
# wait