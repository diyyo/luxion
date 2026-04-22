// =====================================================
// Copyright 2026 diyyo White | Licensed under MIT License
// Google Apps Script — AnimeStream API
// Includes: Auto-Archive + Multi-Sheet Data Fetching + Turnstile Verification (optional enforce) + Announcement
// Deploy: Web App → Execute as Me → Anyone
// =====================================================

// ─── CONFIG ───────────────────────────────────────
var SHEET_ANIME = "Anime";
var SHEET_EPISODES = "Episodes";
var ARCHIVE_PREFIX = "Archive_"; // e.g. Archive_Anime_1, Archive_Episodes_1
var ROW_LIMIT = 5000; // trigger archive when sheet hits this many DATA rows

// ─── TURNSTILE CONFIG (via Script Properties) ─────
function getScriptProp_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null || v === undefined || v === "" ? fallback : v;
}

function isTurnstileRequired_() {
  return String(getScriptProp_("REQUIRE_TURNSTILE", "0")) === "1";
}

function verifyTurnstileToken_(token, remoteIp) {
  var secret = getScriptProp_("TURNSTILE_SECRET_KEY", "");
  if (!secret) {
    return { success: false, "error-codes": ["missing-secret"] };
  }
  if (!token) {
    return { success: false, "error-codes": ["missing-input-response"] };
  }

  var payload = {
    secret: secret,
    response: token,
  };
  if (remoteIp) payload.remoteip = remoteIp;

  var res = UrlFetchApp.fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "post",
      payload: payload,
      muteHttpExceptions: true,
    },
  );

  try {
    return JSON.parse(res.getContentText() || "{}");
  } catch (e) {
    return { success: false, "error-codes": ["invalid-json"] };
  }
}

function guardTurnstile_(token, remoteIp) {
  var required = isTurnstileRequired_();

  if (!required && !token) {
    return { ok: true, mode: "bypass" };
  }

  var v = verifyTurnstileToken_(token, remoteIp);
  if (v && v.success === true) {
    return { ok: true, mode: "verified", raw: v };
  }

  if (!required) {
    return { ok: true, mode: "optional-failed", raw: v };
  }

  return { ok: false, mode: "blocked", raw: v };
}

// ─── HTTP ENTRY POINT ─────────────────────────────
function doGet(e) {
  var output;
  try {
    var action = e.parameter.action || "getAll";
    var id = e.parameter.id || "";
    var page = parseInt(e.parameter.page || "1", 10);
    var limit = parseInt(e.parameter.limit || "12", 10);

    var tsToken = e.parameter.turnstileToken || "";
    var g = guardTurnstile_(tsToken, null);
    if (!g.ok) {
      output = { error: "Turnstile invalid", details: g.raw };
      return ContentService.createTextOutput(
        JSON.stringify(output),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getAnime" && id) {
      output = getAnimeById(id);
    } else if (action === "getPage") {
      output = getAnimePage(page, limit);
    } else if (action === "getAllEpisodes") {
      output = getAllEpisodes();
    } else if (action === "getAnnouncement") {
      output = getAnnouncement();
    } else {
      output = getAllAnime();
    }
  } catch (err) {
    output = { error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ─── HTTP POST (ADMIN REST API) ───────────────────────────
function doPost(e) {
  var output = { success: false };
  var ADMIN_EMAIL = "admin@gmail.com";

  try {
    var payload = JSON.parse(e.postData.contents || "{}");
    var action = payload.action;
    var idToken = payload.idToken;

    var tsToken = payload.turnstileToken || "";
    var g = guardTurnstile_(tsToken, null);
    if (!g.ok) {
      throw new Error("Turnstile tidak valid. Silakan refresh dan coba lagi.");
    }

    if (!idToken) {
      throw new Error("Akses ditolak: Token autentikasi tidak ditemukan.");
    }

    var tokenInfoUrl =
      "https://oauth2.googleapis.com/tokeninfo?id_token=" +
      encodeURIComponent(idToken);
    var response = UrlFetchApp.fetch(tokenInfoUrl, {
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(
        "Akses ditolak: Token Google tidak valid atau sudah kedaluwarsa.",
      );
    }

    var tokenData = JSON.parse(response.getContentText());

    if (tokenData.email !== ADMIN_EMAIL) {
      throw new Error(
        "Akses ditolak: Akun " + tokenData.email + " tidak diizinkan.",
      );
    }

    if (action === "auth") {
      output = { success: true, message: "Authorized" };
    } else if (action === "getAllEpisodes") {
      output = getAllEpisodes();
    } else if (action === "getAll") {
      output = getAllAnime();
    } else if (action === "addAnime") {
      output = addRecord(SHEET_ANIME, payload.data);
    } else if (action === "updateAnime") {
      output = updateRecord(SHEET_ANIME, payload.originalId, payload.data);
    } else if (action === "deleteAnime") {
      output = deleteAnimeRecord(payload.id);
    } else if (action === "deleteAnimeSeries") {
      output = deleteAnimeSeriesRecord(payload.animeId);
    } else if (action === "addEpisode") {
      output = addRecord(SHEET_EPISODES, payload.data);
    } else if (action === "updateEpisode") {
      output = updateEpisodeRecord(
        payload.originalAnimeId,
        payload.originalEpNumber,
        payload.data,
      );
    } else if (action === "deleteEpisode") {
      output = deleteEpisodeRecord(payload.animeId, payload.epNumber);
    } else if (action === "saveAnnouncement") {
      output = saveAnnouncement(payload.data);
    } else if (action === "bulkInsert") {
      output = bulkInsertRecords(payload.table, payload.data);
    } else {
      throw new Error("Action tidak valid: " + action);
    }
  } catch (err) {
    output = { success: false, error: err.message };
  }

  if (output.data && output.success === undefined) {
    output.success = true;
  }

  return ContentService.createTextOutput(JSON.stringify(output)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// ─── PENGUMUMAN (ANNOUNCEMENT) ───────────────────────────────────

function saveAnnouncement(dataObj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Announcement");
  if (!sheet) {
    sheet = ss.insertSheet("Announcement");
    sheet.appendRow(["Message", "Type", "IsActive"]);
  }

  sheet
    .getRange(2, 1, 1, 3)
    .setValues([
      [
        dataObj.Message || "",
        dataObj.Type || "info",
        dataObj.IsActive ? "1" : "0",
      ],
    ]);
  return { success: true };
}

function getAnnouncement() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Announcement");
  if (!sheet) return { data: null };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { data: null };

  var data = sheet.getRange(2, 1, 1, 3).getValues()[0];
  return {
    data: {
      Message: data[0] || "",
      Type: data[1] || "info",
      IsActive: String(data[2]) === "1",
    },
  };
}

// ─── ADMIN CRUD HELPERS ───────────────────────────────────

function addRecord(sheetName, dataObj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet " + sheetName + " tidak ditemukan.");

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowData = headers.map(function (h) {
    return dataObj[h] || "";
  });

  sheet.appendRow(rowData);
  return { success: true };
}

function updateRecord(sheetName, originalId, dataObj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(originalId).trim()) {
      var rowData = headers.map(function (h) {
        return dataObj[h] !== undefined
          ? dataObj[h]
          : data[r][headers.indexOf(h)];
      });
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([rowData]);
      return { success: true };
    }
  }

  var archives = getArchiveNames(ss, sheetName);
  for (var i = 0; i < archives.length; i++) {
    var arcSheet = ss.getSheetByName(archives[i]);
    var arcData = arcSheet.getDataRange().getValues();
    var arcHeaders = arcData[0];
    for (var ar = 1; ar < arcData.length; ar++) {
      if (String(arcData[ar][0]).trim() === String(originalId).trim()) {
        var aRowData = arcHeaders.map(function (h) {
          return dataObj[h] !== undefined
            ? dataObj[h]
            : arcData[ar][arcHeaders.indexOf(h)];
        });
        arcSheet
          .getRange(ar + 1, 1, 1, arcHeaders.length)
          .setValues([aRowData]);
        return { success: true };
      }
    }
  }

  throw new Error("Data dengan ID " + originalId + " tidak ditemukan.");
}

function updateEpisodeRecord(origAnimeId, origEpNum, dataObj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = getEpisodeSheetNames(ss);

  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) continue;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;
    var headers = data[0];

    for (var r = 1; r < data.length; r++) {
      if (
        String(data[r][0]).trim() === String(origAnimeId).trim() &&
        String(data[r][1]).trim() === String(origEpNum).trim()
      ) {
        var rowData = headers.map(function (h) {
          return dataObj[h] !== undefined
            ? dataObj[h]
            : data[r][headers.indexOf(h)];
        });
        sheet.getRange(r + 1, 1, 1, headers.length).setValues([rowData]);
        return { success: true };
      }
    }
  }
  throw new Error("Episode tidak ditemukan.");
}

function deleteAnimeRecord(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = getAnimeSheetNames(ss);

  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) continue;
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === String(id).trim()) {
        sheet.deleteRow(r + 1);
        return { success: true };
      }
    }
  }
  throw new Error("Anime ID " + id + " tidak ditemukan.");
}

function deleteAnimeSeriesRecord(animeId) {
  if (!animeId) throw new Error("ID Anime tidak valid/kosong.");

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var animeSheetNames = getAnimeSheetNames(ss);
  var animeDeleted = false;

  for (var i = 0; i < animeSheetNames.length; i++) {
    var sheet = ss.getSheetByName(animeSheetNames[i]);
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === String(animeId).trim()) {
        sheet.deleteRow(r + 1);
        animeDeleted = true;
        break;
      }
    }
    if (animeDeleted) break;
  }

  if (!animeDeleted) {
    throw new Error(
      "Anime ID " + animeId + " tidak ditemukan (sudah terhapus?).",
    );
  }

  var epSheetNames = getEpisodeSheetNames(ss);
  var deletedEpsCount = 0;

  for (var j = 0; j < epSheetNames.length; j++) {
    var epSheet = ss.getSheetByName(epSheetNames[j]);
    if (!epSheet) continue;

    var eData = epSheet.getDataRange().getValues();
    for (var k = eData.length - 1; k >= 1; k--) {
      if (String(eData[k][0]).trim() === String(animeId).trim()) {
        epSheet.deleteRow(k + 1);
        deletedEpsCount++;
      }
    }
  }

  return {
    success: true,
    deletedAnime: true,
    deletedEpisodes: deletedEpsCount,
  };
}

function deleteEpisodeRecord(animeId, epNum) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetNames = getEpisodeSheetNames(ss);

  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) continue;
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      if (
        String(data[r][0]).trim() === String(animeId).trim() &&
        String(data[r][1]).trim() === String(epNum).trim()
      ) {
        sheet.deleteRow(r + 1);
        return { success: true };
      }
    }
  }
  throw new Error("Episode tidak ditemukan.");
}

function bulkInsertRecords(sheetName, dataArray) {
  if (!dataArray || dataArray.length === 0) return { success: true };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet " + sheetName + " tidak ditemukan.");

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowsToInsert = [];

  for (var i = 0; i < dataArray.length; i++) {
    var obj = dataArray[i];
    var rowData = headers.map(function (h) {
      return obj[h] || "";
    });
    rowsToInsert.push(rowData);
  }

  var lastRow = sheet.getLastRow();
  sheet
    .getRange(lastRow + 1, 1, rowsToInsert.length, headers.length)
    .setValues(rowsToInsert);

  return { success: true };
}

// ─── GET PAGE ───────────
function getAnimePage(page, limit) {
  var all = getAllAnime().data;
  var total = all.length;
  var totalPages = Math.max(1, Math.ceil(total / limit));
  var safePage = Math.max(1, Math.min(page, totalPages));
  var start = (safePage - 1) * limit;
  return {
    data: all.slice(start, start + limit),
    total: total,
    totalPages: totalPages,
    page: safePage,
  };
}

// ─── GET ALL ANIME ────────────────────────────────
function getAllAnime() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var allRows = [];
  var headers = null;

  var sheetNames = getAnimeSheetNames(ss);

  sheetNames.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    if (!headers) headers = data[0];
    data.slice(1).forEach(function (r) {
      if (r[0] !== "" && r[0] !== undefined) {
        allRows.push(rowToObj(headers, r));
      }
    });
  });

  allRows.reverse();
  return { data: allRows };
}

// ─── GET ALL EPISODES ──────────────────────────────
function getAllEpisodes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var allRows = [];
  var headers = null;

  var sheetNames = getEpisodeSheetNames(ss);

  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;

    if (!headers) headers = data[0];

    for (var r = 1; r < data.length; r++) {
      var rowObj = {};
      for (var col = 0; col < headers.length; col++) {
        rowObj[headers[col]] = data[r][col];
      }
      allRows.push(rowObj);
    }
  }

  allRows.reverse();
  return { data: allRows };
}

// ─── GET SINGLE ANIME + EPISODES ──────────────────
function getAnimeById(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var anime = findAnimeRow(ss, id);
  if (!anime) throw new Error("Anime not found: " + id);

  var episodes = getAllEpisodesForAnime(ss, id);
  anime.episodeList = episodes;

  return { data: anime };
}

function findAnimeRow(ss, id) {
  var sheetNames = getAnimeSheetNames(ss);
  for (var i = 0; i < sheetNames.length; i++) {
    var sheet = ss.getSheetByName(sheetNames[i]);
    if (!sheet) continue;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;
    var headers = data[0];
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === String(id).trim()) {
        return rowToObj(headers, data[r]);
      }
    }
  }
  return null;
}

function getAllEpisodesForAnime(ss, id) {
  var sheetNames = getEpisodeSheetNames(ss);
  var episodes = [];

  sheetNames.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    var headers = data[0];

    data.slice(1).forEach(function (r) {
      if (String(r[0]).trim() !== String(id).trim() || !r[1]) return;
      var ep = rowToObj(headers, r);

      var servers = [];
      [1, 2, 3].forEach(function (n) {
        var sName = ep["server" + n + "_name"];
        var sUrl = ep["server" + n + "_url"];
        if (sUrl) servers.push({ name: sName || "Server " + n, url: sUrl });
      });

      episodes.push({
        anime_id: ep.anime_id,
        ep_number: ep.ep_number,
        title: ep.ep_title || "",
        uploader: ep.uploader || "",
        date: ep.date || "",
        servers: servers,
      });
    });
  });

  return episodes;
}

function getAnimeSheetNames(ss) {
  return [SHEET_ANIME].concat(getArchiveNames(ss, SHEET_ANIME));
}

function getEpisodeSheetNames(ss) {
  return [SHEET_EPISODES].concat(getArchiveNames(ss, SHEET_EPISODES));
}

function getArchiveNames(ss, baseName) {
  var prefix = ARCHIVE_PREFIX + baseName + "_";
  var allSheets = ss.getSheets();
  var archives = [];

  allSheets.forEach(function (sh) {
    var name = sh.getName();
    if (name.indexOf(prefix) === 0) archives.push(name);
  });

  archives.sort(function (a, b) {
    var numA = parseInt(a.replace(prefix, ""), 10) || 0;
    var numB = parseInt(b.replace(prefix, ""), 10) || 0;
    return numA - numB;
  });

  return archives;
}

function runAutoArchive() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  archiveSheet(ss, SHEET_ANIME);
  archiveSheet(ss, SHEET_EPISODES);
  Logger.log("Auto-archive complete: " + new Date());
}

function archiveSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var dataRows = lastRow - 1;

  if (dataRows <= ROW_LIMIT) {
    Logger.log(sheetName + ": " + dataRows + " rows, no archive needed.");
    return;
  }

  var rowsToMove = Math.floor(dataRows / 2);
  var startRow = 2;
  var numCols = sheet.getLastColumn();

  Logger.log(
    sheetName + ": " + dataRows + " rows → archiving " + rowsToMove + " rows.",
  );

  var headers = sheet.getRange(1, 1, 1, numCols).getValues();
  var dataToMove = sheet.getRange(startRow, 1, rowsToMove, numCols).getValues();

  var arcSheet = createNextArchiveSheet(ss, sheetName, headers, numCols);

  var archLastRow = arcSheet.getLastRow();
  arcSheet
    .getRange(archLastRow + 1, 1, rowsToMove, numCols)
    .setValues(dataToMove);

  sheet.deleteRows(startRow, rowsToMove);

  Logger.log(
    "Archived " +
      rowsToMove +
      " rows from " +
      sheetName +
      " → " +
      arcSheet.getName(),
  );
}

function createNextArchiveSheet(ss, baseName, headers, numCols) {
  var archives = getArchiveNames(ss, baseName);
  var nextNum = archives.length + 1;
  var newName = ARCHIVE_PREFIX + baseName + "_" + nextNum;

  if (archives.length > 0) {
    var lastName = archives[archives.length - 1];
    var lastSheet = ss.getSheetByName(lastName);
    if (lastSheet && lastSheet.getLastRow() - 1 < ROW_LIMIT) {
      return lastSheet;
    }
  }

  var newSheet = ss.insertSheet(newName);
  newSheet.getRange(1, 1, 1, numCols).setValues(headers);
  newSheet.setFrozenRows(1);
  Logger.log("Created new archive sheet: " + newName);
  return newSheet;
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "runAutoArchive") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("runAutoArchive")
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();

  Logger.log("Trigger installed: runAutoArchive will run daily at 02:00.");
}

function rowToObj(headers, row) {
  var obj = {};
  headers.forEach(function (h, i) {
    obj[h] =
      row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : "";
  });
  return obj;
}
