/**
 * agent.js
 * Node.jsでの実行を想定
 */
const WebSocket = require('ws');

// 接続先
const APP_WS_URL = "ws://localhost:3000";

class Agent {
  constructor() {
    this.socket = null;
    this.agentLocation = null;
    this.selectedShelter = null;
    this.shadowRoute = [];
    this.moveIntervalId = null;
    this.firstRoute = true

    this.connectToApp();
  }

  connectToApp() {
    this.socket = new WebSocket(APP_WS_URL);
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
    console.log("[Agent] Received route");
    if (this.firstRoute){
      this.followRoute();
      this.firstRoute = false;
    }
  }

  followRoute() {
    let i = 0;
    this.moveIntervalId = setInterval(() => {
      if (i >= this.shadowRoute.length) {
        clearInterval(this.moveIntervalId);
        this.moveIntervalId = null;
        console.log("[Agent] Reached end of route.");
        return;
      }
      // 次のポイントへ
      this.agentLocation = {
        lat: this.shadowRoute[i].lat,
        lng: this.shadowRoute[i].lng
      };
      i++;
      // 現在位置をAppへ送信
      this.sendAgentLocation();
    }, 5000);
  }

  onEvacComplete() {
    console.log("[Agent] Evacuation complete. Stopping agent.");
    if (this.moveIntervalId) {
      clearInterval(this.moveIntervalId);
      this.moveIntervalId = null;
    }
    this.socket.close();
  }
}

(function main() {
  const agent = new Agent();
  console.log("[Agent] Agent started.");
})();