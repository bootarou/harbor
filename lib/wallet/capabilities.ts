// 対応端末でのみ使えるオプション機能（NFC / カメラQR読み取り）の機能検出。
// すべて「対応していなければ UI を出さない」ためのもの。非対応端末では false を返す。

/** Web NFC（NDEFReader）に対応しているか。主に Android Chrome（HTTPS）で true。 */
export function isNfcSupported(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

/** Barcode Detection API（カメラでのQR読み取り）に対応しているか。 */
export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}
