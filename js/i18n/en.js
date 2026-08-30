/* English (en) — the secondary locale, and the fallback table any missing
   zh-tw key resolves through (SANGUO-DESIGN.md §6.1). Keep the key set in
   lockstep with js/i18n/zh-tw.js. */
(() => {
  "use strict";
  const ZS = (window.ZS = window.ZS || {});
  ZS.i18n._tables["en"] = {
    "app.title": "Matchstick Three Kingdoms",
    "app.subtitle": "A paper war · 194 CE",

    "menu.campaign": "New Campaign",
    "menu.continue": "Continue",
    "menu.skirmish": "Skirmish",
    "menu.load": "Load Game",
    "menu.settings": "Settings",
    "menu.about": "About",
    "menu.back": "Back",

    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.audio": "Audio",
    "settings.master": "Master",
    "settings.sfx": "Effects",
    "settings.music": "Music",
    "settings.autoResolve": "Auto-resolve battles by default",

    "locale.zh-tw": "繁體中文",
    "locale.en": "English",

    "load.title": "Load Game",
    "load.empty": "No saved games yet",
    "load.slotAuto": "Autosave",
    "load.slot": "Slot {n}",
    "load.meta": "{year} · turn {turn}",
    "load.playtime": "{time} played",
    "load.delete": "Delete",
    "load.confirmDelete": "Delete this save?",

    "about.title": "About",
    "about.body":
      "The Three Kingdoms redrawn in matchstick ink: plan the map in turns, and when two armies meet, time turns real.",
    "about.device": "Device ID",
    "about.storage": "Saves stored in",
    "about.storage.local": "this browser",
    "about.storage.memory": "memory (not kept)",
    "about.storage.remote": "the cloud",
    "about.build": "Build",

    "common.ok": "OK",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.yes": "Yes",
    "common.no": "No",
    "common.soon": "Not yet available",
    "common.on": "On",
    "common.off": "Off",

    "time.date": "{season}, {year} CE",
    "time.season.0": "Spring",
    "time.season.1": "Summer",
    "time.season.2": "Autumn",
    "time.season.3": "Winter",
    "time.hms": "{h}h {m}m",
    "time.ms": "{m}m",

    "battle.title": "Skirmish",
    "battle.stats": "yours {own} ({ownLost} dead) · theirs {foe} ({foeLost} dead) · {time}",
    "battle.hint":
      "drag to select · right-click to attack · A all · H halt · F formation · space pauses",
    "battle.hint.selected":
      "{n} selected · right-click attacks · ctrl+right marches · shift queues · ctrl+digit groups",
    "battle.win": "The field is yours",
    "battle.lose": "Your line is broken",
    "battle.result": "{dead} of theirs dead · {fled} fled",
    "battle.quit": "Leave the field",
    "battle.speed": "{n}x",
    "battle.paused": "Paused",
    "battle.form.line": "Line",
    "battle.form.column": "Column",
    "battle.form.wedge": "Wedge",
    "battle.form.square": "Square",
    "battle.form.skirmish": "Skirmish",
    "battle.type.spear": "Spearmen",
    "battle.type.dao": "Sword & shield",
    "battle.type.crossbow": "Crossbowmen",
    "battle.type.halberd": "Halberdiers",
    "battle.type.cav": "Cavalry",
    "battle.type.hbow": "Horse archers",

    "err.saveFailed": "Save failed: {code}",
    "err.loadFailed": "Load failed: {code}",
    "err.futureSave": "This save comes from a newer build and cannot be read.",
    "err.noStorage": "Local storage is unavailable — this session will not be kept.",
  };
})();
