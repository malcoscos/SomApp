/**
 * backend.js
 * バックエンドサーバ(WebSocketサーバ)
 *
 * 起動: node backend.js
 */
const WebSocket = require('ws');

// ポート番号を 3000 に固定
const BACKEND_PORT = 3000;

// WebSocketサーバを起動
const wss = new WebSocket.Server({ port: BACKEND_PORT }, () => {
  console.log(`[Backend] WebSocket server running on port ${BACKEND_PORT}`);
});

// 接続処理
wss.on('connection', (ws) => {
  console.log("[Backend] Client (app.js) connected.");

  // クライアント(app.js)からメッセージを受け取る
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error("[Backend] JSON parse error:", message);
      return;
    }

    // locationInfo を受信した場合、地図＋避難所情報をまとめて返す
    if (data.type === 'locationInfo') {
      const location = data.payload;
      console.log("[Backend] locationInfo received:", location);

      // ダミーの地図情報
      const mapData = {
        area: `Map data around (${location.lat}, ${location.lng}) within 3km`
      };

      // ダミーの避難所情報
      const randomOffset = () => 0.001 + Math.random() * 0.002; // 0.001~0.003
      const rndSign = () => (Math.random() < 0.5) ? -1 : 1;
      const sheltersData = [
        {
          id: 1,
          name: "Shelter A",
          lat: location.lat + randomOffset() * rndSign(),
          lng: location.lng + randomOffset() * rndSign()
        },
        {
          id: 2,
          name: "Shelter B",
          lat: location.lat + randomOffset() * rndSign(),
          lng: location.lng + randomOffset() * rndSign()
        },
        {
          id: 3,
          name: "Shelter C",
          lat: location.lat + randomOffset() * rndSign(),
          lng: location.lng + randomOffset() * rndSign()
        }
      ];

      // mapData と sheltersData をまとめて返す
      const response = {
        type: 'combinedData',
        payload: {
          map: mapData,
          shelters: sheltersData
        }
      };
      ws.send(JSON.stringify(response));
    }
  });

  ws.on('close', () => {
    console.log("[Backend] Client disconnected.");
  });
});