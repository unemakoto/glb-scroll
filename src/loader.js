import { LinearFilter, TextureLoader, VideoTexture /*, MirroredRepeatWrapping */ } from 'three';

const textureCache = new Map();
const texLoader = new TextureLoader();

const loader = {
  loadAllAssets,
  loadImg,
  getTexByElement,
};

async function loadAllAssets() {
  // 元は [data-webgl] を対象にしていたが、glb-scroll では data-glb 要素にテクスチャを紐づける想定
  const elements = document.querySelectorAll('[data-glb]');
  for (const el of elements) {
    const data = el.dataset;

    // for ... ofではエラーになる。dataがiterableでないため。
    for (let key in data) {
      // 取得したdata属性が「data-tex」で始まらない場合は無視して次のループへ進む
      if (!key.startsWith('tex')) {
        continue;
      }
      const url = data[key];
      // 画像URLが新規の場合のみ連想配列に追加
      if (!textureCache.has(url)) {
        // いったんURL(key)だけ設定できればいいので第二引数(value)はヌルを指定
        textureCache.set(url, null);
      }
    }
  }

  // 画像URLが取得できたのでtextureCache{}に設定
  const texPrms = []; // promiseを入れる配列
  textureCache.forEach((_tmp, url) => {
    let prms = null;
    if (/\.mp4$/.test(url)) {
      prms = loadVideo(url).then((tex) => {
        // 連想配列のvalue側を設定
        textureCache.set(url, tex);
      });
    } else {
      prms = loadImg(url).then((tex) => {
        // 連想配列のvalue側を設定
        textureCache.set(url, tex);
      });
    }
    texPrms.push(prms);
  });

  // 並列処理で待機する
  await Promise.all(texPrms);
  // console.log(textureCache);
}

async function loadImg(url) {
  const tex = await texLoader.loadAsync(url);
  // tex.wrapS = MirroredRepeatWrapping; //テクスチャがない部分の指定（u方向）
  // tex.wrapT = MirroredRepeatWrapping; //テクスチャがない部分の指定（v方向）
  // 拡大縮小時の補間方法を指定
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  // キャッシュを保持させる
  tex.needsUpdate = false;
  return tex;
}

async function loadVideo(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.oncanplay = () => {
      const tex = new VideoTexture(video);
      // tex.wrapS = MirroredRepeatWrapping; //テクスチャがない部分の指定（u方向）
      // tex.wrapT = MirroredRepeatWrapping; //テクスチャがない部分の指定（v方向）
      // 拡大縮小時の補間方法を指定
      tex.magFilter = LinearFilter;
      tex.minFilter = LinearFilter;
      video.play(); // 動画を再生
      video.oncanplay = null; // ループ再生を考慮してコールバックをクリア
      resolve(tex); // Promise()の処理完了を通知
    };
    video.src = url;
    video.autoplay = true;
    video.loop = true;
    video.muted = true; // 自動再生のため
    video.playsInline = true; // スマホで全画面回避
    video.defaultMuted = true; // safariで必要な時がある
  });
}

// 引数でdata属性を渡すとその連想配列を返す関数
async function getTexByElement(el) {
  // テクスチャ画像読み込み
  // data-tex属性をまとめて連想配列に設定
  const texes = new Map();
  // el.dataset.tex1とel.dataset.tex2をまとめて取得
  const data = el.dataset;

  let mediaLoaded = null;

  // imgタグ内の先頭のdata-tex属性かどうかを判定するフラグ
  let first_tex = true;
  for (let key in data) {
    // 取得したdata属性が「data-tex」で始まらない場合は無視して次のループへ進む
    if (!key.startsWith('tex')) {
      continue;
    }
    const url = data[key];
    const tex = textureCache.get(url);
    // tex1をuTex1に変換
    key = key.replace('tex', 'uTex');
    // console.log(key); // uTex1など
    // uTex1, uTex2などを連想配列に設定
    texes.set(key, tex);

    // img要素であればsrc属性を追加する
    if (first_tex && el instanceof HTMLImageElement) {
      mediaLoaded = new Promise((resolve) => {
        // onloadが完了するとresolve()がコールされる
        el.onload = () => {
          resolve(); //画像読み込み完了を通知
        };
      });
      el.src = url;
      first_tex = false;
    }

    // video要素であればsrc属性を追加する
    if (first_tex && el instanceof HTMLVideoElement) {
      mediaLoaded = new Promise((resolve) => {
        // 動画はonloadeddataが完了するとresolve()がコールされる
        el.onloadeddata = () => {
          resolve(); //動画読み込み完了を通知
        };
      });
      el.src = url;
      el.load(); // safari?
      first_tex = false;
    }
  }

  // mediaLoadedはPromiseオブジェクトが入っているので以下のようにすると
  // Promiseが解決するまで後続の行を実行せず待ってくれる。
  await mediaLoaded;
  return texes;
}

export default loader;

