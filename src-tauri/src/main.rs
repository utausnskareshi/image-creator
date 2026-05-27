// Windows GUI アプリでコンソールウィンドウを表示させない（リリース時のみ）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 実装の本体は lib.rs にあるため、ここでは run() を呼ぶだけ
fn main() {
    image_creator_lib::run()
}
