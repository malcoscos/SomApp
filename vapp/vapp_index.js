const WebSocket = require('ws');

class Model {
  constructor() {
    this.map = null;                  // 地図情報
    this.shelters = null;             // 避難所情報
    this.shadowAgentLocation = null;  // Agent(実際はロボットなど)の現在地
    this.shelterLocation = null;      // 選択された避難所
    this.route = null;                // 経路
    this.evacStatus = true;           // 避難継続中かどうか
    this.shadowSignalStatus = true;

    // 経路自動生成のためのインターバル (10秒)
    this.firstMove = false;
    this.routeGenerationInterval = 10 * 1000;
    this.routeTimerId = null;

    // Controllerへ通知するコールバック
    this.onResultHandlerCallback = null;
  }

  /**
   * バックエンドサーバから map と shelters をまとめて取得
   */
  async requestDataFromBackend(location) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:3000');

      ws.on('open', () => {
        // locationInfo を送信
        const msg = {
          type: 'locationInfo',
          payload: location
        };
        ws.send(JSON.stringify(msg));
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'combinedData') {
            // map と shelters が両方入ったデータを受け取る
            resolve(data.payload);
          }
        } catch (e) {
          reject(e);
        } finally {
          // 今回は一度情報を受け取れれば十分なので、クローズする
          ws.close();
        }
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Agent位置情報の更新
   */
  async updateAgentLocation(location) {
    this.shadowAgentLocation = location;

    // 初回ならバックエンドサーバから map / shelters を取得
    if (!this.map && !this.shelters) {
      try {
        const combinedData = await this.requestDataFromBackend(location);
        this.map = combinedData.map;
        this.shelters = combinedData.shelters;
        const msg = {
          type: "sendSheltersToAgent"
        };
        if (typeof this.onResultHandlerCallback === 'function') {
          this.onResultHandlerCallback(JSON.stringify(msg)); 
        }
      } catch (error) {
        console.error("[Model] Failed to fetch data from backend:", error);
      }
    }

    this.checkEvacuationComplete();
  }

  updateSignalStatus(signalStatus) {
    this.shadowSignalStatus = signalStatus;
  }

  /**
   * 選択された避難所を更新
   */
  setShelterLocation(location) {
    this.shelterLocation = location;
  }

  /**
   * 経路を生成する
   */
  generateRoute(start, end) {
    if (!start || !end) return [];

    // 2点間の距離計算
    const distance = this.calcDistance(start, end); // メートル

    // 適当なステップ数（例：1mごとに1ステップなど）
    let steps = Math.floor(distance / 10);
    if (steps < 2) {
      // ステップが2未満なら、すぐに避難完了扱い
      this.checkEvacuationComplete();
    }

    console.log(`[Model] Distance=${distance.toFixed(1)}m, steps=${steps}`);

    // 直線を steps 個に分割した座標配列を作成
    const dLat = (end.lat - start.lat) / steps;
    const dLng = (end.lng - start.lng) / steps;
    const routeArr = [];
    for (let i = 1; i <= steps; i++) {
      routeArr.push({
        lat: start.lat + dLat * i,
        lng: start.lng + dLng * i
      });
    }
    this.route = routeArr;

    const msg = {
      type: "sendRouteToAgent",
      payload: this.route
    };
    // 経路の通知用コールバック
    if (typeof this.onResultHandlerCallback === 'function') {
      this.onResultHandlerCallback(JSON.stringify(msg));
    }
  }

  /**
   * 避難完了判定
   * 今回はステップが0のタイミングで完了と見なす実装
   */
  checkEvacuationComplete() {
    if (!this.evacStatus || !this.route || !this.shadowAgentLocation || !this.shelterLocation) {
      // 既に完了 or 情報不十分なら何もしない
      return;
    }

    // ルートの要素数が0 = ステップが0
    if (this.route.length === 0) {
      this.evacStatus = false;
      const msg = {
        type: "sendEvacComplete"
      };
      if (typeof this.onResultHandlerCallback === 'function') {
        this.onResultHandlerCallback(JSON.stringify(msg));
      }
      // 経路の生成を中断
      clearInterval(this.routeTimerId);
      console.log("[vApp] Evacation Completed");
    }
  }

  /**
   * 2点間の距離計算(メートル)
   */
  calcDistance(loc1, loc2) {
    const R = 6371000; // 地球半径[m]
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(loc2.lat - loc1.lat);
    const dLng = toRad(loc2.lng - loc1.lng);
    const lat1 = toRad(loc1.lat);
    const lat2 = toRad(loc2.lat);

    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /* ==========================
   * 定期的な経路生成(Timer)
   * ========================== */
  startAutoRouteGeneration() {
    if (this.routeTimerId) {
      clearInterval(this.routeTimerId);
    }
    this.routeTimerId = setInterval(() => {
      // 通信状況が悪い場合は経路を生成しない（本来は経路サーバから情報を取得不可能になる）
      if (this.shadowSignalStatus) {
        this.onIntervalGenerateRoute();
      } else {
        console.log("[vApp] Signal Status is bad");
      }
    }, this.routeGenerationInterval);
  }

  onIntervalGenerateRoute() {
    if (!this.shadowAgentLocation || !this.shelterLocation) return;
    if (!this.evacStatus) return; // 既に完了ならスキップ

    // 新しい経路を生成
    this.route = this.generateRoute(this.shadowAgentLocation, this.shelterLocation);
  }
}

/* ========================
 * Controller
 * ======================== */
class Controller {
  constructor(model, agentPort) {
    this.model = model;

    // Modelからのコールバック登録
    model.onResultHandlerCallback = (result) => this.resultHandler(result);
    // WebSocketサーバを agentPort で立ち上げ (エージェント用)
    this.wss = new WebSocket.Server({ port: agentPort }, () => {
      console.log(`[vApp] WebSocket server running on port ${agentPort}`);
    });

    this.agentSocket = null;

    // 接続・メッセージ受信・切断イベント
    this.wss.on("connection", (ws) => {
      console.log("[vApp] Agent connected.");
      this.agentSocket = ws;

      ws.on("message", (msg) => {
        this.eventHandler(msg);
      });

      ws.on("close", () => {
        console.log("[vApp] Agent disconnected.");
        this.agentSocket = null;
      });
    });
  }

  async eventHandler(event) {
    let data;
    try {
      data = JSON.parse(event);
    } catch (e) {
      console.error("[vApp] JSON parse error:", event);
      return;
    }

    switch (data.type) {
      
      case "selectedShelter":
        // 選択された避難所
        this.model.setShelterLocation(data.payload);
        console.log("[vApp] Shelter selected:", data.payload);

        // 初回の経路生成
        this.model.generateRoute(
          this.model.shadowAgentLocation,
          this.model.shelterLocation
        );
        break;
      case "evacComp":

        break;
      
      case "agentLocation":
        // Agentの位置をModelに更新
        this.model.updateAgentLocation(data.payload);

        // 初回の移動ならタイマーを起動
        if (!this.model.firstMove) {
          this.model.startAutoRouteGeneration();
          this.model.firstMove = true;
        }
        break;
      case "signalStatus":
        // 通信状況を受信
        this.model.updateSignalStatus(data.payload);
        break;

      default:
        console.log("[vApp] Unknown message type:", data.type);
    }
  }

  resultHandler(result) {
    let data;
    try {
      data = JSON.parse(result);
    } catch (e) {
      console.error("[vApp] JSON parse error:", result);
      return;
    }
    switch (data.type) {
      case "sendSheltersToAgent":
        this.sendSheltersToAgent();
        break;
      case "sendRouteToAgent":
        this.sendRouteToAgent(data.payload);
        break;
      case "sendEvacComplete":
        this.sendEvacComplete();
        break;
      default:
    } 
  }

  sendSheltersToAgent() {
    if (!this.agentSocket || this.agentSocket.readyState !== WebSocket.OPEN) return;
    const msg = {
      type: "sheltersData",
      payload: this.model.shelters
    };
    this.agentSocket.send(JSON.stringify(msg));
    console.log("[vApp] sendSheltersToAgent");
  }

  sendRouteToAgent(route) {
    if (!this.agentSocket || this.agentSocket.readyState !== WebSocket.OPEN) return;
    const msg = {
      type: "routeData",
      payload: route
    };
    this.agentSocket.send(JSON.stringify(msg));
    console.log("[vApp] sendRouteToAgent");
  }

  sendEvacComplete() {
    if (!this.agentSocket || this.agentSocket.readyState !== WebSocket.OPEN) return;
    const msg = {
      type: "evacComplete",
      payload: "避難が完了しました。"
    };
    this.agentSocket.send(JSON.stringify(msg));
    console.log("[vApp] evacComplete => Agent");
  }
}

/* ========================
 * メイン実行
 * ======================== */
(function main() {
  // コマンドライン引数から、エージェント用のポート番号を取得
  const agentPort = process.argv[2];

  const model = new Model();
  const controller = new Controller(model, agentPort);
  console.log("[vApp] vApp server started.");
})();