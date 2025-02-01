const WebSocket = require('ws');

// 接続先
const agentPort = process.argv[2];
const vappWsUrl = `ws://localhost:${agentPort}`;

class Agent {
  constructor() {
    this.socket = null;
    this.agentLocation = null;
    this.selectedShelter = null;
    this.shadowRoute = [];
    this.moveIntervalId = null;
    this.firstRoute = true;
    this.stepCount = 0;
    this.signalStatus = true;

    this.connectToApp();
  }

  connectToApp() {
    this.socket = new WebSocket(vappWsUrl);
    this.socket.on("open", () => {
      console.log("[Agent] Connected to App.");
      // 接続直後に位置情報を生成して送信
      this.generateLocationAndSend();
    });
    this.socket.on("message", (msg) => this.onMessageReceived(msg));
    this.socket.on("close", () => {
      console.log("[Agent] Disconnected from App.");
      if (this.moveIntervalId) {
        clearInterval(this.moveIntervalId);
      }

    });
  }

  onMessageReceived(rawMsg) {
    let data;
    try {
      data = JSON.parse(rawMsg);
    } catch (e) {
      console.error("[Agent] JSON parse error:", rawMsg);
      return;
    }

    switch (data.type) {
      case "sheltersData":
        this.onSheltersData(data.payload);
        break;
      case "routeData":
        this.onRouteData(data.payload);
        break;
      case "evacComplete":
        this.onEvacComplete();
        break;
      default:
        console.log("[Agent] Unknown message type:", data.type);
    }
  }

  generateLocationAndSend() {
    const lat = 35.68 + (Math.random() - 0.5) * 0.01;
    const lng = 139.767 + (Math.random() - 0.5) * 0.01;
    this.agentLocation = { lat, lng };
    this.sendAgentLocation();
  }

  sendAgentLocation() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const msg = {
      type: "agentLocation",
      payload: this.agentLocation
    };
    this.socket.send(JSON.stringify(msg));
    console.log("[Agent] Sent location");
  }

  onSheltersData(shelters) {
    if (!shelters || shelters.length === 0) {
        console.log("[Agent] There are no shelter")
        return
    };
    const idx = Math.floor(Math.random() * shelters.length);
    const chosen = shelters[idx];
    this.selectedShelter = { lat: chosen.lat, lng: chosen.lng };
    console.log("[Agent] Chose shelter:", chosen.name || `Shelter#${chosen.id}`);
    // 選択結果をvAppへ
    this.sendSelectedShelter();
  }

  sendSelectedShelter() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const msg = {
      type: "selectedShelter",
      payload: this.selectedShelter
    };
    this.socket.send(JSON.stringify(msg));
    console.log("[Agent] Sent selected shelter:", this.selectedShelter);
  }

  onRouteData(route) {
    this.shadowRoute = route;
    this.stepCount = 0
    console.log(`[Agent] Receive Route steps:${this.shadowRoute.length}`);
    if (this.firstRoute){
      this.followRoute();
      this.firstRoute = false;
      this.generateSignalStatusAndSend();
    }
  }

  followRoute() {
    this.moveIntervalId = setInterval(() => {
      if (this.stepCount >= this.shadowRoute.length) {
        clearInterval(this.moveIntervalId);
        this.moveIntervalId = null;
        this.sendAgentLocation();
        console.log("[Agent] Reached end of route.");
        return;
      }

      if (this.signalStatus) {
        // 次のポイントへ
        this.agentLocation = {
          lat: this.shadowRoute[this.stepCount].lat,
          lng: this.shadowRoute[this.stepCount].lng
        };
        this.stepCount++;
      }

      // 現在位置をAppへ送信
      this.sendAgentLocation();
    }, 5000);
  }

  onEvacComplete() {
    console.log("[Agent] Evacuation complete. Stopping agent.");
    if (this.moveIntervalId) {
      clearInterval(this.moveIntervalId);
      clearInterval(this.generateSignalIntervalId)
      this.moveIntervalId = null;
      this.generateSignalIntervalId
    }
    this.socket.close();
  }

  generateSignalStatusAndSend() {
    this.generateSignalIntervalId = setInterval(() => {
      if (Math.random() <= 1/5) {
        this.signalStatus = false;
      } else {
        this.signalStatus = true;
      }
      this.sendSignalStatus();
    }, 7000)
  }

  sendSignalStatus() {
    const msg = {
      type: "signalStatus",
      payload: this.signalStatus
    };
    this.socket.send(JSON.stringify(msg));
    console.log("[Agent] Sent signal status");
  }
}

(function main() {
  const agent = new Agent();
  console.log("[Agent] Agent started.");
})();