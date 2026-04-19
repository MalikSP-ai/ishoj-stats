  // ════════════════════════════════════════════════════════════════
  //  ISHØJ IF — Holdstatistik Backend
  //  Google Apps Script — CORS fixed
  // ════════════════════════════════════════════════════════════════

  const SHEET_NAME = "Data";
  const ADMIN_PASSWORD = "ishoj2026";
  const SPREADSHEET_ID = "1wJB84UlbdJzG3UGYdjUIR0C13TnYsdoGbL7O2Mg8Ado";

  function doGet(e) {
    const callback = e.parameter.callback;
    const action = e.parameter.action;
    const password = e.parameter.password;
    const data = e.parameter.data;

    let result;

    try {
      if (action === "getData") {
        result = getData();
      } else if (action === "saveData") {
        if (password !== ADMIN_PASSWORD) {
          result = { success: false, error: "Forkert kodeord" };
        } else {
          saveData(JSON.parse(data));
          result = { success: true };
        }
      } else {
        result = { error: "Ukendt action" };
      }
    } catch (err) {
      result = { success: false, error: err.toString() };
    }

    if (callback) {
      return ContentService
        .createTextOutput(callback + "(" + JSON.stringify(result) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  function doPost(e) {
    return doGet(e);
  }

  function getData() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange("A1").setValue("{}");
    }
    const raw = sheet.getRange("A1").getValue();
    try {
      return JSON.parse(raw || "{}");
    } catch(e) {
      return {};
    }
  }

  function saveData(data) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange("A1").setValue(JSON.stringify(data));
  }

  Trin:
  1. Åbn https://script.google.com → dit script
  2. Slet alt → indsæt ovenstående
  3. Gem (Ctrl+S)
  4. Deploy → Manage deployments → redeploy
