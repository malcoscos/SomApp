const WebSocket = require('ws');

class Controller {
  constructor(model, agentPort) {
    this.model = model;

    // Modelからのコールバックを登録
    model.onResultHandlerCallback = (result) => this.resultHandler(result);

    // エージェント用WebSocketサーバをagentPortで起動
    this.wss = new WebSocket.Server({ port: agentPort }, () => {
      console.log(`[vApp] WebSocket server running on port ${agentPort}`);
    });

    this.agentSocket = null;

    // 接続・メッセージ受信・切断イベントの設定
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
        // 選択された避難所を設定
        this.model.setShelterLocation(data.payload);
        console.log("[vApp] Shelter selected:", data.payload);

        // 初回の経路生成
        this.model.generateRoute(
          this.model.shadowAgentLocation,
          this.model.shelterLocation
        );
        break;
      case "evacComp":
        // 必要に応じて処理を追加
        break;
      case "agentLocation":
        // Agentの位置を更新
        this.model.updateAgentLocation(data.payload);

        // 初回の移動ならタイマーを起動
        if (!this.model.firstMove) {
          this.model.startAutoRouteGeneration();
          this.model.firstMove = true;
        }
        break;
      case "signalStatus":
        // 通信状況の更新
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
        console.log("[vApp] Unknown result type:", data.type);
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

module.exports = Controller;