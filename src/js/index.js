import "../css/style.css";
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  AxesHelper,
  DirectionalLightHelper,
  AmbientLight,
  DirectionalLight,
  AnimationMixer,
  PMREMGenerator,
  PCFSoftShadowMap
} from "three";
import viewport from "./viewport";
import loader from "./loader";
import GUI from "lil-gui";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// デバッグモードの設定（?debug=1 または ?debug=true で有効）
function enableDebugMode() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('debug');
  return q === '1' || q === 'true';
}
window.debug = enableDebugMode();

const world = {};
const obj_array = []; // 各 GLB モデルの情報を保持する配列

const canvas = document.querySelector("#canvas");
let canvasRect = canvas.getBoundingClientRect();

const MOBILE_BREAKPOINT = 639;

/** 現在のビューポート幅に応じた scale と offsetY を返す（639px以下でモバイル用を使用） */
function getScaleAndOffsetForViewport(obj) {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const scale = isMobile && obj.scaleFactorMobile != null
    ? obj.scaleFactorMobile
    : obj.scaleFactor;
  const offsetY = isMobile && obj.offsetYMobile != null
    ? obj.offsetYMobile
    : obj.offsetY;
  return { scale, offsetY };
}

function getPinFactor(sectionEl) {
  const raw = sectionEl?.getAttribute?.("data-pin-factor");
  const factor = raw != null ? Number(raw) : NaN;
  return Number.isFinite(factor) && factor > 0 ? factor : 2;
}

/** ScrollTrigger の pin 区間を px で返す（end: () => "+=..." 用） */
function getPinDistancePx(sectionEl) {
  return Math.round(window.innerHeight * getPinFactor(sectionEl));
}

function getStickyPinSectionFromEl(el) {
  return el?.closest?.("[data-sticky-pin]") ?? null;
}

function setupPinnedSections() {
  const sections = document.querySelectorAll("[data-sticky-pin]");
  sections.forEach((sectionEl) => {
    ScrollTrigger.create({
      trigger: sectionEl,
      pin: true,
      start: "top center",
      end: () => `+=${getPinDistancePx(sectionEl)}`,
      invalidateOnRefresh: true,
      markers: false
    });
  });
}

const captionHeightControllers = [];

function updateSwitchableCaptionMinHeight(rootEl) {
  const ul = rootEl?.querySelector?.("ul");
  if (!ul) return;
  const items = Array.from(ul.querySelectorAll("li"));
  if (items.length === 0) return;

  // li は CSS で position:absolute; inset:0 のため、このまま測ると ul が潰れていて
  // 正しい高さが取れない。一時的に static にして自然高さを測る。
  rootEl.style.visibility = "hidden";
  items.forEach((li) => {
    li.style.position = "static";
  });
  void rootEl.offsetHeight; // reflow
  const heights = items.map((li) => li.getBoundingClientRect().height);
  const maxH = Math.max(0, ...heights);
  ul.style.minHeight = `${Math.ceil(maxH)}px`;
  items.forEach((li) => {
    li.style.position = "";
  });
  rootEl.style.visibility = "";
}

function setupSwitchableCaptions() {
  const captionRoots = document.querySelectorAll("[data-switchable-caption]");
  captionRoots.forEach((rootEl) => {
    const sectionEl = getStickyPinSectionFromEl(rootEl);
    if (!sectionEl) return;

    const ul = rootEl.querySelector("ul");
    if (!ul) return;

    const items = Array.from(ul.querySelectorAll("li"));
    if (items.length === 0) return;

    // 高さを固定（liごとに高さが違う問題の回避）
    updateSwitchableCaptionMinHeight(rootEl);
    captionHeightControllers.push(() => updateSwitchableCaptionMinHeight(rootEl));

    // 初期状態（最初の1つだけ表示）
    gsap.set(items, { autoAlpha: 0 });
    let currentIndex = 0;
    gsap.set(items[currentIndex], { autoAlpha: 1 });

    // スクロール進行を複数の「区間」に分割し、
    // 区間をまたいだ瞬間にのみ fadein/fadeout を発火させる。
    const fade = 0.25;
    const lastItemHoldSegments = 2;
    const totalSegments = (items.length - 1) + lastItemHoldSegments;

    const showIndex = (nextIndex) => {
      if (nextIndex === currentIndex) return;
      const prevEl = items[currentIndex];
      const nextEl = items[nextIndex];
      gsap.killTweensOf([prevEl, nextEl]);
      gsap.to(prevEl, { autoAlpha: 0, duration: fade, ease: "power1.out" });
      gsap.to(nextEl, { autoAlpha: 1, duration: fade, ease: "power1.out" });
      currentIndex = nextIndex;
    };

    ScrollTrigger.create({
      trigger: sectionEl,
      start: "top center",
      end: () => `+=${getPinDistancePx(sectionEl)}`,
      invalidateOnRefresh: true,
      scrub: false, // スクロール位置に連続して追従させず、閾値をまたいだ時だけ反応させる
      markers: false,
      onUpdate: (self) => {
        const progress = self.progress; // 0〜1
        const segIndex = Math.floor(progress * totalSegments + 1e-6);
        const clampedSeg = Math.max(0, Math.min(segIndex, totalSegments));
        const nextIndex = Math.min(items.length - 1, clampedSeg);
        if (nextIndex !== currentIndex) {
          showIndex(nextIndex);
        }
      },
      onEnter: () => {
        // セクションに入ったときは常に最初のキャプションから
        gsap.set(items, { autoAlpha: 0 });
        currentIndex = 0;
        gsap.set(items[currentIndex], { autoAlpha: 1 });
      },
      onLeaveBack: () => {
        // 上方向に抜けて戻ったときも同様にリセット
        gsap.set(items, { autoAlpha: 0 });
        currentIndex = 0;
        gsap.set(items[currentIndex], { autoAlpha: 1 });
      }
    });
  });
}

init();
async function init() {
  // アセット（画像・動画など）の事前ロード
  await loader.loadAllAssets();
  bindResizeEvents();

  // レンダラーの設定
  world.renderer = new WebGLRenderer({
    canvas,
    antialias: true
  });
  world.renderer.setSize(canvasRect.width, canvasRect.height, false);
  world.renderer.setPixelRatio(window.devicePixelRatio);
  world.renderer.setClearColor(0x000000, 0);

  // ─── シャドウマップを有効化 ───
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type    = PCFSoftShadowMap;

  // シーンとカメラの作成
  world.scene = new Scene();
  viewport.setParam(canvas);
  world.camera = new PerspectiveCamera(
    viewport.fov_deg,
    viewport.aspect,
    viewport.near,
    viewport.far
  );
  world.camera.position.z = viewport.cameraZ;

  // 環境マップの設定（金属反射をつけるため）
  const rgbeLoader = new RGBELoader();
  const pmremGenerator = new PMREMGenerator(world.renderer);
  pmremGenerator.compileEquirectangularShader();

  const IMAGE_BASE = import.meta.env.VITE_IMAGE_BASE || '/images';

  rgbeLoader.load(
    `${IMAGE_BASE}/christmas_photo_studio_04_1k.hdr`,
    // 【注意】hdrファイルが/sample17/配下でなく別階層(/une-test/webgl-playground/public/)にあるため、ビルド時のみ以下にパスを差し替える。特異対応。
    // '/une-test/webgl-playground/public/images/christmas_photo_studio_04_1k.hdr',
    function (texture) {
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      world.scene.environment = envMap;
      // world.scene.background = envMap; // 必要なら背景にも設定
      texture.dispose();
      pmremGenerator.dispose();
    },
    undefined,
    function (err) {
      console.error('HDR読み込み失敗:', err);
    }
  );


  // 環境光と方向性ライトの追加
  // AmbientLight をほぼオフに
  const ambientLight = new AmbientLight(0xffffff, 0.01);
  world.scene.add(ambientLight);
  // 直接光をやや強めにしてコントラストを強調
  const directionalLight = new DirectionalLight(0xffffff, 1.5); //強い光
  // const directionalLight = new DirectionalLight(0xffffff, 0.8); //弱い光に
  // ─── ライトにシャドウキャストを設定 ───
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width  = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.camera.near   = 0.5;
  directionalLight.shadow.camera.far    = 50;
  directionalLight.shadow.camera.left   = -10;
  directionalLight.shadow.camera.right  =  10;
  directionalLight.shadow.camera.top    =  10;
  directionalLight.shadow.camera.bottom = -10;
  directionalLight.position.set(0, 100, 100); // 真上の前方から照射
  // directionalLight.position.set(100, 100, 100);   // 角度変更
  // directionalLight.position.set(0, -150, 0);   // 真下から真上に
  directionalLight.target.position.set(0, 0, 0);
  directionalLight.target.updateMatrixWorld(); // 変更を反映
  world.scene.add(directionalLight);

  // pin 対象セクション（data属性）をまとめてピン留め
  setupPinnedSections();

  // pin区間と同期して、li を順番にフェード切替
  setupSwitchableCaptions();

  // data-glb 属性を持つ各DOM要素から GLB モデルを読み込み
  const elements = document.querySelectorAll('[data-glb]');
  const prms = Array.from(elements).map(async (el) => {
    // 必要ならテクスチャなどの読み込み（loader 内で処理）
    await loader.getTexByElement(el);
    const rect = el.getBoundingClientRect();

    // HTML側属性より GLB ファイルのパス、拡大率、Y軸オフセットを取得（モバイル用は639px以下で使用）
    const modelPath = el.getAttribute('data-glb');
    const scaleFactor = Number(el.getAttribute('data-scale')) || 10;
    const offsetY = Number(el.getAttribute('data-offset')) || 0;
    const scaleFactorMobile = el.hasAttribute('data-scale-mobile')
      ? Number(el.getAttribute('data-scale-mobile'))
      : undefined;
    const offsetYMobile = el.hasAttribute('data-offset-mobile')
      ? Number(el.getAttribute('data-offset-mobile'))
      : undefined;

    const gltfLoader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        modelPath,
        (gltf) => {
          // glTF の子要素が1つならそのオブジェクト、複数ならシーン全体を利用
          const model =
            gltf.scene.children.length === 1 ? gltf.scene.children[0] : gltf.scene;
          if (!model) {
            console.error("GLBモデルのトップレベルオブジェクトが見つかりません");
            reject(new Error("Model load error"));
            return;
          }

          // モデルのスケール設定（ビューポート幅に応じてデスクトップ/モバイルを切り替え）
          const scaleOffset = getScaleAndOffsetForViewport({
            scaleFactor,
            offsetY,
            scaleFactorMobile,
            offsetYMobile
          });
          model.scale.set(scaleOffset.scale, scaleOffset.scale, scaleOffset.scale);

          // HDR画像が強すぎて反射が白飛びするので対策
          // model.traverse((child) => {
          //   if (child.isMesh && child.material && 'envMapIntensity' in child.material) {
          //     child.material.envMapIntensity = 0.1; // 反射の強さを下げる
          //     child.material.metalness = 0.2;  // 金属度を弱める
          //     child.material.roughness = 0.3;  // 反射の拡散を強める
          //     child.material.needsUpdate = true;
          //   }
          // });

          // ─── “shade” を暗くするマテリアル調整 ───
          model.traverse((child) => {
            if (child.isMesh && child.material) {
              // 環境マップ反射を完全オフに
              if ('envMapIntensity' in child.material) {
                child.material.envMapIntensity = 0.0;
              }
              // 金属感をオフ、粗さを最大にしてハイライトを拡散
              if ('metalness' in child.material)  child.material.metalness  = 0.0;
              if ('roughness' in child.material)  child.material.roughness  = 1.0;
              child.material.needsUpdate = true;
            }
          });


          // DOM上の位置を3Dワールド座標に変換し、Y軸オフセットを適用
          const { x, y } = getWorldPosition(rect, canvasRect);
          model.position.x = x;
          model.position.y = y + scaleOffset.offsetY;

          world.scene.add(model);

          // GLBにアニメーションが存在する場合、AnimationMixerとScrollTriggerでスクラブ操作を実装
          let mixer = null;
          let action = null;
          if (gltf.animations && gltf.animations.length > 0) {
            mixer = new AnimationMixer(model);
            const clip = gltf.animations[0]; // 先頭のクリップを使用
            const duration = clip.duration;
            action = mixer.clipAction(clip);
            action.play();
            action.paused = true; // 自動再生を停止し、スクラブで制御
            action.time = 0;

            // このモデルの所属する sticky セクションをトリガーに設定
            const triggerEl = getStickyPinSectionFromEl(el);
            if (triggerEl) {
              const dummy = { time: 0 };
              gsap.to(dummy, {
                time: duration,
                ease: "none",
                scrollTrigger: {
                  trigger: triggerEl,
                  start: "top 80%",
                  end: () => `+=${getPinDistancePx(triggerEl)}`,
                  invalidateOnRefresh: true,
                  scrub: true,
                  markers: false
                },
                onUpdate: () => {
                  action.time = dummy.time;
                }
              });
            }
          }

          // 読み込んだモデルの情報を配列に格納
          obj_array.push({
            mesh: model,
            $: { el },
            rect,
            modelPath,
            mixer,
            scaleFactor,
            offsetY,
            scaleFactorMobile,
            offsetYMobile
          });
          resolve();
        },
        undefined,
        (error) => {
          console.error("GLB読み込みエラー:", error);
          reject(error);
        }
      );
    });
  });
  await Promise.all(prms);

  // lil-gui（ここから）-----------------------
  if (window.debug) {
    let axesHelper = null;
    let directionalLightHelper = null;
    const gui = new GUI();
    // ON,OFFを切り替えるためのオブジェクト（初期値off）
    // const isActive = { value: false };
    const isActive = { 
      orbitControls: false,
      showLightHelper: false
    };

    // const folder1 = gui.addFolder("画像切り替え");
    const folder2 = gui.addFolder("OrbitControls");

    // // [folder1] 画像切り替え。0.0～1.0までの範囲で0.1刻みで動かせるようにする
    // folder1.add(material.uniforms.uProgress, "value", 0.0, 1.0, 0.1).name('mixの割合').listen();
    // const mix_check_box_data = {mixCheckBoxVal: Boolean(material.uniforms.uProgress.value)};
    // folder1.add(mix_check_box_data, "mixCheckBoxVal").name('mixの割合（checkbox）').onChange(() => {
    //   gsap.to(material.uniforms.uProgress, {
    //     value: Number(mix_check_box_data.mixCheckBoxVal),
    //     duration: 1.0,
    //     ease: "none"
    //   });
    // });

    // [folder2] OrbitControlsのチェックボックス
    // .onChange()はlil-guiの仕様。isActive.valueに変化があったら引数のコールバックを実行
    folder2.add(isActive, "orbitControls").name('OrbitControlsのON/OFF').onChange((newValue) => {
      if (newValue) {
        _attachOrbitControl();
        // Axisの表示もついでにここでする
        axesHelper = new AxesHelper(1000);
        world.scene.add(axesHelper);
      }
      else {
        _detachOrbitControl();
        axesHelper?.dispose();
      }
    });

    // [folder2] DirectionalLightのチェックボックス
    // .onChange()はlil-guiの仕様。isActive.valueに変化があったら引数のコールバックを実行
    folder2.add(isActive, "showLightHelper").name('DirectionalLightのON/OFF').onChange((newValue) => {
      if (newValue) {
        directionalLightHelper = new DirectionalLightHelper(directionalLight, 30, 0xff0000);
        world.scene.add(directionalLightHelper);
      }
      else {
        world.scene.remove(directionalLightHelper);
        directionalLightHelper?.dispose();
        directionalLightHelper = null;
      }
    });

    // lil-gui（ここまで）-----------------------
  }

  // stats.js（ここから）-----------------------
  if (window.debug) {
    _attachStatsJs();
  }
  // stats.js（ここまで）-----------------------

  render();
  function render() {
    requestAnimationFrame(render);
    // 各モデルの DOM 上の位置に合わせた再配置と、アニメーション更新
    obj_array.forEach((obj) => {
      updateMeshPosition(obj);
      if (obj.mixer) {
        // スクラブ操作で直接アニメーションの time を設定しているので、delta は 0 で十分
        obj.mixer.update(0);
      }
    });

    if (window.debug) statsJsControl?.begin();
    world.renderer.render(world.scene, world.camera);
    if (window.debug) statsJsControl?.end();
  }
}

// DOM の位置情報を 3D ワールド座標に変換する関数
function getWorldPosition(dom, canvas) {
  const x = (dom.left + dom.width / 2) - (canvas.width / 2);
  const y = -(dom.top + dom.height / 2) + (canvas.height / 2);
  return { x, y };
}

// 各モデルの位置更新（リサイズやスクロールに伴う）
function updateMeshPosition(obj) {
  const { el } = obj.$;
  const rect = el.getBoundingClientRect();
  const { x, y } = getWorldPosition(rect, canvasRect);
  const { offsetY } = getScaleAndOffsetForViewport(obj);
  obj.mesh.position.x = x;
  obj.mesh.position.y = y + offsetY;
}

// リサイズイベントの設定
function bindResizeEvents() {
  let timerId = null;
  window.addEventListener("resize", () => {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      canvasRect = canvas.getBoundingClientRect();
      world.renderer.setSize(canvasRect.width, canvasRect.height, false);
      obj_array.forEach((obj) => {
        resizeMesh(obj, canvasRect);
      });
      viewport.setParam(canvas);
      world.camera.fov = viewport.fov_deg;
      world.camera.near = viewport.near;
      world.camera.far = viewport.far;
      world.camera.aspect = viewport.aspect;
      world.camera.updateProjectionMatrix();
      // キャプションの高さ固定を再計算（改行量が変わるため）
      captionHeightControllers.forEach((fn) => fn());
      ScrollTrigger.refresh();
    }, 500);
  });
}

// Mesh の位置・サイズ再計算（ブレークポイント跨ぎで scale も切り替え）
function resizeMesh(obj, newCanvasRect) {
  const { el } = obj.$;
  const newRect = el.getBoundingClientRect();
  const { x, y } = getWorldPosition(newRect, newCanvasRect);
  const { scale, offsetY } = getScaleAndOffsetForViewport(obj);
  obj.mesh.scale.set(scale, scale, scale);
  obj.mesh.position.x = x;
  obj.mesh.position.y = y + offsetY;
  obj.rect = newRect;
}

// OrbitControlのハンドラ関数（ここから）-----------------------
let orbitControl = null;

// OrbitControlのチェックボックスをONにしたとき
function _attachOrbitControl() {
  import('three/examples/jsm/controls/OrbitControls').then(({ OrbitControls }) => {
    orbitControl = new OrbitControls(world.camera, world.renderer.domElement);
    // canvasタグはz-indexが-1に設定してあるため手前に出す
    world.renderer.domElement.style.zIndex = 1;
  });
}

// OrbitControlのチェックボックスをOFFにしたとき
function _detachOrbitControl() {
  // OrbitControlを破棄
  orbitControl?.dispose();
  // canvasタグを元のz-indexに戻す
  world.renderer.domElement.style.zIndex = -1;
}
// OrbitControlのハンドラ関数（ここまで）-----------------------

// stats.jsのハンドラ関数（ここから）-----------------------
let statsJsControl = null;

function _attachStatsJs() {
  import('stats.js').then((module) => {
    const Stats = module.default;  // defaultエクスポートからStatsを取得
    statsJsControl = new Stats();
    // 通常はfps値を見ればいいので0にすること
    statsJsControl.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(statsJsControl.dom);
  });
}
// stats.jsのハンドラ関数（ここまで）-----------------------

