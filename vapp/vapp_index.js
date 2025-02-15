const Model = require('./model');
const Controller = require('./controller');

(function main() {
  // コマンドライン引数からエージェント用のポート番号を取得
  const agentPort = process.argv[2];

  const model = new Model();
  const controller = new Controller(model, agentPort);
  console.log("[vApp] vApp server started.");
})();