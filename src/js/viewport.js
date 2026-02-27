// 視錐台のパラメータ設定だけ別ファイル化する
const viewport = {
  setParam
};

function setParam(canvas) {
  // 外部ファイル化したことでcanvasRectの値はここではわからないので再度取得
  const canvasRect = canvas.getBoundingClientRect();

  viewport.canvasWidth = canvasRect.width;
  viewport.canvasHeight = canvasRect.height;
  viewport.near = 1500;
  viewport.far = 4000;
  viewport.aspect = viewport.canvasWidth / viewport.canvasHeight;
  viewport.cameraZ = 2000;
  // let fov_deg, fov_rad;
  viewport.fov_rad = 2 * Math.atan((viewport.canvasHeight / 2) / viewport.cameraZ);
  viewport.fov_deg = viewport.fov_rad * (180 / Math.PI);
  // ついでに追加
  viewport.devicePixelRatio = window.devicePixelRatio;
  return viewport;
}

export default viewport;

