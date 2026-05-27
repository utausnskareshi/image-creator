; ============================================================================
; ImageCreator NSIS カスタムフック
;
; アンインストール時の連携フロー:
;   1. PREUNINSTALL: 関連プロセス kill + データフォルダパスを %TEMP% に退避
;        - 経路A: `%LOCALAPPDATA%\ImageCreator\.uninstall_info` (ファイル)
;        - 経路B: HKCU\Software\ImageCreator\DataFolder (レジストリ)
;      どちらか有効な方を採用 (5版で経路A単独だと連動削除が機能しないケースが
;      観測されたため二重化)。
;   2. Tauri 標準の「Delete application data」チェックボックスがユーザーデータを削除
;   3. POSTUNINSTALL: ユーザーデータが削除されたかを確認
;        - 削除されていれば → モデル・ランタイム（データフォルダ）も連動削除
;        - 残っていれば   → データフォルダも残す（ユーザーが保持を選んだとみなす）
;
; 診断: 全工程を `%TEMP%\imagecreator_uninstall_log.txt` に追記する。
;   問題発生時にこのログを見れば「どの分岐に入ったか」「RMDir が成功/失敗したか」
;   が分かる。silent モード（Windows 設定経由）でも DetailPrint は画面に出ない
;   ため、ログ機構が原因切り分けの命綱になる。
;
; 重要: MessageBox は使わない。Windows Settings 経由のアンインストールが silent
;   モードでダイアログを抑制する事例がある (4版で確認済)。Tauri 標準チェック
;   ボックスの結果を「ユーザーデータの有無」で検出して連動させる。
; ============================================================================

!define IC_LOG_FILE "$TEMP\imagecreator_uninstall_log.txt"

; ---- ログ書き込みマクロ ----
; ファイルハンドル $8 を使用 (PREUNINSTALL/POSTUNINSTALL 内のローカル使用に留まる)
; 各呼び出しごとに open/append/close することで、途中で uninstaller がクラッシュ
; しても直前までの行は保存される。
;
; ラベル名に NSIS の `${__LINE__}` を使うとマクロ展開時にドット混じり
; (`759.2.3` 等) になり「could not resolve label」エラーになる。
; そこで `IfErrors +N` 形式の相対ジャンプを使う。
;
; ログローテーション方針: PREUNINSTALL の冒頭で IC_LOG_INIT を呼ぶ際、既存ログがあれば
; `${IC_LOG_FILE}.prev` に退避してから新規作成する。繰り返しテストでログが肥大化して
; 該当セクションを特定しにくくなる問題を防ぐ。
!macro IC_LOG_INIT
  ; 既存ログを .prev へ退避 (失敗しても継続)
  IfFileExists "${IC_LOG_FILE}" 0 +3
    Delete "${IC_LOG_FILE}.prev"
    Rename "${IC_LOG_FILE}" "${IC_LOG_FILE}.prev"
  ; 新規に空のログを作成
  ClearErrors
  FileOpen $8 "${IC_LOG_FILE}" w
  IfErrors +3       ; エラー時は FileSeek/FileWrite をスキップして FileClose へ
    FileSeek $8 0 END
    FileWrite $8 "$\r$\n"
  FileClose $8
!macroend

!macro IC_LOG msg
  ClearErrors
  FileOpen $8 "${IC_LOG_FILE}" a
  IfErrors +3
    FileSeek $8 0 END
    FileWrite $8 "${msg}$\r$\n"
  FileClose $8
  DetailPrint "${msg}"
!macroend

!macro IC_LOG_VAR msg var
  ClearErrors
  FileOpen $8 "${IC_LOG_FILE}" a
  IfErrors +3
    FileSeek $8 0 END
    FileWrite $8 "${msg} ${var}$\r$\n"
  FileClose $8
  DetailPrint "${msg} ${var}"
!macroend

; ---- インストール: 未使用 ----

!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

; ---- アンインストール: 事前処理 ----

!macro NSIS_HOOK_PREUNINSTALL
  ; 新規ログ開始 (前回ログがあれば追記される; 先頭にセパレータを入れる)
  !insertmacro IC_LOG_INIT
  !insertmacro IC_LOG "==================================================="
  !insertmacro IC_LOG "[PREUNINSTALL] ImageCreator アンインストール開始"

  ; ==========================================================================
  ; 1. 関連プロセスを強制終了（子プロセスがフォルダロックする問題への対策）
  ;
  ; taskkill は対象プロセスが存在しない場合 128 (Reason: There is no running
  ; instance of the task) を返す。これはエラーではなく正常終了とみなす。
  ; ロック中などで失敗した場合は 1 秒待機して 1 回だけリトライする。
  ; ==========================================================================
  !insertmacro IC_LOG "[PREUNINSTALL] 関連プロセスを停止"

  ; NOTE: `IC_LOG_VAR` マクロは 7 命令に展開されるため、
  ;   `StrCmp ... +N` のような相対ジャンプ数値は手計算が困難でミスしやすい
  ;   (旧実装は +5 と書いていたが実際は IC_LOG_VAR の中に飛び込んでいた)。
  ;   そこで名前付きラベルで「retry 不要時はリトライブロックをスキップする」
  ;   フローを明示する。
  nsExec::ExecToLog 'taskkill /F /IM "image-creator.exe" /T'
  Pop $0
  !insertmacro IC_LOG_VAR "[PREUNINSTALL]   image-creator.exe taskkill exit:" $0
  ; 0 (成功) or 128 (該当プロセスなし) ならリトライ不要
  StrCmp $0 "0" ic_pre_kill_img_done
  StrCmp $0 "128" ic_pre_kill_img_done
    Sleep 1000
    nsExec::ExecToLog 'taskkill /F /IM "image-creator.exe" /T'
    Pop $0
    !insertmacro IC_LOG_VAR "[PREUNINSTALL]   image-creator.exe taskkill retry exit:" $0
  ic_pre_kill_img_done:

  nsExec::ExecToLog 'taskkill /F /IM "llama-server.exe" /T'
  Pop $0
  !insertmacro IC_LOG_VAR "[PREUNINSTALL]   llama-server.exe taskkill exit:" $0
  StrCmp $0 "0" ic_pre_kill_llm_done
  StrCmp $0 "128" ic_pre_kill_llm_done
    Sleep 1000
    nsExec::ExecToLog 'taskkill /F /IM "llama-server.exe" /T'
    Pop $0
    !insertmacro IC_LOG_VAR "[PREUNINSTALL]   llama-server.exe taskkill retry exit:" $0
  ic_pre_kill_llm_done:

  ; ComfyUI の python.exe (および python_embeded\python.exe) は ExecutablePath
  ; で絞り込む（他の Python と区別）
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name=''python.exe''\" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -like ''*ComfyUI_windows_portable*'' -or $_.ExecutablePath -like ''*python_embeded*'' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }"'
  Pop $0
  !insertmacro IC_LOG_VAR "[PREUNINSTALL]   ComfyUI python.exe taskkill exit:" $0

  Sleep 1500  ; ファイルロック解放待ち
  !insertmacro IC_LOG "[PREUNINSTALL] プロセス停止待機完了 (1500ms)"

  ; ==========================================================================
  ; 2. データフォルダパスを取得 (経路A: ファイル、経路B: レジストリ)
  ;    POSTUNINSTALL で使うため `%TEMP%\imagecreator_data_folder.txt` に退避。
  ;    `.uninstall_info` は user data 削除と同時に消える可能性があるため、
  ;    必ず先に %TEMP% へコピーしておく。
  ; ==========================================================================
  StrCpy $R0 ""

  ; -- 経路A: .uninstall_info ファイル --
  IfFileExists "$LOCALAPPDATA\ImageCreator\.uninstall_info" 0 ic_pre_try_registry
    !insertmacro IC_LOG "[PREUNINSTALL] 経路A: .uninstall_info 発見、読み込み中"
    ClearErrors
    FileOpen $R2 "$LOCALAPPDATA\ImageCreator\.uninstall_info" r
    IfErrors ic_pre_file_open_failed
    FileRead $R2 $R0
    FileClose $R2
    !insertmacro IC_LOG_VAR "[PREUNINSTALL]   読み込んだ生パス:" $R0
    Goto ic_pre_trim
  ic_pre_file_open_failed:
    !insertmacro IC_LOG "[PREUNINSTALL]   ファイルオープン失敗、経路B(レジストリ)を試行"
    Goto ic_pre_try_registry

  ic_pre_try_registry:
  ; -- 経路B: HKCU\Software\ImageCreator\DataFolder --
  ; Tauri NSIS は perMachine 設定だが、HKCU 読み出しはアンインストーラ実行
  ; ユーザー (=admin 起動でも、ユーザーが管理者の場合は同一プロファイル) の
  ; HKCU を参照する。ユーザー = 管理者の単一マシン構成では問題ない。
    !insertmacro IC_LOG "[PREUNINSTALL] 経路B: HKCU\Software\ImageCreator\DataFolder を読み込み"
    ClearErrors
    ReadRegStr $R0 HKCU "Software\ImageCreator" "DataFolder"
    IfErrors ic_pre_no_source
    !insertmacro IC_LOG_VAR "[PREUNINSTALL]   レジストリ値:" $R0

  ic_pre_trim:
    ; 末尾の改行・空白を除去（CR/LF/Tab/Space）
    ic_pre_trim_loop:
      StrLen $R3 $R0
      IntCmp $R3 0 ic_pre_trim_done
      IntOp $R3 $R3 - 1
      StrCpy $R4 $R0 1 $R3
      StrCmp $R4 "$\r" ic_pre_trim_one
      StrCmp $R4 "$\n" ic_pre_trim_one
      StrCmp $R4 "$\t" ic_pre_trim_one
      StrCmp $R4 " " ic_pre_trim_one
      Goto ic_pre_trim_done
    ic_pre_trim_one:
      StrCpy $R0 $R0 $R3
      Goto ic_pre_trim_loop
    ic_pre_trim_done:
    !insertmacro IC_LOG_VAR "[PREUNINSTALL]   trim 後パス:" $R0

    StrCmp $R0 "" ic_pre_empty_path

    ; %TEMP% に保存
    ClearErrors
    FileOpen $R5 "$TEMP\imagecreator_data_folder.txt" w
    IfErrors ic_pre_save_failed
    FileWrite $R5 "$R0"
    FileClose $R5
    !insertmacro IC_LOG_VAR "[PREUNINSTALL] 退避完了 -> $TEMP\imagecreator_data_folder.txt:" $R0
    Goto ic_pre_done

  ic_pre_empty_path:
    !insertmacro IC_LOG "[PREUNINSTALL] 退避スキップ: パスが空"
    Goto ic_pre_done
  ic_pre_save_failed:
    !insertmacro IC_LOG "[PREUNINSTALL] 退避失敗 (FileOpen エラー)"
    Goto ic_pre_done
  ic_pre_no_source:
    !insertmacro IC_LOG "[PREUNINSTALL] 経路A/B どちらからもデータフォルダパスを取得できず"
  ic_pre_done:
    !insertmacro IC_LOG "[PREUNINSTALL] 完了"
!macroend

; ---- アンインストール: 事後処理 ----

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro IC_LOG "[POSTUNINSTALL] 開始"

  ; ==========================================================================
  ; Tauri 標準「Delete application data」チェックボックスの結果を検出して
  ; データフォルダ（モデル・ランタイム）の処理を決定する:
  ;
  ;   - $LOCALAPPDATA\ImageCreator が消えている (= ユーザーがチェック)
  ;     → モデル・ランタイムも連動削除
  ;   - $LOCALAPPDATA\ImageCreator が残っている (= ユーザーがチェックを外した)
  ;     → モデル・ランタイムも保持
  ; ==========================================================================

  ; ディレクトリ存在確認: NSIS の `IfFileExists` は内部で `FindFirstFile` を使うため、
  ;   - `"X\*.*"` は空フォルダで false になる
  ;   - `"X\"` (末尾バックスラッシュ) はファイル名が空とみなされて常に false
  ; そこで「常に存在する settings.json」をマーカーとして使う。
  ;   - settings.json があれば → ユーザーデータ保持 (チェックボックスを外した)
  ;   - settings.json が無ければ → ユーザーデータ削除済み (チェックボックス ON)
  IfFileExists "$LOCALAPPDATA\ImageCreator\settings.json" ic_post_kept_user_data ic_post_user_data_gone

  ic_post_user_data_gone:
    !insertmacro IC_LOG "[POSTUNINSTALL] 判定: LOCALAPPDATA\ImageCreator が削除されている → 連動削除を実行"

    ; -- 退避ファイルからパス取得 --
    IfFileExists "$TEMP\imagecreator_data_folder.txt" 0 ic_post_no_temp

    ClearErrors
    FileOpen $R5 "$TEMP\imagecreator_data_folder.txt" r
    IfErrors ic_post_temp_unreadable
    FileRead $R5 $R0
    FileClose $R5
    !insertmacro IC_LOG_VAR "[POSTUNINSTALL] 退避ファイルから読み込み:" $R0

    ; 念のため再トリム
    ic_post_trim_loop:
      StrLen $R3 $R0
      IntCmp $R3 0 ic_post_trim_done
      IntOp $R3 $R3 - 1
      StrCpy $R4 $R0 1 $R3
      StrCmp $R4 "$\r" ic_post_trim_one
      StrCmp $R4 "$\n" ic_post_trim_one
      StrCmp $R4 "$\t" ic_post_trim_one
      StrCmp $R4 " " ic_post_trim_one
      Goto ic_post_trim_done
    ic_post_trim_one:
      StrCpy $R0 $R0 $R3
      Goto ic_post_trim_loop
    ic_post_trim_done:
    !insertmacro IC_LOG_VAR "[POSTUNINSTALL] trim 後:" $R0

    StrCmp $R0 "" ic_post_empty_path
    ; 末尾バックスラッシュを付けると FindFirstFile が空ファイル名扱いで false 返却するため、
    ; 末尾区切りなしの形式でディレクトリ存在を確認する。
    IfFileExists "$R0" 0 ic_post_path_missing
    !insertmacro IC_LOG_VAR "[POSTUNINSTALL] 削除対象フォルダ存在確認 OK:" $R0

    !insertmacro IC_LOG_VAR "[POSTUNINSTALL] RMDir /r 実行:" $R0
    ClearErrors
    RMDir /r "$R0"
    IfErrors ic_post_remove_failed

    ; 削除後に残骸チェック (末尾 `\` を付けない)
    IfFileExists "$R0" ic_post_remove_partial ic_post_remove_ok

    ic_post_remove_ok:
      !insertmacro IC_LOG_VAR "[POSTUNINSTALL] データフォルダ削除完了:" $R0
      Goto ic_post_cleanup_temp

    ic_post_remove_partial:
      !insertmacro IC_LOG_VAR "[POSTUNINSTALL] RMDir エラーは出なかったが残骸あり (ロック中ファイル可能性):" $R0
      Goto ic_post_cleanup_temp

    ic_post_remove_failed:
      !insertmacro IC_LOG_VAR "[POSTUNINSTALL] RMDir エラー発生 (削除失敗):" $R0
      Goto ic_post_cleanup_temp

    ic_post_empty_path:
      !insertmacro IC_LOG "[POSTUNINSTALL] 退避パスが空 (削除スキップ)"
      Goto ic_post_cleanup_temp

    ic_post_path_missing:
      !insertmacro IC_LOG_VAR "[POSTUNINSTALL] 退避パスのフォルダが既に存在しない:" $R0
      Goto ic_post_cleanup_temp

    ic_post_temp_unreadable:
      !insertmacro IC_LOG "[POSTUNINSTALL] TEMP の退避ファイルを読めなかった"
      Goto ic_post_cleanup_temp

    ic_post_no_temp:
      !insertmacro IC_LOG "[POSTUNINSTALL] TEMP に退避ファイルがない、レジストリ経由でリトライ"
      ; -- PREUNINSTALL の退避が失敗していても、レジストリから直接読んでリトライ --
      ClearErrors
      ReadRegStr $R0 HKCU "Software\ImageCreator" "DataFolder"
      IfErrors ic_post_no_registry
      !insertmacro IC_LOG_VAR "[POSTUNINSTALL]   レジストリから直接取得:" $R0

      StrCmp $R0 "" ic_post_no_registry
      IfFileExists "$R0" 0 ic_post_registry_path_missing
      !insertmacro IC_LOG_VAR "[POSTUNINSTALL]   レジストリ経路で RMDir /r 実行:" $R0
      ClearErrors
      RMDir /r "$R0"
      IfErrors ic_post_registry_rmdir_failed
      IfFileExists "$R0" ic_post_registry_remove_partial ic_post_registry_remove_ok

      ic_post_registry_remove_ok:
        !insertmacro IC_LOG_VAR "[POSTUNINSTALL]   レジストリ経路で削除完了:" $R0
        Goto ic_post_cleanup_temp
      ic_post_registry_remove_partial:
        !insertmacro IC_LOG_VAR "[POSTUNINSTALL]   レジストリ経路: RMDir 後も残骸あり:" $R0
        Goto ic_post_cleanup_temp
      ic_post_registry_rmdir_failed:
        !insertmacro IC_LOG_VAR "[POSTUNINSTALL]   レジストリ経路: RMDir エラー:" $R0
        Goto ic_post_cleanup_temp
      ic_post_registry_path_missing:
        !insertmacro IC_LOG_VAR "[POSTUNINSTALL]   レジストリのパスが存在しない:" $R0
        Goto ic_post_cleanup_temp
      ic_post_no_registry:
        !insertmacro IC_LOG "[POSTUNINSTALL]   レジストリにも DataFolder が無い"
        Goto ic_post_cleanup_temp

    ic_post_cleanup_temp:
      ; レジストリキーと TEMP ファイルを削除 (ログは残す)
      Delete "$TEMP\imagecreator_data_folder.txt"
      DeleteRegKey HKCU "Software\ImageCreator"
      !insertmacro IC_LOG "[POSTUNINSTALL] TEMP ファイルとレジストリキーを削除"
      Goto ic_post_done

  ic_post_kept_user_data:
    !insertmacro IC_LOG "[POSTUNINSTALL] 判定: LOCALAPPDATA\ImageCreator が残っている → モデル・ランタイムも保持"
    ; 次回アンインストール時に古い退避を誤って使わないよう削除
    IfFileExists "$TEMP\imagecreator_data_folder.txt" 0 ic_post_done
    Delete "$TEMP\imagecreator_data_folder.txt"
    !insertmacro IC_LOG "[POSTUNINSTALL] TEMP の古い退避ファイルを削除"

  ic_post_done:
    !insertmacro IC_LOG "[POSTUNINSTALL] 完了"
    !insertmacro IC_LOG "==================================================="
!macroend
