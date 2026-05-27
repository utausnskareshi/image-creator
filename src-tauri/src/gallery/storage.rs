//! ギャラリー画像のファイル保存とPNGメタデータ操作
//!
//! - PNG の tEXt チャンクを IEND 直前に挿入してメタデータ埋込（再エンコード不要）
//! - 256px サムネイル生成（JPEG）

use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

const PNG_MAGIC: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

/// PNG tEXt チャンクを構築する
/// keyword は 1〜79 文字の ASCII、text は ISO-8859-1 (Latin-1) が標準だが
/// UTF-8 を入れても多くのリーダで読める。長文や日本語を厳密に扱う場合は iTXt が必要だが
/// 本実装は tEXt で UTF-8 文字列を格納する（ImageCreator 内部での読み戻し前提）
fn build_text_chunk(keyword: &str, text: &str) -> Vec<u8> {
    let mut data = Vec::with_capacity(keyword.len() + text.len() + 1);
    data.extend_from_slice(keyword.as_bytes());
    data.push(0); // keyword と text の区切り
    data.extend_from_slice(text.as_bytes());

    let length = data.len() as u32;
    let chunk_type = b"tEXt";

    let mut hasher = crc32fast::Hasher::new();
    hasher.update(chunk_type);
    hasher.update(&data);
    let crc = hasher.finalize();

    let mut chunk = Vec::with_capacity(12 + data.len());
    chunk.extend_from_slice(&length.to_be_bytes());
    chunk.extend_from_slice(chunk_type);
    chunk.extend_from_slice(&data);
    chunk.extend_from_slice(&crc.to_be_bytes());
    chunk
}

/// 既存 PNG バイト列に tEXt チャンクを挿入する
/// チャンク単位で読み出し、IEND の直前にすべての tEXt を差し込む
pub fn insert_png_text_chunks(
    png_bytes: &[u8],
    chunks: &[(String, String)],
) -> Result<Vec<u8>, String> {
    if png_bytes.len() < 8 || !png_bytes.starts_with(PNG_MAGIC) {
        return Err("PNG マジックバイトが見つかりません".into());
    }

    let mut result = Vec::with_capacity(png_bytes.len() + chunks.len() * 64);
    result.extend_from_slice(PNG_MAGIC);

    let mut cursor = Cursor::new(&png_bytes[8..]);

    loop {
        let mut length_bytes = [0u8; 4];
        if cursor.read_exact(&mut length_bytes).is_err() {
            break;
        }
        let length = u32::from_be_bytes(length_bytes);

        let mut type_bytes = [0u8; 4];
        cursor
            .read_exact(&mut type_bytes)
            .map_err(|e| format!("PNG chunk type 読み込み失敗: {}", e))?;

        let mut data = vec![0u8; length as usize];
        if length > 0 {
            cursor
                .read_exact(&mut data)
                .map_err(|e| format!("PNG chunk data 読み込み失敗: {}", e))?;
        }

        let mut crc_bytes = [0u8; 4];
        cursor
            .read_exact(&mut crc_bytes)
            .map_err(|e| format!("PNG CRC 読み込み失敗: {}", e))?;

        let is_iend = &type_bytes == b"IEND";

        if is_iend {
            // IEND より前にメタデータ挿入
            for (keyword, text) in chunks {
                let chunk = build_text_chunk(keyword, text);
                result.extend_from_slice(&chunk);
            }
        }

        result.extend_from_slice(&length_bytes);
        result.extend_from_slice(&type_bytes);
        result.extend_from_slice(&data);
        result.extend_from_slice(&crc_bytes);

        if is_iend {
            break;
        }
    }

    Ok(result)
}

/// 画像バイト列からサムネイル JPEG を生成する
/// アスペクト比は維持、最大辺 256px、JPEG quality 85
pub fn generate_thumbnail_jpeg(src_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(src_bytes)
        .map_err(|e| format!("画像読み込み失敗: {}", e))?;
    let thumb = img.thumbnail(256, 256);

    let mut buf: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut buf);
    thumb
        .write_to(&mut cursor, image::ImageFormat::Jpeg)
        .map_err(|e| format!("サムネイル JPEG 書き出し失敗: {}", e))?;
    Ok(buf)
}

/// ギャラリーのフル画像保存先ディレクトリ
pub fn gallery_full_dir(data_folder: &Path) -> PathBuf {
    data_folder.join("gallery").join("full")
}

/// ギャラリーのサムネイル保存先ディレクトリ
pub fn gallery_thumb_dir(data_folder: &Path) -> PathBuf {
    data_folder.join("gallery").join("thumb")
}

/// 生成画像のファイル名を組み立てる
/// 形式: `YYYY-MM-DD_HH-MM-SS_<model>_seed<seed>_<index>.png`
pub fn build_image_filename(model_id: &str, seed: i64, index: usize) -> String {
    let now = chrono::Utc::now();
    let stamp = now.format("%Y-%m-%d_%H-%M-%S");
    format!("{}_{}_seed{}_{:03}.png", stamp, model_id, seed, index)
}

/// フル画像とサムネイルをディスクに保存する
/// 戻り値: (フルパス, サムネイルパス)
pub async fn persist_to_disk(
    data_folder: &Path,
    filename: &str,
    full_png_with_metadata: &[u8],
    thumbnail_jpeg: &[u8],
) -> Result<(PathBuf, PathBuf), String> {
    let full_dir = gallery_full_dir(data_folder);
    let thumb_dir = gallery_thumb_dir(data_folder);
    tokio::fs::create_dir_all(&full_dir)
        .await
        .map_err(|e| format!("full ディレクトリ作成失敗: {}", e))?;
    tokio::fs::create_dir_all(&thumb_dir)
        .await
        .map_err(|e| format!("thumb ディレクトリ作成失敗: {}", e))?;

    let full_path = full_dir.join(filename);
    // サムネイルは同名で拡張子だけ .jpg
    // trim_end_matches は ".png" を繰り返し剥がしてしまうため (例: "a.png.png" → "a")、
    // 一度きりの剥がしになる strip_suffix を使う。
    let thumb_filename = format!(
        "{}.jpg",
        filename.strip_suffix(".png").unwrap_or(filename)
    );
    let thumb_path = thumb_dir.join(&thumb_filename);

    tokio::fs::write(&full_path, full_png_with_metadata)
        .await
        .map_err(|e| format!("フル画像保存失敗 ({}): {}", full_path.display(), e))?;
    tokio::fs::write(&thumb_path, thumbnail_jpeg)
        .await
        .map_err(|e| format!("サムネイル保存失敗 ({}): {}", thumb_path.display(), e))?;

    Ok((full_path, thumb_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_text_chunk_layout_is_correct() {
        let chunk = build_text_chunk("ic:test", "hello");
        // length(4) + type(4) + keyword + null + text + crc(4)
        let expected_data_len = "ic:test".len() + 1 + "hello".len();
        let length = u32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        assert_eq!(length as usize, expected_data_len);
        assert_eq!(&chunk[4..8], b"tEXt");
    }

    #[test]
    fn insert_into_minimal_png_succeeds() {
        // 1x1 透明PNG（ヘッダ + IHDR + IDAT + IEND の最小構成）
        let png = vec![
            0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, // magic
            0x00, 0x00, 0x00, 0x0D, b'I', b'H', b'D', b'R', 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
            0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, // CRC
            0x00, 0x00, 0x00, 0x0A, b'I', b'D', b'A', b'T', 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00,
            0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, // CRC
            0x00, 0x00, 0x00, 0x00, b'I', b'E', b'N', b'D', 0xAE, 0x42, 0x60, 0x82,
        ];
        let result = insert_png_text_chunks(
            &png,
            &[("ic:test".to_string(), "value".to_string())],
        )
        .unwrap();
        // 元より長くなる
        assert!(result.len() > png.len());
        // 末尾は依然 IEND（4 bytes type + 4 bytes CRC で末尾の 12 bytes が IEND chunk）
        assert_eq!(&result[result.len() - 8..result.len() - 4], b"IEND");
    }
}
