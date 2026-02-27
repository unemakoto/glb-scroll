import './style.css';
import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  AnimationMixer,
  PCFSoftShadowMap,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import viewport from './viewport';
import loader from './loader';

// ScrollTrigger を有効化（スクロール量に応じたアニメーション制御用）
gsap.registerPlugin(ScrollTrigger);

// デバッグモードの設定（開発時のみ true）
const isDebug = import.meta.env.DEV;
window.debug = isDebug;

// three.js 関連のオブジェクトを束ねる入れ物
const world = {
  renderer: null,
  scene: null,
  camera: null,
};

// 各 GLB モデルの情報を保持する配列
const objects = [];

const canvas = document.querySelector('#canvas');
let canvasRect = canvas.getBoundingClientRect();

init();

// 初期化処理
async function init() {
  // アセット（画像・動画など）の事前ロード（必要なければ何もしない）
  await loader.loadAllAssets();

  setupRenderer();
  setupSceneAndCamera();
  setupLights();
  setupStickySections();

  await loadGlbModels();

  if (isDebug) {
    setupDebugUi();
    setupStats();
  }

  bindResizeEvents();
  render();
}

// レンダラーの設定
function setupRenderer() {
  world.renderer = new WebGLRenderer({
    canvas,
    antialias: true,
  });
  world.renderer.setSize(canvasRect.width, canvasRect.height, false);
  world.renderer.setPixelRatio(window.devicePixelRatio);
  world.renderer.setClearColor(0x000000, 0);
  // ─── シャドウマップを有効化 ───
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = PCFSoftShadowMap;
}

// シーンとカメラの作成
function setupSceneAndCamera() {
  world.scene = new Scene();

  // viewport モジュールから視錐台パラメータを取得
  const vp = viewport.setParam(canvas);

  world.camera = new PerspectiveCamera(vp.fov_deg, vp.aspect, vp.near, vp.far);
  world.camera.position.z = vp.cameraZ;
}

// 環境光と方向性ライトの追加
function setupLights() {
  // AmbientLight をやや弱めに
  const ambient = new AmbientLight(0xffffff, 0.2);
  world.scene.add(ambient);

  // 直接光を少し強めにしてコントラストを強調
  const directional = new DirectionalLight(0xffffff, 1.2);
  directional.position.set(0, 300, 300);
  directional.castShadow = true;
  directional.shadow.mapSize.width = 1024;
  directional.shadow.mapSize.height = 1024;
  world.scene.add(directional);
}

// GSAP の ScrollTrigger pin 機能で .sticky-wrap 要素をピン留め
function setupStickySections() {
  const stickyWraps = document.querySelectorAll('.sticky-wrap');

  stickyWraps.forEach((wrap) => {
    ScrollTrigger.create({
      trigger: wrap,
      pin: true,
      start: 'top center',
      end: 'bottom top',
      scrub: false,
    });
  });
}

// [data-glb] 属性を持つ各 DOM 要素から GLB モデルを読み込み
async function loadGlbModels() {
  const elements = document.querySelectorAll('[data-glb]');
  const loader = new GLTFLoader();

  const promises = Array.from(elements).map(
    (el) =>
      new Promise((resolve, reject) => {
        // HTML 側属性より GLB ファイルのパス、拡大率、Y 軸オフセットを取得
        const modelPath = el.getAttribute('data-glb');
        const scaleFactor = Number(el.getAttribute('data-scale')) || 1;
        const offsetY = Number(el.getAttribute('data-offset')) || 0;

        if (!modelPath) {
          resolve();
          return;
        }

        loader.load(
          modelPath,
          (gltf) => {
            // glTF の子要素が 1 つならそのオブジェクト、複数ならシーン全体を利用
            const model =
              gltf.scene.children.length === 1 ? gltf.scene.children[0] : gltf.scene;

            if (!model) {
              // eslint-disable-next-line no-console
              console.error('GLB モデルが見つかりません:', modelPath);
              resolve();
              return;
            }

            // モデルのスケールやシャドウ設定
            model.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });

            model.scale.set(scaleFactor, scaleFactor, scaleFactor);

            // DOM 上の位置を 3D ワールド座標に変換し、Y 軸オフセットを適用
            const rect = el.getBoundingClientRect();
            const { x, y } = getWorldPosition(rect, canvasRect);
            model.position.set(x, y + offsetY, 0);

            world.scene.add(model);

            // GLB にアニメーションが存在する場合、AnimationMixer と ScrollTrigger でスクラブ操作を実装
            let mixer = null;
            if (gltf.animations && gltf.animations.length > 0) {
              mixer = new AnimationMixer(model);
              const clip = gltf.animations[0];
              const action = mixer.clipAction(clip);
              const duration = clip.duration;

              action.play();
              action.paused = true;
              action.time = 0;

              const triggerEl =
                el.closest('.sticky-wrap') ||
                el.closest('section') ||
                document.body;

              const scrubState = { time: 0 };

              gsap.to(scrubState, {
                time: duration,
                ease: 'none',
                scrollTrigger: {
                  trigger: triggerEl,
                  start: 'top 80%',
                  end: 'bottom 20%',
                  scrub: true,
                },
                onUpdate: () => {
                  action.time = scrubState.time;
                },
              });
            }

            objects.push({
              mesh: model,
              element: el,
              rect,
              mixer,
            });

            resolve();
          },
          undefined,
          (error) => {
            // eslint-disable-next-line no-console
            console.error('GLB 読み込みエラー:', modelPath, error);
            resolve();
          },
        );
      }),
  );

  await Promise.all(promises);
}

// DOM の位置情報を 3D ワールド座標に変換する関数
function getWorldPosition(domRect, canvasRectParam) {
  const x = domRect.left + domRect.width / 2 - canvasRectParam.width / 2;
  const y = -(domRect.top + domRect.height / 2) + canvasRectParam.height / 2;
  return { x, y };
}

// 各モデルの位置更新（リサイズやスクロールに伴う）
function updateMeshPosition(obj) {
  const rect = obj.element.getBoundingClientRect();
  const { x, y } = getWorldPosition(rect, canvasRect);
  obj.mesh.position.x = x;
  obj.mesh.position.y = y;
  obj.rect = rect;
}

// リサイズイベントの設定
function bindResizeEvents() {
  let timerId = null;

  window.addEventListener('resize', () => {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      canvasRect = canvas.getBoundingClientRect();
      world.renderer.setSize(canvasRect.width, canvasRect.height, false);

      // viewport を再計算してカメラパラメータを更新
      const vp = viewport.setParam(canvas);
      world.camera.fov = vp.fov_deg;
      world.camera.near = vp.near;
      world.camera.far = vp.far;
      world.camera.aspect = vp.aspect;
      world.camera.updateProjectionMatrix();

      objects.forEach((obj) => {
        updateMeshPosition(obj);
      });
    }, 300);
  });
}

// stats.js のインスタンス（デバッグ表示用）
let statsInstance = null;

// lil-gui の簡易デバッグ UI
function setupDebugUi() {
  import('lil-gui')
    .then((module) => {
      const GUI = module.default || module.GUI;
      const gui = new GUI();

      const params = {
        showDebugInfo: false,
      };

      gui.add(params, 'showDebugInfo').name('Debug toggle');
    })
    .catch(() => {
      // eslint-disable-next-line no-console
      console.warn('lil-gui の読み込みに失敗しました。');
    });
}

// stats.js の設定
function setupStats() {
  import('stats.js')
    .then((module) => {
      const Stats = module.default || module;
      statsInstance = new Stats();
      statsInstance.showPanel(0);
      document.body.appendChild(statsInstance.dom);
    })
    .catch(() => {
      // eslint-disable-next-line no-console
      console.warn('stats.js の読み込みに失敗しました。');
    });
}

// メインのレンダリングループ
function render() {
  requestAnimationFrame(render);

  objects.forEach((obj) => {
    updateMeshPosition(obj);
    if (obj.mixer) {
      obj.mixer.update(0);
    }
  });

  if (statsInstance) statsInstance.begin();
  world.renderer.render(world.scene, world.camera);
  if (statsInstance) statsInstance.end();
}

