import { Vector3, Quaternion } from 'three';

const utils = {
  pointTo,
  lerp,
};

// pointTo()：クォータニオンを使ったメッシュの回転
// 第一引数：向きを変えたいmeshを指定
// 第二引数：元のmeshの向き（今はz軸方向）
// 第三引数：変更後のmeshの向き（今は円柱meshの法線の向き）
function pointTo(_mesh, originalDir, targetDir) {
  // 回転軸の計算
  const _originalDir = new Vector3(originalDir.x, originalDir.y, originalDir.z).normalize();
  const _targetDir = new Vector3(targetDir.x, targetDir.y, targetDir.z).normalize();
  const dir = new Vector3().crossVectors(_originalDir, _targetDir).normalize();

  // 回転角の計算
  const dot = _originalDir.dot(_targetDir);
  const rad = Math.acos(dot);

  // クォータニオンの作成
  const q = new Quaternion();
  q.setFromAxisAngle(dir, rad);

  // メッシュを回転
  _mesh.rotation.setFromQuaternion(q);
}

// lerp関数
// 第四引数は上書きで変えられるようにした
function lerp(start, end, rate, limit = 0.001) {
  // console.log(`${start}\t\t${end}`);
  let current = (1.0 - rate) * start + rate * end;
  // 差分が小さくなったら終点の値を設定
  if (Math.abs(end - current) < limit) {
    current = end;
  }
  return current;
}

export default utils;

