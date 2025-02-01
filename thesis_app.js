-----------------------(1:View)-------------------------
<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
</head>
<body>
 <button id="shelter1">shelter1</button>
 <button id="shelter2">shelter2</button>
 <button id="shelter3">shelter3</button>
 <button id="evacComp">Complete Evacuation</button>
 <div id="route">経路情報</div>
 <script src="app.js"></script>
</body>
</html>

class View {
  constructor() {
    this.shelter1 = document.getElementById('shelter1');
    this.shelter2 = document.getElementById('shelter2');
    this.shelter3 = document.getElementById('shelter3');
    this.route = document.getElementById('route');
  }
}
--------------------------------------------------------
-----------------------(2:Model)------------------------
class Model {
  constructor() {
    // Controllerへ通知するコールバック
    this.onSendRouteToAgentCallback = null;
  }
  generateRoute() {
    if (typeof this.onSendRouteToAgentCallback === 'function') {
      // Result Handlerを呼び出し
      this.onResultHandlerCallback(this.route);
    }
  }
}
--------------------------------------------------------
class Controller {
  constructor(model) {
    this.model = model;
    this.clickShelter1 = "clickShelter1";
    this.clickShelter2 = "clickShelter2";
    this.clickShelter3 = "clickShelter3";
    this.clickEvacComp = "clickEvacComp";
    // Modelからのコールバック登録
    model.onResultHandlerCallback = (newRoute) => this.resultHandler(newRoute);
------------------(3:Event Listener)--------------------
    this.view.shelter1.addEventListener('click', (clickShelter1) => this.eventHandler(clickShelter1));
    this.view.shelter2.addEventListener('click', (clickShelter2) => this.eventHandler(clickShelter2));
    this.view.shelter3.addEventListener('click', (clickShelter3) => this.eventHandler(clickShelter3));
    this.view.evacComp.addEventListener('click', (clickEvacComp) => this.eventHandler(clickEvacComp));
--------------------------------------------------------
  }
------------------(4:Event Handler)---------------------
  eventHandler(eventType) {
    switch (eventType) {
      // ユーザーが避難所を選択
      case "clickShelter1" || "clickShelter2" || "clickShelter3":
        this.model.generateRoute();
        break;
      // ユーザーが避難完了
      case "clickEvacComp":
        break;
      default:
    }
  }
--------------------------------------------------------
------------------(5:Result Handler)--------------------
  resultHandler(route) {
    this.viewUpdate(route);
  }
--------------------------------------------------------
------------------(6:View Update)-----------------------
  viewUpdate(route) {
    this.view.route.innerText = `経路: ${route}`;
  }
--------------------------------------------------------
}