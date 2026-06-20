// 対応端末でのみ使えるオプション機能（NFC / カメラQR読み取り）の機能検出。
// すべて「対応していなければ UI を出さない」ためのもの。非対応端末では false を返す。

/** Web NFC（NDEFReader）に対応しているか。主に Android Chrome（HTTPS）で true。 */
export function isNfcSupported(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

/** Barcode Detection API（QR解析）に対応しているか。 */
export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/**
 * カメラでのQR読み取りが実際に使えるか。
 * BarcodeDetector に加え、secure context（HTTPS/localhost）と getUserMedia が必要。
 * 非HTTPS（http://192.168.x.x 等）では navigator.mediaDevices が無く、権限要求前に失敗する。
 */
export function isCameraScanSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    "BarcodeDetector" in window &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}
