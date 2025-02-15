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
          // 一度情報を受け取れば十分なので、クローズする
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

    // 適当なステップ数（例：1mごとに1ステップ）
    let steps = Math.floor(distance / 10);
    if (steps === 0) {
      // ステップが0の場合に避難完了
      this.route = [];
      console.log(`[Model] Distance=${distance.toFixed(1)}m, steps=${steps}`);
      this.checkEvacuationComplete();
      return;
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
   * 今回はステップが0の場合に完了と見なす実装
   */
  checkEvacuationComplete() {
    if (!this.evacStatus || !this.route || !this.shadowAgentLocation || !this.shelterLocation) {
      // 既に完了 or 情報不十分なら何もしない
      return;
    }

    // ルートの要素数が0 = ステップが0
    if (this.route.length === 0) {
      console.log("[vApp] Evacation Completed");
      this.evacStatus = false;
      const msg = {
        type: "sendEvacComplete"
      };
      if (typeof this.onResultHandlerCallback === 'function') {
        this.onResultHandlerCallback(JSON.stringify(msg));
        process.exit(0);
      }
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

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
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
      // 通信状況が悪い場合は経路を生成しない
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
    this.generateRoute(this.shadowAgentLocation, this.shelterLocation);
  }
}

module.exports = Model;