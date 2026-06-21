// 対応端末でのみ使えるオプション機能（NFC / カメラQR読み取り）の機能検出。
// すべて「対応していなければ UI を出さない」ためのもの。非対応端末では false を返す。

/** Web NFC（NDEFReader）に対応しているか。主に Android Chrome（HTTPS）で true。 */
export function isNfcSupported(): boolean {
  // 非HTTPSでは NDEFReader 自体が存在しないが、念のため secure context も明示確認する。
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    "NDEFReader" in window
  );
}

/**
 * カメラでのQR読み取りが使えるか。
 * QR解析は jsqr（純JS）で行うため BarcodeDetector は不要。
 * secure context（HTTPS/localhost）と getUserMedia があれば、iPhone Safari 含め利用可能。
 * 非HTTPS（http://192.168.x.x 等）では navigator.mediaDevices が無く、権限要求前に失敗する。
 */
export function isCameraScanSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}
