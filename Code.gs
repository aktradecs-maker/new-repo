const ACCESS_TOKEN = 'YOUR_META_ACCESS_TOKEN';
const SPREADSHEET_ID = '1oLSp2k5J6_HnYEgLDHtm6PGgD7kwO1Dfz126laDJHic';
const TELEGRAM_BOT = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT = '8489487011';
const CLAUDE_API_KEY = 'YOUR_CLAUDE_API_KEY';

const CLIENTS = [
  { name: 'KMJ',         accountId: '1550462486370580',  tab: 'KMJ',         leadType: 'messaging', niche: 'Carpentry Murah' },
  { name: 'Evo Decor',   accountId: '338313790757128',   tab: 'Evo Decor',   leadType: 'messaging', niche: 'Kabinet Kayu Solid & Carpentry' },
  { name: 'Sendi Mahir', accountId: '545697943993963',   tab: 'Sendi Mahir', leadType: 'messaging', niche: 'ACP Awning' },
  // { name: 'Alkadapo',    accountId: '1976133606187254',  tab: 'Alkadapo',    leadType: 'messaging', niche: 'Kabinet Aluminium Modern' },
  // { name: 'MDC',         accountId: '1156797928642221',  tab: 'MDC',         leadType: 'form',      niche: 'Carpentry & Kabinet Dapur' },
  // { name: 'Infine',      accountId: '152985287666415',   tab: 'Infine',      leadType: 'form',      niche: 'Interior Design & Build' },
  // { name: 'Akar Teras',  accountId: '2428423081020215',  tab: 'AKARTERAS',   leadType: 'both',      niche: 'ACP Flooring (Design & Build)' },
  // { name: 'MNAjwa',      accountId: '2370940763338923',  tab: 'MNAjwa',      leadType: 'messaging', niche: 'Travel Agency (Umrah & Pelancongan)' },
  // { name: 'NRZ Travel',  accountId: '1012708638205954',  tab: 'NRZ Travel',  leadType: 'both',      niche: 'Travel Agency (Umrah & Pelancongan)' },
];

// --- DATE HELPERS ---

function toMYTDateStr(d) {
  return Utilities.formatDate(d, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
}

function getYesterdayMYT() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return toMYTDateStr(yesterday);
}

function toMalayDateLabel(dateStr) {
  // Parse as noon MYT to avoid DST/timezone shift
  const d = new Date(dateStr + 'T12:00:00+08:00');
  return d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
}

// --- ROW MAPPING ---

function getRowForDate(dateStr) {
  const month = parseInt(dateStr.substring(5, 7), 10);
  const day   = parseInt(dateStr.substring(8, 10), 10);
  // Row 5 = June 1, Row 35 = July 1, Row 66 = August 1
  if (month === 6) return 4 + day;        // Jun 1 = row 5
  if (month === 7) return 34 + day;       // Jul 1 = row 35
  if (month === 8) return 65 + day;       // Aug 1 = row 66
  return null;
}

// --- META API HELPERS ---

function countLeadsFromActions(actions, leadType) {
  if (!actions || !actions.length) return 0;
  const types = {
    messaging: ['messaging_conversation_started_7d', 'onsite_conversion.messaging_conversation_started_7d'],
    form:      ['lead', 'onsite_conversion.lead_grouped'],
  };
  let keys = [];
  if (leadType === 'both') {
    keys = [...types.messaging, ...types.form];
  } else {
    keys = types[leadType] || [];
  }
  let total = 0;
  actions.forEach(a => {
    if (keys.includes(a.action_type)) total += parseInt(a.value, 10) || 0;
  });
  return total;
}

function extractLeads(campaignData, leadType) {
  let total = 0;
  (campaignData || []).forEach(c => {
    const name = (c.campaign_name || '').toUpperCase();
    if (!name.includes('CBO') && !name.includes('ABO')) return;
    total += countLeadsFromActions(c.actions, leadType);
  });
  return total;
}

function fetchInsights(accountId, dateStr) {
  const url = 'https://graph.facebook.com/v19.0/act_' + accountId + '/insights'
    + '?fields=campaign_name,spend,actions'
    + '&level=campaign'
    + '&time_increment=1'
    + '&time_range=' + encodeURIComponent(JSON.stringify({ since: dateStr, until: dateStr }))
    + '&limit=200'
    + '&access_token=' + ACCESS_TOKEN;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(res.getContentText());
  return json.data || [];
}

function get7DayAdData(accountId) {
  const now = new Date();
  const endDate   = toMYTDateStr(now);
  const startDate = toMYTDateStr(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const url = 'https://graph.facebook.com/v19.0/act_' + accountId + '/insights'
    + '?fields=ad_name,campaign_name,spend,actions,impressions,clicks'
    + '&level=ad'
    + '&time_increment=1'
    + '&time_range=' + encodeURIComponent(JSON.stringify({ since: startDate, until: endDate }))
    + '&limit=200'
    + '&access_token=' + ACCESS_TOKEN;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(res.getContentText());
  return json.data || [];
}

// --- WRITE TO SHEET ---

function writeToSheet(tab, row, leads, cpl, spend) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(tab);
  if (!sheet) { Logger.log('Tab not found: ' + tab); return; }
  sheet.getRange(row, 3).setValue(leads);  // Col C = Leads
  sheet.getRange(row, 4).setValue(cpl);    // Col D = CPL
  sheet.getRange(row, 10).setValue(spend); // Col J = Daily Cost
}

// --- TELEGRAM ---

function sendTelegram(text) {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: text }),
    muteHttpExceptions: true,
  });
}

// --- CLAUDE INSIGHT ---

function getAllInsights(clientsData) {
  try {
    const prompt = clientsData.map(c => {
      const ads = c.adData || [];
      const adSummary = ads.slice(0, 10).map(a => {
        const leads = countLeadsFromActions(a.actions, c.leadType);
        return '  - ' + (a.ad_name || 'Unknown') + ': ' + leads + ' leads, RM' + parseFloat(a.spend || 0).toFixed(2) + ' spend';
      }).join('\n');
      return 'Client: ' + c.name + '\nNiche: ' + c.niche + '\nLeadType: ' + c.leadType
        + '\nYesterday: ' + c.leads + ' leads, RM' + c.spend.toFixed(2) + ' spend, CPL RM' + c.cpl.toFixed(2)
        + '\n7-Day Ad Performance:\n' + (adSummary || '  (no ad data)');
    }).join('\n\n');

    const systemMsg = 'Kau adalah pakar Facebook Ads untuk niche home improvement dan travel Malaysia. '
      + 'Berikan insight ringkas dan cadangan kreatif dalam Bahasa Melayu untuk setiap klien. '
      + 'Fokus pada: kenapa leads tinggi/rendah, creative mana perform, dan apa patut diubah. '
      + 'Jawab dalam format JSON array: [{"name":"ClientName","insight":"..."}]. '
      + 'Nama mesti tepat sama dengan nama klien yang diberikan.';

    const body = {
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemMsg,
      messages: [{ role: 'user', content: prompt }],
    };

    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });

    const raw = res.getContentText();
    Logger.log('Claude raw response: ' + raw.substring(0, 500));

    const json = JSON.parse(raw);
    if (json.error) {
      Logger.log('Claude API error: ' + JSON.stringify(json.error));
      return {};
    }

    const textContent = json.content && json.content[0] && json.content[0].text;
    if (!textContent) {
      Logger.log('Claude returned no text content');
      return {};
    }

    Logger.log('Claude text: ' + textContent.substring(0, 500));

    // Extract JSON array from response (Claude sometimes wraps in markdown)
    const match = textContent.match(/\[[\s\S]*\]/);
    if (!match) {
      Logger.log('No JSON array found in Claude response');
      return {};
    }

    const arr = JSON.parse(match[0]);
    const result = {};
    arr.forEach(item => {
      if (item.name && item.insight) {
        result[item.name] = item.insight;
      }
    });
    Logger.log('Parsed insights for: ' + Object.keys(result).join(', '));
    return result;
  } catch (e) {
    Logger.log('getAllInsights error: ' + e.toString());
    return {};
  }
}

// --- MAIN DAILY UPDATE ---

function dailyUpdate() {
  const dateStr   = getYesterdayMYT();
  const dateLabel = toMalayDateLabel(dateStr);
  const row       = getRowForDate(dateStr);

  if (!row) {
    Logger.log('No row mapping for date: ' + dateStr);
    sendTelegram('⚠️ Tiada row mapping untuk tarikh ' + dateStr);
    return;
  }

  Logger.log('Running dailyUpdate for: ' + dateStr + ' (row ' + row + ')');

  const clientsData = [];

  CLIENTS.forEach(c => {
    try {
      const data  = fetchInsights(c.accountId, dateStr);
      const leads = extractLeads(data, c.leadType);
      const spend = data.reduce((sum, d) => {
        const name = (d.campaign_name || '').toUpperCase();
        if (!name.includes('CBO') && !name.includes('ABO')) return sum;
        return sum + parseFloat(d.spend || 0);
      }, 0);
      const cpl    = leads > 0 ? spend / leads : 0;
      const adData = get7DayAdData(c.accountId);

      writeToSheet(c.tab, row, leads, parseFloat(cpl.toFixed(2)), parseFloat(spend.toFixed(2)));

      clientsData.push({ name: c.name, niche: c.niche, leadType: c.leadType, leads, spend, cpl, adData });
      Logger.log(c.name + ': leads=' + leads + ' spend=' + spend.toFixed(2));
    } catch (e) {
      Logger.log('Error for ' + c.name + ': ' + e.toString());
      clientsData.push({ name: c.name, niche: c.niche, leadType: c.leadType, leads: 0, spend: 0, cpl: 0, adData: [] });
    }
  });

  // Message 1: Data report
  let dataMsg = '📊 DAILY REPORT — ' + dateLabel + '\n';
  dataMsg += '━━━━━━━━━━━━━━━━━━━━\n';
  clientsData.forEach(c => {
    dataMsg += '\n🏢 ' + c.name + '\n';
    dataMsg += '  Leads: ' + c.leads + '\n';
    dataMsg += '  CPL: RM' + c.cpl.toFixed(2) + '\n';
    dataMsg += '  Spend: RM' + c.spend.toFixed(2) + '\n';
  });
  sendTelegram(dataMsg);

  // Message 2: Insight & Strategy
  const insights = getAllInsights(clientsData);

  let insightMsg = '🧠 INSIGHT & STRATEGY — ' + dateLabel + '\n';
  insightMsg += '━━━━━━━━━━━━━━━━━━━━\n';
  clientsData.forEach(c => {
    const insight = insights[c.name];
    insightMsg += '\n🏢 ' + c.name + '\n';
    insightMsg += (insight || 'Tiada insight tersedia.') + '\n';
  });
  sendTelegram(insightMsg);

  Logger.log('dailyUpdate complete for ' + dateStr);
}

// --- HEALTH CHECK ---

function healthCheck() {
  const dateStr = getYesterdayMYT();
  const row     = getRowForDate(dateStr);
  if (!row) { sendTelegram('⚠️ Health check: tiada row untuk ' + dateStr); return; }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const missing = [];

  CLIENTS.forEach(c => {
    const sheet = ss.getSheetByName(c.tab);
    if (!sheet) { missing.push(c.name + ' (tab missing)'); return; }
    const val = sheet.getRange(row, 3).getValue();
    if (val === '' || val === null || val === undefined) missing.push(c.name);
  });

  if (missing.length === 0) {
    sendTelegram('✅ Health check OK — semua data untuk ' + toMalayDateLabel(dateStr) + ' telah diisi.');
  } else {
    sendTelegram('⚠️ Health check GAGAL — data kosong untuk: ' + missing.join(', ') + ' (' + toMalayDateLabel(dateStr) + ')');
  }
}

// --- DEBUG ---

function debugClients() {
  const dateStr = getYesterdayMYT();
  Logger.log('Debug date (MYT yesterday): ' + dateStr);

  CLIENTS.forEach(c => {
    const data = fetchInsights(c.accountId, dateStr);
    Logger.log('\n=== ' + c.name + ' ===');
    data.forEach(d => {
      const name = (d.campaign_name || '').toUpperCase();
      const isCBO = name.includes('CBO') || name.includes('ABO');
      Logger.log('Campaign: ' + d.campaign_name + ' | CBO/ABO: ' + isCBO + ' | spend: ' + d.spend);
      if (d.actions) {
        d.actions.forEach(a => Logger.log('  action: ' + a.action_type + ' = ' + a.value));
      }
    });
    const leads = extractLeads(data, c.leadType);
    Logger.log('TOTAL LEADS: ' + leads);
  });
}

function debugInsight() {
  const dateStr = getYesterdayMYT();
  // Build minimal clientsData for one client to test Claude
  const c = CLIENTS[0];
  const data  = fetchInsights(c.accountId, dateStr);
  const leads = extractLeads(data, c.leadType);
  const spend = data.reduce((sum, d) => {
    const name = (d.campaign_name || '').toUpperCase();
    if (!name.includes('CBO') && !name.includes('ABO')) return sum;
    return sum + parseFloat(d.spend || 0);
  }, 0);
  const cpl    = leads > 0 ? spend / leads : 0;
  const adData = get7DayAdData(c.accountId);

  const clientsData = [{ name: c.name, niche: c.niche, leadType: c.leadType, leads, spend, cpl, adData }];
  const insights = getAllInsights(clientsData);
  Logger.log('Insights result: ' + JSON.stringify(insights));
}

// --- TRIGGERS ---

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailyUpdate') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyUpdate').timeBased().atHour(3).everyDays(1).create();
  Logger.log('Daily trigger set: dailyUpdate at 3am UTC (11am MYT)');
}

function setupHealthCheckTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'healthCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('healthCheck').timeBased().atHour(4).everyDays(1).create();
  Logger.log('Health check trigger set: healthCheck at 4am UTC (12pm MYT)');
}
