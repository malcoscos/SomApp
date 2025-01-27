/**
 * app.js
 * Node.jsでの実行を想定
 */
const WebSocket = require('ws');

/* ========================
 * Model
 * ======================== */
class Model {
  constructor() {
    this.map = null;             
    this.shelters = null;        
    this.shadowAgentLocation = null;  
    this.shelterLocation = null;      
    this.route = null;
    this.evacStatus = true; 

    // 定期的に経路生成するインターバル(10秒)
    this.firstMove = false
    this.routeGenerationInterval = 10 * 1000;
    this.routeTimerId = null;

    // Controllerへ通知するコールバック
    this.onSendRouteToAgentCallback = null;
    this.onEvacCompleteCallback = null;
  }

  /**
   * バックエンドサーバに地図情報を問い合わせる（ダミー実装）
   */
  async fetchMapData(location) {
    return {
      area: `Map data around (${location.lat}, ${location.lng}) within 3km`
    };
  }

  /**
   * バックエンドサーバに避難所情報を問い合わせる（ダミー実装）
   */
  async fetchShelterData(location) {
    // 変更後(約100～300m離れる)
    const randomOffset = () => 0.001 + Math.random() * 0.002; // 0.001~0.003
    const rndSign = () => (Math.random() < 0.5) ? -1 : 1;

    return [
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
  }

  /**
   * Agent位置情報の更新
   */
  async updateAgentLocation(location) {
    this.shadowAgentLocation = location;

    // 初回なら map / shelters を取得
    if (!this.map && !this.shelters) {
      this.map = await this.fetchMapData(location);
      this.shelters = await this.fetchShelterData(location);
    }

    this.checkEvacuationComplete();
  }

  /**
   * 選択された避難所を更新
   */
  setShelterLocation(location) {
    this.shelterLocation = location;
  }

  /**
   * 経路を生成する
   * - 距離に応じてステップ数を変える
   */
  generateRoute(start, end) {
    if (!start || !end) return [];

    // Agent位置と避難所の距離を計算
    const distance = this.calcDistance(start, end); // メートル

    // 距離に応じてステップ数を動的に決定
    // 例: 200m ごとに1ステップ増やし、最低2ステップは確保
    let steps = Math.floor(distance / 10);
    if (steps < 2) {
      steps = 2;
    }

    console.log(`[Model] Distance=${distance.toFixed(1)}m, steps=${steps}`);

    // 直線を「steps」個に分割
    const dLat = (end.lat - start.lat) / steps;
    const dLng = (end.lng - start.lng) / steps;
    const routeArr = [];
    for (let i = 1; i <= steps; i++) {
      routeArr.push({
        lat: start.lat + dLat * i,
        lng: start.lng + dLng * i
      });
    }
    this.route = routeArr

    // 経路の通知用コールバック関数の呼び出し
    if (typeof this.onSendRouteToAgentCallback === 'function') {
      this.onSendRouteToAgentCallback(this.route);
    }
  }

  /**
   * 避難完了判定(距離<=30m)
   */
  checkEvacuationComplete() {
    if (!this.shadowAgentLocation || !this.shelterLocation) return;
    // ルートが存在し、かつステップ数(要素数)が0なら到着とみなす
    if (!this.evacStatus) return; // 既に完了なら何もしない
    if (!this.route) return;      // ルート未生成ならスキップ

    // ルートの要素数が0=ステップが0
    if (this.route.length === 0) {
      this.evacStatus = false;
      if (typeof this.onEvacCompleteCallback === 'function') {
        this.onEvacCompleteCallback();
      }
      // 経路の生成を中止
      clearInterval(this.routeTimerId);
      console.log("[vApp] Evacation Completed")
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
      this.onIntervalGenerateRoute();
    }, this.routeGenerationInterval);
  }

  /**
   * 定期的に呼び出される処理
   */
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
  constructor(model) {
    this.model = model;

    // Modelからのコールバック登録
    model.onSendRouteToAgentCallback = (newRoute) => this.sendRouteToAgent(newRoute);
    model.onEvacCompleteCallback = () => this.sendEvacComplete();

    // WebSocketサーバを立ち上げ
    this.wss = new WebSocket.Server({ port: 3000 }, () => {
      console.log("[vApp] WebSocket server running on port 3000");
    });

    this.agentSocket = null;

    // 接続・メッセージ受信・切断イベント
    this.wss.on("connection", (ws) => {
      console.log("[vApp] Agent connected.");
      this.agentSocket = ws;

      ws.on("message", (msg) => {
        this.onMessageReceived(msg);
      });

      ws.on("close", () => {
        console.log("[vApp] Agent disconnected.");
        this.agentSocket = null;
      });
    });
  }

  async onMessageReceived(rawMsg) {
    let data;
    try {
      data = JSON.parse(rawMsg);
    } catch (e) {
      console.error("[vApp] JSON parse error:", rawMsg);
      return;
    }

    switch (data.type) {
      case "agentLocation":
        // Agentの位置をModelに更新
        await this.model.updateAgentLocation(data.payload);
        // 初回ならsheltersを送る
        if (this.model.shelters && !this.model.shelterLocation) {
          this.sendSheltersToAgent();
          break;
        }
        // 初回の移動ならタイマーを動作
        if (!this.model.firstMove) {
          // アプリ起動時にタイマーで定期生成開始
          this.model.startAutoRouteGeneration();
          this.model.firstMove = true;
        }
        break;

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

      default:
        console.log("[vApp] Unknown message type:", data.type);
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
  const model = new Model();
  const controller = new Controller(model);
  console.log("[vApp] vApp server started.");
})();