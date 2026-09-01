"use client";

import { createContext, useContext } from "react";

// 画面共有の描画先（ドック）を、チャット側から共有するための仕組み。
//
// 画面共有の状態（購読・トラック）は入力バーの中の VoicePanel が持っているが、
// 表示はチャット本文の横（PC）や下（スマホ）に置きたい。DOM の位置が離れるため、
// チャット側が用意した要素を context で渡し、VoicePanel からポータルで描画する。
// こうすることで LiveKit まわりの状態を持ち上げずに済み、既存の構造を壊さない。
export const ScreenDockContext = createContext<HTMLElement | null>(null);

export function useScreenDock(): HTMLElement | null {
  return useContext(ScreenDockContext);
}
