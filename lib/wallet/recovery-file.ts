/**
 * リカバリーフレーズ（ニーモニック）をテキストファイルとして保存する。
 *
 * セキュリティ上の約束（CLAUDE.md の禁止事項）:
 * - フレーズはこのモジュールの外へ出さない。fetch も console 出力もしない。
 * - ファイルの組み立てからダウンロードまで、すべてブラウザ内で完結させる。
 *   サーバー経由（API でファイルを生成して返す等）にしてはならない。
 *
 * 保存されるファイルは平文であり、書き写すための一時的なものとして扱う
 * （長期保存はさせない。画面とファイルの両方でその旨を案内する）。
 * 暗号化した状態で持ち出したい場合はウォレット管理のエクスポート
 * （パスフレーズで暗号化済み）を使う。
 */

/** ファイル名に使うアドレスの先頭。どのウォレットのものか見分けるため。 */
const ADDRESS_HINT_LEN = 8;

function stamp(d: Date): { date: string; datetime: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const datetime =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}`;
  return { date, datetime };
}

export function recoveryFileName(address: string, now = new Date()): string {
  const hint = address.slice(0, ADDRESS_HINT_LEN).toUpperCase();
  return `harbor-recovery-phrase-${hint}-${stamp(now).date}.txt`;
}

/** ファイルの中身。単語は番号付きで、書き写しやすいよう1行1語にする。 */
export function buildRecoveryFile(args: {
  mnemonic: string;
  address: string;
  network: string;
  now?: Date;
}): string {
  const { mnemonic, address, network } = args;
  const words = mnemonic.trim().split(/\s+/);
  const { datetime } = stamp(args.now ?? new Date());

  return [
    "Harbor リカバリーフレーズ",
    "========================================",
    "",
    "【重要】このファイルには、ウォレットを復元するための単語が",
    "平文で書かれています。このファイルを手に入れた人は誰でも、",
    "あなたの資産を自由に動かせます。",
    "",
    "このファイルは書き写すための一時的なものです。長期保存しないでください。",
    "紙に書き写す（または印刷する）まで置いておき、書き写したら削除してください。",
    "ゴミ箱からも消してください。",
    "",
    "  - 他人に見せない・送らない",
    "  - クラウドの共有フォルダやメールの添付に置かない",
    "  - 書き写したら削除する（このファイルを保管場所にしない）",
    "  - Harbor の運営がこのフレーズを尋ねることはありません",
    "",
    "----------------------------------------",
    `アドレス      : ${address}`,
    `ネットワーク  : ${network}`,
    `作成日時      : ${datetime}`,
    `単語数        : ${words.length}`,
    "----------------------------------------",
    "",
    "リカバリーフレーズ（この順番のとおりに入力してください）",
    "",
    ...words.map((w, i) => `${String(i + 1).padStart(2, " ")}. ${w}`),
    "",
    "========================================",
    "",
  ].join("\r\n");
}

/**
 * リカバリーフレーズをファイルとして保存させる。
 * ブラウザ内で Blob を作り、a[download] で保存させるだけ。通信は発生しない。
 */
export function downloadRecoveryFile(args: {
  mnemonic: string;
  address: string;
  network: string;
}): void {
  const text = buildRecoveryFile(args);
  // BOM を付ける。付けないと Windows のメモ帳などで文字化けすることがある。
  const blob = new Blob(["\uFEFF", text], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = recoveryFileName(args.address);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 直後に解放するとダウンロードが始まらないブラウザがあるため、
  // 現在のタスクが終わってから解放する。
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
