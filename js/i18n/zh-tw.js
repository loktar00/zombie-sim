/* 繁體中文 (zh-tw) — the default locale (SANGUO-DESIGN.md §6).
   This file and js/i18n/en.js are the only places UI chrome strings live;
   people/place/skill names are bilingual data in js/campaign/data/*.js. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  ZS.i18n._tables["zh-tw"] = {
    "app.title": "火柴三國",
    "app.subtitle": "紙上亂世 · 一九四年",

    "menu.campaign": "開創霸業",
    "menu.continue": "繼續前局",
    "menu.skirmish": "沙場試鋒",
    "menu.load": "讀取進度",
    "menu.settings": "設定",
    "menu.about": "關於",
    "menu.back": "返回",

    "settings.title": "設定",
    "settings.language": "語言",
    "settings.audio": "音量",
    "settings.master": "總音量",
    "settings.sfx": "音效",
    "settings.music": "樂曲",
    "settings.autoResolve": "預設自動結算戰鬥",

    "locale.zh-tw": "繁體中文",
    "locale.en": "English",

    "load.title": "讀取進度",
    "load.empty": "尚無存檔",
    "load.slotAuto": "自動存檔",
    "load.slot": "存檔 {n}",
    "load.meta": "{year} · 第 {turn} 回合",
    "load.playtime": "遊玩 {time}",
    "load.delete": "刪除",
    "load.confirmDelete": "確定刪除此存檔？",

    "about.title": "關於",
    "about.body": "以火柴人筆觸重畫的三國亂世：地圖上按回合經營，兩軍相遇則即時開戰。",
    "about.device": "裝置識別碼",
    "about.storage": "存檔位置",
    "about.storage.local": "本機",
    "about.storage.memory": "記憶體（不會保留）",
    "about.storage.remote": "雲端",
    "about.build": "版本",

    "common.ok": "確定",
    "common.cancel": "取消",
    "common.close": "關閉",
    "common.yes": "是",
    "common.no": "否",
    "common.soon": "尚未開放",
    "common.on": "開",
    "common.off": "關",

    "time.date": "西元 {year} 年 · {season}",
    "time.season.0": "春",
    "time.season.1": "夏",
    "time.season.2": "秋",
    "time.season.3": "冬",
    "time.hms": "{h} 時 {m} 分",
    "time.ms": "{m} 分",

    "err.saveFailed": "存檔失敗：{code}",
    "err.loadFailed": "讀取失敗：{code}",
    "err.futureSave": "此存檔來自較新的版本，無法讀取。",
    "err.noStorage": "無法使用本機儲存，本次進度不會保留。",
  };
})();
