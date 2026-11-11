mod core;
mod store;

use chrono::Local;
use core::Config;
use serde::Serialize;
use std::sync::Mutex;
use store::{Snapshot, Store};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_notification::NotificationExt;

struct AppState {
    store: Mutex<Store>,
    background_error: Mutex<Option<String>>,
}

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("此窗口不能访问饮水数据".into())
    }
}
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
fn changed(app: &tauri::AppHandle) {
    let _ = app.emit_to("main", "data-changed", ());
}
fn store_lock(state: &AppState) -> Result<std::sync::MutexGuard<'_, Store>, String> {
    state
        .store
        .lock()
        .map_err(|_| "本地数据正在恢复，请重启应用".into())
}

#[tauri::command]
fn get_snapshot(window: WebviewWindow, state: State<AppState>) -> Result<Snapshot, String> {
    main_only(&window)?;
    store_lock(&state)?.snapshot(Local::now().timestamp_millis())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    autostart: bool,
    background_error: Option<String>,
    notification_status: &'static str,
    qa: bool,
}

#[tauri::command]
fn get_runtime_info(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<RuntimeInfo, String> {
    main_only(&window)?;
    Ok(RuntimeInfo {
        autostart: app.autolaunch().is_enabled().map_err(|e| e.to_string())?,
        background_error: state
            .background_error
            .lock()
            .map_err(|_| "状态读取失败")?
            .clone(),
        // The desktop notification plugin reports Granted even when OS settings block banners.
        // Don't label that as a verified OS permission state.
        notification_status: "system-managed",
        qa: cfg!(feature = "qa"),
    })
}

#[tauri::command]
fn save_config(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: State<AppState>,
    config: Config,
    autostart: bool,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    config.target()?;
    let previous = app.autolaunch().is_enabled().map_err(|e| e.to_string())?;
    if autostart != previous {
        if autostart {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        }
        .map_err(|e| format!("登录启动设置失败：{e}"))?;
    }
    let result = (|| {
        let mut s = store_lock(&state)?;
        let now = Local::now().timestamp_millis();
        s.save_config(&config, now)?;
        s.snapshot(now)
    })();
    if result.is_err() && autostart != previous {
        let rollback = if previous {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        if let Err(e) = rollback {
            return Err(format!(
                "配置保存失败，登录启动状态恢复失败：{e}；请在系统设置中核对"
            ));
        }
    }
    if result.is_ok() {
        changed(&app);
    }
    result
}

#[tauri::command]
fn record_water(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: State<AppState>,
    id: String,
    amount: String,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    let mut s = store_lock(&state)?;
    let now = Local::now().timestamp_millis();
    s.record(&id, &amount, now)?;
    let snapshot = s.snapshot(now)?;
    if let Some(w) = app.get_webview_window("crack") {
        let _ = w.hide();
    }
    drop(s);
    changed(&app);
    Ok(snapshot)
}

#[tauri::command]
fn skip_reminder(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<Snapshot, String> {
    main_only(&window)?;
    let s = store_lock(&state)?;
    let now = Local::now().timestamp_millis();
    s.skip(now)?;
    let snapshot = s.snapshot(now)?;
    drop(s);
    if let Some(w) = app.get_webview_window("crack") {
        let _ = w.hide();
    }
    changed(&app);
    Ok(snapshot)
}

fn play_crack(app: &tauri::AppHandle) -> Result<(), String> {
    let w = app.get_webview_window("crack").ok_or("裂纹窗口不可用")?;
    let main = app.get_webview_window("main").ok_or("主窗口不可用")?;
    let monitor = main
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("无法读取主显示器")?;
    w.set_position(*monitor.position())
        .map_err(|e| e.to_string())?;
    w.set_size(*monitor.size()).map_err(|e| e.to_string())?;
    w.set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    w.emit("crack-play", ()).map_err(|e| e.to_string())?;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if let Some(w) = handle.get_webview_window("crack") {
            let _ = w.hide();
        }
    });
    Ok(())
}

fn tick(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let s = store_lock(&state)?;
    let now = Local::now().timestamp_millis();
    let v = s.snapshot(now)?;
    if v.next_reminder_at.is_none_or(|due| due > now)
        || v.score <= 0.0
        || now < v.start
        || now >= v.end
        || v.completed
    {
        return Ok(());
    }
    let day = s.state(&v.local_date)?;
    let should_crack =
        v.score >= 100.0 && v.config.as_ref().is_some_and(|c| c.crack_enabled) && !day.cracked;
    // Persist the claim before OS delivery. A crash never replays a burst on restart.
    // OS banner delivery itself is best-effort, not an exactly-once guarantee.
    s.mark_reminder(now, should_crack)?;
    drop(s);
    let crack_result = if should_crack {
        play_crack(app)
    } else {
        Err(String::new())
    };
    let cracked = should_crack && crack_result.is_ok();
    if should_crack && !cracked {
        store_lock(&state)?.clear_crack_claim(&v.local_date)?;
    }
    let foreground = app
        .get_webview_window("main")
        .is_some_and(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false));
    let mut result = Ok(());
    if !cracked && !foreground {
        result = app
            .notification()
            .builder()
            .title(if cfg!(feature = "qa") {
                "别太干巴了 · 测试提醒"
            } else {
                "别太干巴了 · 该喝口水了"
            })
            .body(format!(
                "干巴值 {:.2}。本时段建议喝 {} mL，打开菜单栏／托盘记录。",
                v.score,
                format_ml(v.suggested_units)
            ))
            .show()
            .map_err(|e| format!("系统通知发送失败：{e}。可通过菜单栏打开应用记录。"));
    }
    if result.is_ok() {
        if let Ok(mut status) = state.background_error.lock() {
            *status = None;
        }
    }
    changed(app);
    result
}

fn format_ml(units: i64) -> String {
    let raw = format!("{}.{:02}", units / 100, units % 100);
    raw.trim_end_matches('0').trim_end_matches('.').to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            get_runtime_info,
            save_config,
            record_water,
            skip_reminder
        ])
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let path = if cfg!(feature = "qa") {
                root.join("isolated-qa")
            } else {
                root
            };
            std::fs::create_dir_all(&path)?;
            let store =
                Store::open(&path.join("hydration.sqlite3")).map_err(std::io::Error::other)?;
            let configured = store.config().map_err(std::io::Error::other)?.is_some();
            app.manage(AppState {
                store: Mutex::new(store),
                background_error: Mutex::new(None),
            });

            let overlay = WebviewWindowBuilder::new(
                app,
                "crack",
                WebviewUrl::App("index.html?overlay=1".into()),
            )
            .title("别太干巴了 · 干裂提醒")
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .focusable(false)
            .focused(false)
            .visible(false)
            .skip_taskbar(true)
            .resizable(false)
            .visible_on_all_workspaces(true)
            .build()?;
            overlay.set_ignore_cursor_events(true)?;

            let open =
                tauri::menu::MenuItem::with_id(app, "open", "打开别太干巴了", true, None::<&str>)?;
            let quit =
                tauri::menu::MenuItem::with_id(app, "quit", "退出并停止提醒", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&open, &quit])?;
            tauri::tray::TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/tray.png"
                ))?)
                .icon_as_template(true)
                .tooltip("别太干巴了")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            let notification_handle = app.handle().clone();
            let _ = app
                .notification()
                .on_action(move |_| show_main(&notification_handle));
            let main = app.get_webview_window("main").ok_or("主窗口不存在")?;
            let main_handle = main.clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = main_handle.hide();
                }
            });
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            if !configured || !std::env::args().any(|a| a == "--background") {
                show_main(app.handle());
            }

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_wall = Local::now().timestamp_millis();
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    let now = Local::now().timestamp_millis();
                    let state = handle.state::<AppState>();
                    if now < last_wall - 1000 {
                        if let Ok(s) = state.store.lock() {
                            let _ = s.skip(now);
                        }
                    }
                    last_wall = now;
                    if let Err(error) = tick(&handle) {
                        if let Ok(mut status) = state.background_error.lock() {
                            if status.as_ref() != Some(&error) {
                                eprintln!("{error}");
                                *status = Some(error.clone());
                                let _ = handle.emit_to("main", "backend-error", error);
                            }
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("应用启动失败，请检查本地数据目录的访问权限");
}
