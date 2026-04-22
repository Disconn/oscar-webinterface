const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/** @type {{ target: string, basicAuthConfigured: boolean } | null} */
let meta = null;

function setStatus(html, isError = false) {
  const bar = $("#status-bar");
  bar.innerHTML = html;
  bar.classList.toggle("err", isError);
}

async function loadMeta() {
  try {
    const r = await fetch("/meta");
    meta = await r.json();
    const auth = meta.basicAuthConfigured ? "Basic-Auth: aktiv (Server-seitig)" : "Basic-Auth: aus";
    setStatus(
      `<span>Proxy-Ziel: <span class="mono">${escapeHtml(meta.target)}</span></span><span>·</span><span>${auth}</span>`,
      false,
    );
  } catch {
    setStatus('<span class="err">Konnte /meta nicht laden.</span>', true);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {string} path path starting with /
 * @param {RequestInit} [init]
 */
async function api(path, init = {}) {
  const url = `/api${path}`;
  const headers = new Headers(init.headers);
  const method = (init.method || "GET").toUpperCase();
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const r = await fetch(url, { ...init, headers });
  const ct = r.headers.get("content-type") || "";
  let bodyText = await r.text();
  /** @type {unknown} */
  let json;
  if (ct.includes("application/json")) {
    try {
      json = JSON.parse(bodyText);
    } catch {
      json = undefined;
    }
  }
  return { ok: r.ok, status: r.status, contentType: ct, text: bodyText, json };
}

async function parseError(res) {
  if (res.json && typeof res.json === "object" && res.json && "detail" in res.json) {
    return `${res.json.error || "Fehler"}: ${res.json.detail}`;
  }
  return res.text?.slice(0, 400) || `HTTP ${res.status}`;
}

function showToast(msg, isError) {
  setStatus(`<span class="${isError ? "err" : "ok"}">${escapeHtml(msg)}</span>`, isError);
}

function navTo(view) {
  if (location.hash) {
    const base = window.location.pathname + window.location.search;
    history.replaceState(null, "", base);
  }
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== `view-${view}`));
}

function userPath(ident) {
  return `/user/${encodeURIComponent(ident)}`;
}

function feedbagGroupPath(ident) {
  return `/feedbag/${encodeURIComponent(ident)}/group`;
}

/** @type {string} */
let currentDetailIdent = "";
/** @type {Record<string, unknown> | null} */
let icqDetailData = null;

function userDetailHash(ident) {
  return `#/benutzer/${encodeURIComponent(ident)}`;
}

function userBuddysHash(ident) {
  return `#/benutzer/${encodeURIComponent(ident)}/buddys`;
}

/** @returns {{ kind: "detail" | "buddys"; ident: string } | null} */
function parseRouteFromHash() {
  const bud = location.hash.match(/^#\/benutzer\/([^/]+)\/buddys$/);
  if (bud) return { kind: "buddys", ident: decodeURIComponent(bud[1]) };
  const det = location.hash.match(/^#\/benutzer\/([^/]+)$/);
  if (det) return { kind: "detail", ident: decodeURIComponent(det[1]) };
  return null;
}

function showUserDetailView(ident) {
  currentDetailIdent = ident;
  $$(".nav-btn").forEach((b) => b.classList.remove("active"));
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-user-detail"));
}

/** @type {string} */
let currentBuddysIdent = "";

function showUserBuddysView(ident) {
  currentBuddysIdent = ident;
  $$(".nav-btn").forEach((b) => b.classList.remove("active"));
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-user-buddys"));
}

function applyHashRoute() {
  const r = parseRouteFromHash();
  if (!r) return false;
  if (r.kind === "buddys") {
    showUserBuddysView(r.ident);
    loadUserBuddysPage(r.ident);
    return true;
  }
  showUserDetailView(r.ident);
  loadUserDetail(r.ident);
  return true;
}

window.addEventListener("hashchange", () => {
  if (applyHashRoute()) return;
  const act = document.querySelector(".nav-btn.active");
  if (act?.dataset.view) navTo(act.dataset.view);
  else navTo("dashboard");
});

/**
 * @param {Record<string, unknown>} d
 */
function renderIcqForm(d) {
  const b = /** @type {Record<string, unknown>} */ (d.basic_info || {});
  const m = /** @type {Record<string, unknown>} */ (d.more_info || {});
  const w = /** @type {Record<string, unknown>} */ (d.work_info || {});
  const i = /** @type {Record<string, unknown>} */ (d.interests || {});
  const a = /** @type {Record<string, unknown>} */ (d.affiliations || {});
  const p = /** @type {Record<string, unknown>} */ (d.permissions || {});
  const notes = String(d.notes ?? "");

  const num = (path, val) =>
    `<input type="number" data-icq="${path}" value="${escapeAttr(String(val ?? 0))}" />`;
  const txt = (path, val, max = 127) =>
    `<input type="text" data-icq="${path}" maxlength="${max}" value="${escapeAttr(String(val ?? ""))}" />`;
  const chk = (path, val) =>
    `<input type="checkbox" data-icq="${path}" ${val ? "checked" : ""} />`;

  $("#icq-fields").innerHTML = `
    <fieldset><legend>Grunddaten</legend><div class="field-grid">
      <label>Nickname (max 20) ${txt("basic_info.nickname", b.nickname, 20)}</label>
      <label>Vorname ${txt("basic_info.first_name", b.first_name, 64)}</label>
      <label>Nachname ${txt("basic_info.last_name", b.last_name, 64)}</label>
      <label>E-Mail ${txt("basic_info.email", b.email, 64)}</label>
      <label>Stadt ${txt("basic_info.city", b.city, 64)}</label>
      <label>Bundesland ${txt("basic_info.state", b.state, 64)}</label>
      <label>Telefon ${txt("basic_info.phone", b.phone, 30)}</label>
      <label>Fax ${txt("basic_info.fax", b.fax, 30)}</label>
      <label>Adresse ${txt("basic_info.address", b.address, 64)}</label>
      <label>Mobil ${txt("basic_info.cell_phone", b.cell_phone, 30)}</label>
      <label>PLZ ${txt("basic_info.zip", b.zip, 12)}</label>
      <label>Country-Code ${num("basic_info.country_code", b.country_code)}</label>
      <label>GMT-Offset ${num("basic_info.gmt_offset", b.gmt_offset)}</label>
      <label style="flex-direction:row;align-items:center;gap:0.5rem;text-transform:none">
        ${chk("basic_info.publish_email", b.publish_email)} <span style="color:var(--text)">E-Mail veröffentlichen</span>
      </label>
    </div></fieldset>
    <fieldset><legend>Weitere Daten</legend><div class="field-grid">
      <label>Geschlecht (0/1/2) ${num("more_info.gender", m.gender)}</label>
      <label>Homepage ${txt("more_info.homepage", m.homepage, 127)}</label>
      <label>Geb.-Jahr ${num("more_info.birth_year", m.birth_year)}</label>
      <label>Geb.-Monat ${num("more_info.birth_month", m.birth_month)}</label>
      <label>Geb.-Tag ${num("more_info.birth_day", m.birth_day)}</label>
      <label>Sprache 1 ${num("more_info.lang1", m.lang1)}</label>
      <label>Sprache 2 ${num("more_info.lang2", m.lang2)}</label>
      <label>Sprache 3 ${num("more_info.lang3", m.lang3)}</label>
    </div></fieldset>
    <fieldset><legend>Beruf</legend><div class="field-grid">
      <label>Firma ${txt("work_info.company", w.company, 64)}</label>
      <label>Abteilung ${txt("work_info.department", w.department, 64)}</label>
      <label>Position ${txt("work_info.position", w.position, 64)}</label>
      <label>Berufscode ${num("work_info.occupation_code", w.occupation_code)}</label>
      <label>Adresse ${txt("work_info.address", w.address, 64)}</label>
      <label>Stadt ${txt("work_info.city", w.city, 64)}</label>
      <label>Bundesland ${txt("work_info.state", w.state, 64)}</label>
      <label>PLZ ${txt("work_info.zip", w.zip, 12)}</label>
      <label>Country-Code ${num("work_info.country_code", w.country_code)}</label>
      <label>Telefon ${txt("work_info.phone", w.phone, 30)}</label>
      <label>Fax ${txt("work_info.fax", w.fax, 30)}</label>
      <label>Web ${txt("work_info.web_page", w.web_page, 127)}</label>
    </div></fieldset>
    <fieldset><legend>Notizen</legend>
      <label style="max-width:100%">Text (max 450)
        <textarea data-icq="notes" rows="4" maxlength="450">${escapeHtml(notes)}</textarea>
      </label>
    </fieldset>
    <fieldset><legend>Interessen</legend><div class="field-grid">
      <label>Code 1 ${num("interests.code1", i.code1)}</label><label>Keyword 1 ${txt("interests.keyword1", i.keyword1, 64)}</label>
      <label>Code 2 ${num("interests.code2", i.code2)}</label><label>Keyword 2 ${txt("interests.keyword2", i.keyword2, 64)}</label>
      <label>Code 3 ${num("interests.code3", i.code3)}</label><label>Keyword 3 ${txt("interests.keyword3", i.keyword3, 64)}</label>
      <label>Code 4 ${num("interests.code4", i.code4)}</label><label>Keyword 4 ${txt("interests.keyword4", i.keyword4, 64)}</label>
    </div></fieldset>
    <fieldset><legend>Zugehörigkeiten</legend><div class="field-grid">
      <label>Past Code 1 ${num("affiliations.past_code1", a.past_code1)}</label>
      <label>Past Keyword 1 ${txt("affiliations.past_keyword1", a.past_keyword1, 64)}</label>
      <label>Past Code 2 ${num("affiliations.past_code2", a.past_code2)}</label>
      <label>Past Keyword 2 ${txt("affiliations.past_keyword2", a.past_keyword2, 64)}</label>
      <label>Past Code 3 ${num("affiliations.past_code3", a.past_code3)}</label>
      <label>Past Keyword 3 ${txt("affiliations.past_keyword3", a.past_keyword3, 64)}</label>
      <label>Current Code 1 ${num("affiliations.current_code1", a.current_code1)}</label>
      <label>Current Keyword 1 ${txt("affiliations.current_keyword1", a.current_keyword1, 64)}</label>
      <label>Current Code 2 ${num("affiliations.current_code2", a.current_code2)}</label>
      <label>Current Keyword 2 ${txt("affiliations.current_keyword2", a.current_keyword2, 64)}</label>
      <label>Current Code 3 ${num("affiliations.current_code3", a.current_code3)}</label>
      <label>Current Keyword 3 ${txt("affiliations.current_keyword3", a.current_keyword3, 64)}</label>
    </div></fieldset>
    <fieldset><legend>Berechtigungen</legend><div class="field-grid" style="grid-template-columns:1fr">
      <label style="flex-direction:row;align-items:center;gap:0.5rem;text-transform:none">
        ${chk("permissions.auth_required", p.auth_required)} <span style="color:var(--text)">Auth erforderlich</span>
      </label>
      <label style="flex-direction:row;align-items:center;gap:0.5rem;text-transform:none">
        ${chk("permissions.web_aware", p.web_aware)} <span style="color:var(--text)">Web aware</span>
      </label>
      <label style="flex-direction:row;align-items:center;gap:0.5rem;text-transform:none">
        ${chk("permissions.allow_spam", p.allow_spam)} <span style="color:var(--text)">Spam erlauben</span>
      </label>
    </div></fieldset>`;
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} base
 */
function collectIcqFromForm(root, base) {
  const out = structuredClone(base);
  root.querySelectorAll("[data-icq]").forEach((el) => {
    const path = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (el).dataset.icq;
    if (!path) return;
    const parts = path.split(".");
    let o = /** @type {Record<string, unknown>} */ (out);
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!o[key] || typeof o[key] !== "object") o[key] = {};
      o = /** @type {Record<string, unknown>} */ (o[key]);
    }
    const last = parts[parts.length - 1];
    if (el.type === "checkbox") o[last] = el.checked;
    else if (el.type === "number") o[last] = el.value === "" ? 0 : Number(el.value);
    else if (el.tagName === "TEXTAREA") o[last] = /** @type {HTMLTextAreaElement} */ (el).value;
    else o[last] = /** @type {HTMLInputElement} */ (el).value;
  });
  return out;
}

/**
 * @param {Array<{ group_id: number; group_name: string; buddies: Array<{ name: string; item_id: number }> }>} groups
 */
/**
 * @param {Array<{ group_id: number; group_name: string; buddies?: Array<{ name: string; item_id: number }> }>} groups
 */
function renderFeedbag(groups) {
  const wrap = $("#feedbag-groups");
  const sel = $("#buddy-add-group");
  sel.innerHTML = "";
  wrap.innerHTML = "";
  if (!groups.length) {
    wrap.innerHTML = '<p class="empty">Keine Gruppen (oder noch keine Feedbag-Daten).</p>';
    return;
  }

  for (const g of groups) {
    const box = document.createElement("div");
    box.className = "feedbag-group";
    const h = document.createElement("h3");
    h.innerHTML = `${escapeHtml(g.group_name || "(ohne Name)")} <span class="mono">(Gruppe ${g.group_id})</span>`;
    box.appendChild(h);

    const buds = g.buddies || [];
    if (!buds.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.style.margin = "0";
      p.textContent = "Keine Buddys in dieser Gruppe.";
      box.appendChild(p);
    } else {
      for (const bud of buds) {
        const line = document.createElement("div");
        line.className = "buddy-line";
        const nameSpan = document.createElement("span");
        nameSpan.className = "mono";
        nameSpan.textContent = bud.name;
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = `item ${bud.item_id}`;
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-danger";
        del.textContent = "Entfernen";
        del.addEventListener("click", async () => {
          if (!confirm(`Buddy „${bud.name}“ entfernen?`)) return;
          const path = `/feedbag/${encodeURIComponent(currentDetailIdent)}/group/${encodeURIComponent(String(g.group_id))}/buddy/${encodeURIComponent(bud.name)}`;
          const res = await api(path, { method: "DELETE" });
          if (res.ok || res.status === 204) {
            showToast("Buddy entfernt.", false);
            await loadFeedbagForDetail();
          } else showToast(await parseError(res), true);
        });
        line.appendChild(nameSpan);
        line.appendChild(pill);
        line.appendChild(del);
        box.appendChild(line);
      }
    }
    wrap.appendChild(box);

    if (g.group_id !== 0) {
      const o = document.createElement("option");
      o.value = String(g.group_id);
      o.textContent = `${g.group_name || "Gruppe"} (${g.group_id})`;
      sel.appendChild(o);
    }
  }
}

async function loadFeedbagForDetail() {
  const ident = currentDetailIdent;
  const res = await api(feedbagGroupPath(ident));
  if (res.status === 404) {
    renderFeedbag([]);
    $("#buddy-add-group").innerHTML = "";
    return;
  }
  if (!res.ok) {
    $("#feedbag-groups").innerHTML = `<p class="empty">${escapeHtml(await parseError(res))}</p>`;
    return;
  }
  const groups = /** @type {Array<{ group_id: number; group_name: string; buddies: unknown[] }>} */ (res.json);
  renderFeedbag(Array.isArray(groups) ? groups : []);
}

async function loadUserDetail(ident) {
  currentDetailIdent = ident;
  const accRes = await api(`${userPath(ident)}/account`);
  if (!accRes.ok) {
    showToast(await parseError(accRes), true);
    navTo("users");
    return;
  }
  const acc = /** @type {Record<string, unknown>} */ (accRes.json);

  $("#user-detail-title").textContent = `Benutzer: ${acc.screen_name || ident}`;
  $("#user-detail-sub").textContent = `Ident ${ident} · ${acc.is_icq ? "ICQ" : "AIM"}`;
  $("#detail-ident").value = String(acc.id ?? ident);
  $("#detail-screen").value = String(acc.screen_name ?? "");
  $("#detail-email").value = String(acc.email_address ?? "");
  $("#detail-reg").value = String(acc.reg_status ?? "");
  $("#detail-confirmed").value = acc.confirmed ? "ja" : "nein";
  $("#detail-profile").value = String(acc.profile ?? "");
  $("#detail-password").value = "";

  const sus = String(acc.suspended_status || "");
  $("#detail-suspended").value = ["", "deleted", "expired", "suspended", "suspended_age"].includes(sus) ? sus : "";
  $("#detail-bot").checked = Boolean(acc.is_bot);

  const iconA = $("#detail-icon-link");
  iconA.href = `/api${userPath(ident)}/icon`;

  const icqPanel = $("#panel-icq-profile");
  if (acc.is_icq) {
    icqPanel.classList.remove("hidden");
    const icqRes = await api(`${userPath(ident)}/icq`);
    if (icqRes.ok && icqRes.json) {
      icqDetailData = /** @type {Record<string, unknown>} */ (icqRes.json);
      renderIcqForm(icqDetailData);
    } else {
      icqDetailData = null;
      $("#icq-fields").innerHTML = `<p class="empty">${escapeHtml(icqRes.ok ? "Keine Daten" : await parseError(icqRes))}</p>`;
    }
  } else {
    icqPanel.classList.add("hidden");
    icqDetailData = null;
    $("#icq-fields").innerHTML = "";
  }

  await loadFeedbagForDetail();
}

$("#btn-user-detail-back")?.addEventListener("click", () => navTo("users"));
$("#btn-user-detail-buddys")?.addEventListener("click", () => {
  if (currentDetailIdent) location.hash = userBuddysHash(currentDetailIdent);
});

$("#btn-user-buddys-back-users")?.addEventListener("click", () => navTo("users"));
$("#btn-user-buddys-back-detail")?.addEventListener("click", () => {
  if (currentBuddysIdent) location.hash = userDetailHash(currentBuddysIdent);
});
$("#btn-buddy-admin-reload")?.addEventListener("click", () => {
  if (currentBuddysIdent) loadUserBuddysPage(currentBuddysIdent);
});

/**
 * @param {HTMLElement} tlvContainer
 */
function appendTlvRow(tlvContainer, tag, valueHex) {
  const row = document.createElement("div");
  row.className = "tlv-row";
  row.innerHTML = `
    <input type="number" class="tlv-tag" min="0" max="65535" step="1" value="${tag !== undefined && tag !== "" ? escapeAttr(String(tag)) : ""}" placeholder="Tag" />
    <textarea class="tlv-hex" rows="2" placeholder="value_hex (gerade Anzahl hex Zeichen)">${escapeHtml(valueHex ?? "")}</textarea>
    <button type="button" class="btn btn-danger tlv-remove">✕</button>`;
  row.querySelector(".tlv-remove")?.addEventListener("click", () => row.remove());
  tlvContainer.appendChild(row);
}

/**
 * @param {HTMLElement} card
 */
function collectTlvsFromCard(card) {
  /** @type {Array<{ tag: number; value_hex: string }>} */
  const tlvs = [];
  card.querySelectorAll(".tlv-row").forEach((row) => {
    const tagEl = /** @type {HTMLInputElement} */ (row.querySelector(".tlv-tag"));
    const hexEl = /** @type {HTMLTextAreaElement} */ (row.querySelector(".tlv-hex"));
    const tagStr = tagEl?.value?.trim() ?? "";
    const hex = hexEl?.value?.trim().replace(/\s+/g, "") ?? "";
    if (!tagStr && !hex) return;
    const tag = Number(tagStr);
    if (!Number.isFinite(tag) || tag < 0 || tag > 65535) {
      throw new Error("Ungültiger TLV-Tag (0–65535).");
    }
    if (hex.length % 2 !== 0) {
      throw new Error(`value_hex muss eine gerade Zeichenanzahl haben (Tag ${tag}).`);
    }
    if (!/^[0-9a-fA-F]*$/.test(hex)) {
      throw new Error(`value_hex nur hex Zeichen (Tag ${tag}).`);
    }
    tlvs.push({ tag: Math.floor(tag), value_hex: hex });
  });
  return tlvs;
}

/**
 * @param {string} ident
 */
async function loadUserBuddysPage(ident) {
  currentBuddysIdent = ident;
  $("#buddy-admin-title").textContent = `Buddyliste · ${ident}`;
  const root = $("#buddy-admin-root");
  root.innerHTML = "<p class=\"empty\">Lade…</p>";
  const res = await api(feedbagGroupPath(ident));
  if (res.status === 404) {
    root.innerHTML =
      '<p class="empty">Keine Feedbag-Daten (404). Z. B. mit AIM anmelden oder zuerst Buddys anlegen.</p>';
    return;
  }
  if (!res.ok) {
    root.innerHTML = `<p class="empty">${escapeHtml(await parseError(res))}</p>`;
    return;
  }
  const groups = /** @type {Array<{ group_id: number; group_name: string; buddies?: unknown[] }>} */ (res.json);
  if (!Array.isArray(groups) || groups.length === 0) {
    root.innerHTML = '<p class="empty">Keine Buddy-Gruppen.</p>';
    return;
  }
  root.innerHTML = "";
  for (const g of groups) {
    const panel = document.createElement("div");
    panel.className = "panel";
    const h = document.createElement("h2");
    h.textContent = `${g.group_name || "(Gruppe)"} · ID ${g.group_id}`;
    panel.appendChild(h);
    const buds = /** @type {Array<Record<string, unknown>>} */ (g.buddies || []);
    if (!buds.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Keine Buddys in dieser Gruppe.";
      panel.appendChild(p);
    } else {
      for (const bud of buds) {
        const card = document.createElement("div");
        card.className = "buddy-card";
        card.dataset.groupId = String(g.group_id);
        card.dataset.itemId = String(bud.item_id);
        const tlvs = /** @type {Array<{ tag?: number; value_hex?: string }>} */ (bud.tlvs || []);
        const meta = document.createElement("div");
        meta.className = "field-grid";
        meta.style.marginBottom = "0.5rem";
        meta.innerHTML = `
          <label>Item-ID <input class="buddy-meta-itemid" readonly value="${escapeAttr(String(bud.item_id))}" /></label>
          <label>Gruppe <input class="buddy-meta-gid" readonly value="${escapeAttr(String(bud.group_id ?? g.group_id))}" /></label>
          <label>Klasse (ClassID) <input class="buddy-meta-class" readonly value="${escapeAttr(String(bud.class_id ?? ""))}" /></label>`;
        const nameLab = document.createElement("label");
        nameLab.textContent = "Buddy-Name (Screen / UIN)";
        const nameInp = document.createElement("input");
        nameInp.className = "buddy-name-inp";
        nameInp.value = String(bud.name ?? "");
        nameInp.autocomplete = "off";
        nameLab.appendChild(nameInp);
        const tlvWrap = document.createElement("div");
        tlvWrap.innerHTML = "<strong>TLVs</strong>";
        const tlvBox = document.createElement("div");
        tlvBox.className = "tlv-rows";
        if (tlvs.length === 0) appendTlvRow(tlvBox, "", "");
        else for (const t of tlvs) appendTlvRow(tlvBox, t.tag, t.value_hex);
        const tlvBtnRow = document.createElement("div");
        tlvBtnRow.className = "row";
        const addTlv = document.createElement("button");
        addTlv.type = "button";
        addTlv.className = "btn btn-ghost";
        addTlv.textContent = "TLV-Zeile";
        addTlv.addEventListener("click", () => appendTlvRow(tlvBox, "", ""));
        tlvBtnRow.appendChild(addTlv);
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "btn btn-primary";
        saveBtn.textContent = "Speichern";
        saveBtn.addEventListener("click", async () => {
          try {
            const name = nameInp.value.trim();
            if (!name) {
              showToast("Name erforderlich.", true);
              return;
            }
            const tlvsOut = collectTlvsFromCard(card);
            const gid = card.dataset.groupId;
            const iid = card.dataset.itemId;
            const path = `/feedbag/${encodeURIComponent(ident)}/group/${encodeURIComponent(gid || "")}/buddy/item/${encodeURIComponent(iid || "")}`;
            const pr = await api(path, {
              method: "PATCH",
              body: JSON.stringify({ name, tlvs: tlvsOut }),
            });
            if (pr.ok || pr.status === 204) {
              showToast("Buddy gespeichert.", false);
              await loadUserBuddysPage(ident);
            } else showToast(await parseError(pr), true);
          } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), true);
          }
        });
        tlvBtnRow.appendChild(saveBtn);
        card.appendChild(meta);
        card.appendChild(nameLab);
        card.appendChild(tlvWrap);
        card.appendChild(tlvBox);
        card.appendChild(tlvBtnRow);
        panel.appendChild(card);
      }
    }
    root.appendChild(panel);
  }
}

$("#btn-save-account")?.addEventListener("click", async () => {
  const ident = currentDetailIdent;
  const body = {
    suspended_status: $("#detail-suspended").value,
    is_bot: $("#detail-bot").checked,
  };
  const res = await api(`${userPath(ident)}/account`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (res.status === 204 || res.status === 304) {
    showToast("Konto gespeichert.", false);
    loadUsers();
  } else showToast(await parseError(res), true);
});

$("#btn-save-password")?.addEventListener("click", async () => {
  const pw = $("#detail-password").value;
  if (!pw) {
    showToast("Passwort eingeben.", true);
    return;
  }
  const res = await api("/user/password", {
    method: "PUT",
    body: JSON.stringify({ screen_name: currentDetailIdent, password: pw }),
  });
  if (res.ok || res.status === 204) {
    $("#detail-password").value = "";
    showToast("Passwort gesetzt.", false);
  } else showToast(await parseError(res), true);
});

$("#btn-save-icq")?.addEventListener("click", async () => {
  if (!icqDetailData) return;
  const root = $("#icq-fields");
  const body = collectIcqFromForm(root, icqDetailData);
  const res = await api(`${userPath(currentDetailIdent)}/icq`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (res.ok || res.status === 204) {
    showToast("ICQ-Profil gespeichert.", false);
    await loadUserDetail(currentDetailIdent);
  } else showToast(await parseError(res), true);
});

$("#btn-reload-feedbag")?.addEventListener("click", () => loadFeedbagForDetail());

$("#btn-buddy-add")?.addEventListener("click", async () => {
  const gid = $("#buddy-add-group").value;
  const name = $("#buddy-add-name").value.trim();
  if (!gid || !name) {
    showToast("Gruppe und Buddy angeben.", true);
    return;
  }
  const path = `/feedbag/${encodeURIComponent(currentDetailIdent)}/group/${encodeURIComponent(gid)}/buddy/${encodeURIComponent(name)}`;
  const res = await api(path, { method: "PUT" });
  if (res.ok || res.status === 201) {
    $("#buddy-add-name").value = "";
    showToast("Buddy hinzugefügt.", false);
    await loadFeedbagForDetail();
  } else showToast(await parseError(res), true);
});

$("#btn-detail-kick")?.addEventListener("click", async () => {
  if (!confirm("Alle Sitzungen dieses Benutzers trennen?")) return;
  const res = await api(`/session/${encodeURIComponent(currentDetailIdent)}`, { method: "DELETE" });
  if (res.ok || res.status === 204) showToast("Getrennt.", false);
  else showToast(await parseError(res), true);
});

function formatAccountStatusGerman(suspendedRaw) {
  const s = String(suspendedRaw || "").trim();
  const map = {
    "": "Aktiv",
    deleted: "Gelöscht",
    expired: "Abgelaufen",
    suspended: "Gesperrt",
    suspended_age: "Alterssperre",
  };
  return map[s] ?? (s ? s : "Aktiv");
}

/**
 * @param {Record<string, unknown> | undefined} sess
 */
function formatPresenceGerman(sess) {
  if (!sess) return "Offline";
  const inv = sess.is_invisible ? ", unsichtbar" : "";
  if (sess.is_away) return `Away${inv}`;
  return `Online${inv}`;
}

/**
 * @param {Record<string, unknown> | undefined} sess
 */
function summarizeClients(sess) {
  if (!sess) return "—";
  const inst = /** @type {Array<Record<string, unknown>>} */ (sess.instances || []);
  const ids = [];
  for (const i of inst) {
    const cid = i.client_id;
    if (typeof cid === "string" && cid.trim()) ids.push(cid.trim());
  }
  const uniq = [...new Set(ids)];
  if (uniq.length) return uniq.join(" · ");
  return "verbunden (keine Client-ID)";
}

async function loadUsers() {
  const [ures, sres] = await Promise.all([api("/user"), api("/session")]);
  const tbody = $("#table-users tbody");
  tbody.innerHTML = "";
  $("#users-empty").classList.toggle("hidden", ures.ok);
  if (!ures.ok) {
    showToast(await parseError(ures), true);
    return;
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const sessionById = new Map();
  if (sres.ok && sres.json && typeof sres.json === "object") {
    const list = /** @type {{ sessions?: Array<Record<string, unknown>> }} */ (sres.json).sessions;
    if (Array.isArray(list)) {
      for (const s of list) sessionById.set(String(s.id), s);
    }
  }

  const users = /** @type {Array<Record<string, unknown>>} */ (ures.json);
  if (!Array.isArray(users) || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Keine Benutzer.</td></tr>`;
    return;
  }
  for (const u of users) {
    const id = String(u.id);
    const sn = String(u.screen_name);
    const sess = sessionById.get(id);
    const accountLabel = formatAccountStatusGerman(u.suspended_status);
    const presence = formatPresenceGerman(sess);
    const clients = summarizeClients(sess);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(id)}</td>
      <td>${escapeHtml(sn)}</td>
      <td><span class="pill ${u.is_icq ? "icq" : "aim"}">${u.is_icq ? "ICQ" : "AIM"}</span></td>
      <td>${escapeHtml(accountLabel)}</td>
      <td><span class="pill ${sess ? (sess.is_away ? "away" : "online") : "offline"}">${escapeHtml(presence)}</span></td>
      <td class="client-cell" title="${escapeAttr(clients)}">${escapeHtml(clients)}</td>
      <td>${u.is_bot ? "ja" : "nein"}</td>
      <td class="actions"></td>`;
    const actions = tr.querySelector(".actions");
    const mkBtn = (label, cls, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.addEventListener("click", onClick);
      actions.appendChild(b);
    };
    mkBtn("Details", "btn-primary", () => {
      location.hash = userDetailHash(id);
    });
    mkBtn("Buddys", "btn-ghost", () => {
      location.hash = userBuddysHash(id);
    });
    mkBtn("Trennen", "btn-ghost", async () => {
      if (!confirm(`Sitzung von ${sn} trennen?`)) return;
      const dr = await api(`/session/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (dr.ok || dr.status === 204) showToast("Sitzung getrennt.", false);
      else showToast(await parseError(dr), true);
      loadSessions();
    });
    mkBtn("Löschen", "btn-danger", async () => {
      if (!confirm(`Benutzer ${sn} wirklich löschen?`)) return;
      const dr = await api("/user", {
        method: "DELETE",
        body: JSON.stringify({ screen_name: id }),
      });
      if (dr.ok || dr.status === 204) {
        showToast("Benutzer gelöscht.", false);
        loadUsers();
      } else showToast(await parseError(dr), true);
    });
    tbody.appendChild(tr);
  }
}

async function loadSessions() {
  const res = await api("/session");
  const tbody = $("#table-sessions tbody");
  tbody.innerHTML = "";
  if (!res.ok) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(await parseError(res))}</td></tr>`;
    return;
  }
  const data = /** @type {{ count?: number; sessions?: Array<Record<string, unknown>> }} */ (res.json);
  const sessions = data.sessions || [];
  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Keine aktiven Sitzungen.</td></tr>`;
    return;
  }
  for (const s of sessions) {
    const id = String(s.id);
    const tr = document.createElement("tr");
    const away = s.is_away ? "Away" : "Online";
    const inv = s.is_invisible ? ", unsichtbar" : "";
    tr.innerHTML = `
      <td>${escapeHtml(String(s.screen_name))} <span class="mono">(${escapeHtml(id)})</span></td>
      <td>${Number(s.online_seconds) || 0}</td>
      <td>${Number(s.instance_count) || 0}</td>
      <td>${away}${inv}</td>
      <td></td>`;
    const td = tr.querySelector("td:last-child");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-danger";
    b.textContent = "Trennen";
    b.addEventListener("click", async () => {
      const dr = await api(`/session/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (dr.ok || dr.status === 204) {
        showToast("Getrennt.", false);
        loadSessions();
      } else showToast(await parseError(dr), true);
    });
    td.appendChild(b);
    tbody.appendChild(tr);
  }
}

function roomRow(room, { showDelete }) {
  const parts = (room.participants || [])
    .map((p) => escapeHtml(String(p.screen_name || p.id)))
    .join(", ");
  const url = escapeHtml(String(room.url || ""));
  const name = escapeHtml(String(room.name));
  const del = showDelete
    ? `<button type="button" class="btn btn-danger btn-del-room" data-name="${escapeHtml(String(room.name))}">Löschen</button>`
    : "—";
  return `<tr>
    <td>${name}</td>
    <td>${parts || "—"}</td>
    <td class="mono" style="max-width:220px;word-break:break-all"><a href="${url}" target="_blank" rel="noopener">${url}</a></td>
    <td>${del}</td>
  </tr>`;
}

async function loadRooms() {
  const res = await api("/chat/room/public");
  const tbody = $("#table-rooms tbody");
  tbody.innerHTML = "";
  if (!res.ok) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">${escapeHtml(await parseError(res))}</td></tr>`;
    return;
  }
  const rooms = /** @type {Array<Record<string, unknown>>} */ (res.json);
  if (!Array.isArray(rooms) || rooms.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">Keine öffentlichen Räume.</td></tr>`;
    return;
  }
  tbody.innerHTML = rooms.map((r) => roomRow(r, { showDelete: true })).join("");
  tbody.querySelectorAll(".btn-del-room").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = btn.getAttribute("data-name");
      if (!name || !confirm(`Raum „${name}“ löschen?`)) return;
      const dr = await api("/chat/room/public", {
        method: "DELETE",
        body: JSON.stringify({ names: [name] }),
      });
      if (dr.ok || dr.status === 204) {
        showToast("Raum gelöscht.", false);
        loadRooms();
      } else showToast(await parseError(dr), true);
    });
  });
}

async function loadPrivateRooms() {
  const res = await api("/chat/room/private");
  const tbody = $("#table-private-rooms tbody");
  tbody.innerHTML = "";
  if (!res.ok) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">${escapeHtml(await parseError(res))}</td></tr>`;
    return;
  }
  const rooms = /** @type {Array<Record<string, unknown>>} */ (res.json);
  if (!Array.isArray(rooms) || rooms.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty">Keine privaten Räume.</td></tr>`;
    return;
  }
  tbody.innerHTML = rooms
    .map((r) => {
      const parts = (r.participants || [])
        .map((p) => escapeHtml(String(p.screen_name || p.id)))
        .join(", ");
      const url = escapeHtml(String(r.url || ""));
      const name = escapeHtml(String(r.name));
      const creator = escapeHtml(String(r.creator_id || "—"));
      return `<tr><td>${name}</td><td>${creator}</td><td>${parts || "—"}</td><td class="mono" style="max-width:220px;word-break:break-all"><a href="${url}" target="_blank" rel="noopener">${url}</a></td></tr>`;
    })
    .join("");
}

async function loadWebApiKeys() {
  const res = await api("/admin/webapi/keys");
  const tbody = $("#table-keys tbody");
  tbody.innerHTML = "";
  if (!res.ok) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(await parseError(res))}</td></tr>`;
    return;
  }
  const keys = /** @type {Array<Record<string, unknown>>} */ (res.json);
  if (!Array.isArray(keys) || keys.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">Keine Schlüssel.</td></tr>`;
    return;
  }
  for (const k of keys) {
    const devId = String(k.dev_id);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(devId)}</td>
      <td>${escapeHtml(String(k.app_name))}</td>
      <td>${k.is_active ? "ja" : "nein"}</td>
      <td>${escapeHtml(String(k.rate_limit ?? "—"))}</td>
      <td class="actions"></td>`;
    const act = tr.querySelector(".actions");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "btn btn-ghost";
    toggle.textContent = k.is_active ? "Deaktivieren" : "Aktivieren";
    toggle.addEventListener("click", async () => {
      const dr = await api(`/admin/webapi/keys/${encodeURIComponent(devId)}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !k.is_active }),
      });
      if (dr.ok) {
        showToast("Schlüssel aktualisiert.", false);
        loadWebApiKeys();
      } else showToast(await parseError(dr), true);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-danger";
    del.textContent = "Löschen";
    del.addEventListener("click", async () => {
      if (!confirm("Schlüssel endgültig löschen?")) return;
      const dr = await api(`/admin/webapi/keys/${encodeURIComponent(devId)}`, { method: "DELETE" });
      if (dr.ok || dr.status === 204) {
        showToast("Gelöscht.", false);
        loadWebApiKeys();
      } else showToast(await parseError(dr), true);
    });
    act.appendChild(toggle);
    act.appendChild(del);
    tbody.appendChild(tr);
  }
}

async function loadDirectory() {
  const res = await api("/directory/category");
  const root = $("#directory-tree");
  root.innerHTML = "";
  if (!res.ok) {
    root.innerHTML = `<p class="empty">${escapeHtml(await parseError(res))}</p>`;
    return;
  }
  const cats = /** @type {Array<{ id: number; name: string }>} */ (res.json);
  if (!Array.isArray(cats) || cats.length === 0) {
    root.innerHTML = `<p class="empty">Keine Kategorien.</p>`;
    return;
  }
  for (const c of cats) {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.style.marginBottom = "0.75rem";
    wrap.innerHTML = `<h2 style="margin-bottom:0.5rem">${escapeHtml(c.name)} <span class="mono">(id ${c.id})</span></h2>`;
    const kwRes = await api(`/directory/category/${c.id}/keyword`);
    const ul = document.createElement("ul");
    ul.style.margin = "0";
    ul.style.paddingLeft = "1.2rem";
    if (kwRes.ok && Array.isArray(kwRes.json)) {
      for (const kw of kwRes.json) {
        const li = document.createElement("li");
        li.innerHTML = `${escapeHtml(String(kw.name))} <button type="button" class="btn btn-danger" style="font-size:0.7rem;padding:0.1rem 0.35rem">Keyword löschen</button>`;
        const delBtn = li.querySelector("button");
        delBtn.addEventListener("click", async () => {
          if (!confirm("Keyword löschen?")) return;
          const dr = await api(`/directory/keyword/${kw.id}`, { method: "DELETE" });
          if (dr.ok || dr.status === 204) {
            showToast("Keyword gelöscht.", false);
            loadDirectory();
          } else showToast(await parseError(dr), true);
        });
        ul.appendChild(li);
      }
    }
    const addRow = document.createElement("div");
    addRow.className = "row";
    addRow.style.marginTop = "0.5rem";
    const inp = document.createElement("input");
    inp.placeholder = "Neues Keyword";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.textContent = "Hinzufügen";
    btn.addEventListener("click", async () => {
      const name = inp.value.trim();
      if (!name) return;
      const dr = await api("/directory/keyword", {
        method: "POST",
        body: JSON.stringify({ category_id: c.id, name }),
      });
      if (dr.ok || dr.status === 201 || dr.status === 204) {
        inp.value = "";
        showToast("Keyword angelegt.", false);
        loadDirectory();
      } else showToast(await parseError(dr), true);
    });
    addRow.appendChild(inp);
    addRow.appendChild(btn);
    wrap.appendChild(ul);
    wrap.appendChild(addRow);
    root.appendChild(wrap);
  }
}

async function loadVersion() {
  const el = $("#version-json");
  const res = await api("/version");
  if (!res.ok) {
    el.textContent = await parseError(res);
    return;
  }
  el.textContent = JSON.stringify(res.json, null, 2);
}

function bindNav() {
  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => navTo(btn.dataset.view));
  });
}

$("#form-create-user").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const screen_name = String(fd.get("screen_name") || "").trim();
  const password = String(fd.get("password") || "");
  const res = await api("/user", {
    method: "POST",
    body: JSON.stringify({ screen_name, password }),
  });
  if (res.ok || res.status === 201) {
    showToast("Benutzer angelegt.", false);
    e.target.reset();
    loadUsers();
  } else showToast(await parseError(res), true);
});

$("#btn-load-users").addEventListener("click", () => loadUsers());

$("#form-create-room").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get("name") || "").trim();
  const res = await api("/chat/room/public", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (res.ok || res.status === 201) {
    showToast("Raum erstellt.", false);
    e.target.reset();
    loadRooms();
  } else showToast(await parseError(res), true);
});

$("#btn-load-rooms").addEventListener("click", () => loadRooms());
$("#btn-load-private-rooms").addEventListener("click", () => loadPrivateRooms());

$("#form-im").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const from = String(fd.get("from") || "").trim();
  const to = String(fd.get("to") || "").trim();
  const text = String(fd.get("text") || "");
  const res = await api("/instant-message", {
    method: "POST",
    body: JSON.stringify({ from, to, text }),
  });
  if (res.ok || res.status === 201 || res.status === 204) {
    showToast("Nachricht gesendet.", false);
    e.target.reset();
  } else showToast(await parseError(res), true);
});

$("#form-webapi-key").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const app_name = String(fd.get("app_name") || "").trim();
  const rate_limit = Number(fd.get("rate_limit") || 60);
  const res = await api("/admin/webapi/keys", {
    method: "POST",
    body: JSON.stringify({ app_name, rate_limit }),
  });
  const hint = $("#webapi-created-hint");
  if (res.ok || res.status === 201) {
    const data = /** @type {Record<string, unknown>} */ (res.json);
    const key = data.dev_key ? String(data.dev_key) : "";
    hint.innerHTML = key
      ? `<strong>Einmalig sichtbar:</strong> <code class="mono">${escapeHtml(key)}</code>`
      : "Schlüssel erzeugt.";
    hint.classList.remove("empty");
    hint.classList.add("flash-once");
    e.target.reset();
    loadWebApiKeys();
  } else {
    hint.textContent = await parseError(res);
    hint.classList.remove("empty");
    showToast(await parseError(res), true);
  }
});

$("#btn-load-keys").addEventListener("click", () => loadWebApiKeys());

$("#form-dir-cat").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get("name") || "").trim();
  const res = await api("/directory/category", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (res.ok || res.status === 201) {
    showToast("Kategorie angelegt.", false);
    e.target.reset();
    loadDirectory();
  } else showToast(await parseError(res), true);
});

$("#btn-load-directory").addEventListener("click", () => loadDirectory());

$("#btn-refresh-all").addEventListener("click", async () => {
  await loadVersion();
  await loadSessions();
  showToast("Übersicht aktualisiert.", false);
});

$("#btn-load-sessions").addEventListener("click", () => loadSessions());

async function boot() {
  bindNav();
  await loadMeta();
  await loadVersion();
  await loadSessions();
  applyHashRoute();
}

boot();
