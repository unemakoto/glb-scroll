import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * キャプションの切り替えハンドラ（スライド）
 * @param {string} sliderSelector - スライダー本体のセレクタ（未使用）
 * @param {string} prevBtnSelector - "前" ボタンのセレクタ
 * @param {string} nextBtnSelector - "次" ボタンのセレクタ
 * @param {object} state - activeSlideIdx（参照渡し）
 * @param {function} goTo - 外部の関数（参照渡し）
 */

function mountNavBtnHandler(sliderSelector, prevBtnSelector, nextBtnSelector, state, goTo) {
  const prev_el = document.querySelector(prevBtnSelector);
  const next_el = document.querySelector(nextBtnSelector);
  const slider_el = document.querySelector(sliderSelector);

  function invokeSlider(idx) {
    goTo(idx);
  }

  // 前のスライドへ
  prev_el.addEventListener("click", () => {
    const _idx = state.activeSlideIdx - 1;
    invokeSlider(_idx);
  });

  // 次のスライドへ
  next_el.addEventListener("click", () => {
    const _idx = state.activeSlideIdx + 1;
    invokeSlider(_idx);
  });
}

/**
 * キャプションの切り替えハンドラ（キャプション）
 * @param {string} sliderSelector - スライダー本体のセレクタ（未使用）
 * @param {string} prevBtnSelector - "前" ボタンのセレクタ
 * @param {string} nextBtnSelector - "次" ボタンのセレクタ
 * @param {object} state - activeSlideIdx（参照渡し）
 * @param {function} goTo - 外部の関数（参照渡し）
 * @param {string} captionUlSelector - ulタグのセレクタ
 */

function mountCaptionBtnHandler(sliderSelector, prevBtnSelector, nextBtnSelector, state, goTo, captionUlSelector) {
  const prev_el = document.querySelector(prevBtnSelector);
  const next_el = document.querySelector(nextBtnSelector);
  const caption_ul_el = document.querySelector(captionUlSelector);
  // console.log(caption_ul_el);
  const slide_lis = [...caption_ul_el.children];
  let translationVal = 50;
  let prevIdx = 0;

  // キャプションを50pxずつ横にずらして配置
  slide_lis.forEach((li, i) => {
    li.style.transform = `translateX(-${i * translationVal}px)`;
  });

  function invokeSlider(idx) {
    console.log("mountCaptionBtnHandler()");
    goTo(idx);
  }

  // 前のスライドへ
  prev_el.addEventListener("click", () => {
    let _idx = state.activeSlideIdx - 1;
    // _idxがマイナスにならないように加算
    _idx = (_idx + slide_lis.length) % slide_lis.length;
    console.log(_idx);
    invokeSlider(_idx);
    // activeなスライダのopacityを1にする
    slide_lis[_idx].style.opacity = 1.0;
    slide_lis[prevIdx].style.opacity = 0.0;
    // activeなスライダのみ位置をずらす
    caption_ul_el.style.transform = `translateX(${_idx * translationVal}px)`;
    prevIdx = _idx;
  });

  // 次のスライドへ
  next_el.addEventListener("click", () => {
    let _idx = state.activeSlideIdx + 1;
    // _idxが5以上にも対応（キャプションの個数で剰余計算）
    _idx = _idx % slide_lis.length;

    invokeSlider(_idx);
    // activeなスライダのopacityを1にする
    slide_lis[_idx].style.opacity = 1.0;
    slide_lis[prevIdx].style.opacity = 0.0;
    // activeなスライダのみ位置をずらす
    caption_ul_el.style.transform = `translateX(${_idx * translationVal}px)`;
    prevIdx = _idx;
  });

}

/**
 * 画面スクロールハンドラ
 * @param {string} triggerSelector - scrollTriggerの対象となるセレクタ
 * @param {function} goTo - 外部の関数（参照渡し）
 * @param {string} captionUlSelector - ulタグのセレクタ
 */

function mountScrollHandler( triggerSelector, goTo, captionUlSelector) {
  const caption_ul_el = document.querySelector(captionUlSelector);
  // console.log(caption_ul_el);
  const slide_lis = [...caption_ul_el.children];

  let translationVal = 50;
  let prevIdx = 0;

  // キャプションを50pxずつ横にずらして配置
  slide_lis.forEach((li, i) => {
    li.style.transform = `translateX(-${i * translationVal}px)`;
  });

  function invokeSlider(idx) {
    goTo(idx);
  }

  // ScrollTriggerの登録
  gsap.registerPlugin(ScrollTrigger);

  // GSAPで値(idx)をアニメーションさせるためオブジェクトを定義
  const slides = {idx: 0};

  gsap.to(slides, {
    idx: slide_lis.length - 1, // 0～4の値
    scrollTrigger: {
      trigger: triggerSelector,
      start: "top 0%", // 開始地点はトリガー要素の上端かつビューポートの上端
      end: "+=3000", // 3000pxの範囲でスクロールのstart-endとする
      pin: true, // sticky動作ON
      scrub: true, // スクロールの進行状況に合わせてアニメーションさせる
      onUpdate: () => {
        let _idx = Math.round(slides.idx); // 四捨五入で整数化
        // _idxがマイナスにならないように加算
        _idx = (_idx + slide_lis.length) % slide_lis.length;
      
        // idxが同じだったら何もせず抜ける
        if(_idx === prevIdx) return;

        console.log(_idx);
        invokeSlider(_idx);
        // activeなスライダのopacityを1にする
        slide_lis[_idx].style.opacity = 1.0;
        slide_lis[prevIdx].style.opacity = 0.0;
        // activeなスライダのみ位置をずらす
        caption_ul_el.style.transform = `translateX(${_idx * translationVal}px)`;
        prevIdx = _idx;  
      }
    }
  });
}

export { mountNavBtnHandler, mountCaptionBtnHandler, mountScrollHandler };

