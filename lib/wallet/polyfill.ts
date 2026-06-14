// symbol-sdk / symbol-hd-wallets はブラウザ実行時に Node の Buffer を必要とする。
// このモジュールを symbol 関連 import より前に評価することで Buffer をグローバルに用意する。
import { Buffer as BufferPolyfill } from "buffer";

declare global {
  var Buffer: typeof BufferPolyfill;
}

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = BufferPolyfill;
}
