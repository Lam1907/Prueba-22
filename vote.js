/**
 * VOTE.JS — Módulo Votación Pública RL  v3
 * ─────────────────────────────────────────────────────────
 * USA Firebase Compat SDK (NO ES modules).
 * Compatible con GitHub Pages, Wix iframe, y cualquier
 * servidor estático sin configuración especial.
 *
 * Firebase se carga via <script> en el HTML antes que este archivo.
 * Acceso: window.firebase (global)
 * ─────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  // ══════════════════════════════════════════════════════
  // 0. FIREBASE — INICIALIZACIÓN
  // ══════════════════════════════════════════════════════

  var firebaseConfig = {
    apiKey:            "AIzaSyCxd2sdNJZaQ0Rq_mF6Sn1wLQra4Eabp1U",
    authDomain:        "danzad-maldit0s.firebaseapp.com",
    databaseURL:       "https://danzad-maldit0s-default-rtdb.firebaseio.com",
    projectId:         "danzad-maldit0s",
    storageBucket:     "danzad-maldit0s.firebasestorage.app",
    messagingSenderId: "774607843671",
    appId:             "1:774607843671:web:ec64876ba81b6b50acce12"
  };

  firebase.initializeApp(firebaseConfig);
  var db = firebase.database();

  console.log("[RL vote] Firebase compat inicializado →", firebaseConfig.databaseURL);

  // ══════════════════════════════════════════════════════
  // 1. CONSTANTES
  // ══════════════════════════════════════════════════════

  var PAIR_COLORS = {
    1: { name: "rojo",     hex: "#e03030" },
    2: { name: "amarillo", hex: "#d4aa20" },
    3: { name: "verde",    hex: "#2ea86b" },
    4: { name: "azul",     hex: "#2b7fd4" },
    5: { name: "morado",   hex: "#8b42d4" }
  };

  var TOTAL_PAIRS      = 5;
  var MEMBERS_PER_PAIR = 2;
  var STORAGE_KEY      = "rl_voted";

  // ══════════════════════════════════════════════════════
  // 2. ESTADO LOCAL
  // ══════════════════════════════════════════════════════

  var localState = {
    currentPair:   1,
    pairs:         { 1: [], 2: [], 3: [], 4: [], 5: [] },
    participants:  {},
    settings:      {},
    firebaseState: null
  };

  // ══════════════════════════════════════════════════════
  // 3. WIX HEIGHT SYSTEM
  // ══════════════════════════════════════════════════════

  function notifyWixHeight() {
    try {
      var height = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        900
      );
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "wix-iframe-height", height: height }, "*");
        window.parent.postMessage(JSON.stringify({ type: "height", value: height }), "*");
      }
    } catch (e) {
      console.warn("[RL vote] notifyWixHeight:", e);
    }
  }

  window.addEventListener("load",   notifyWixHeight);
  window.addEventListener("resize", notifyWixHeight);
  setInterval(notifyWixHeight, 1000);

  // ══════════════════════════════════════════════════════
  // 4. PANTALLAS
  // ══════════════════════════════════════════════════════

  var screens = {
    menu:         document.getElementById("screen-menu"),
    waiting:      document.getElementById("screen-waiting"),
    vote:         document.getElementById("screen-vote"),
    done:         document.getElementById("screen-done"),
    ended:        document.getElementById("screen-ended"),
    alreadyVoted: document.getElementById("screen-already-voted")
  };

  function showScreen(name) {
    console.log("[RL vote] showScreen →", name);
    Object.keys(screens).forEach(function (key) {
      var el = screens[key];
      if (!el) return;
      if (key === name) {
        el.classList.add("active");
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            el.classList.add("visible");
          });
        });
      } else {
        el.classList.remove("active", "visible");
      }
    });
    setTimeout(notifyWixHeight, 50);
    setTimeout(notifyWixHeight, 400);
  }

  // ══════════════════════════════════════════════════════
  // 5. DOBLE VOTO
  // ══════════════════════════════════════════════════════

  function hasAlreadyVoted() {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; }
    catch (e) { return false; }
  }

  function markAsVoted() {
    try { localStorage.setItem(STORAGE_KEY, "true"); }
    catch (e) { /* silencioso */ }
  }

  // ══════════════════════════════════════════════════════
  // 6. LISTENER ÚNICO — /state
  // REGLA: este es el ÚNICO lugar que llama showScreen()
  // para transiciones controladas por el panel.
  // ══════════════════════════════════════════════════════

  function listenState() {
    console.log("[RL vote] Escuchando /state ...");

    db.ref("state").on("value", function (snapshot) {
      var s = snapshot.val();
      console.log("[RL vote] STATE UPDATE:", s);

      if (!s) {
        console.warn("[RL vote] /state vacío — mostrando menú");
        showScreen("menu");
        return;
      }

      localState.firebaseState = s;

      if (s.votingEnded === true) {
        console.log("[RL vote] votingEnded=true → ended");
        showScreen("ended");
        return;
      }

      if (s.votingOpen === true) {
        console.log("[RL vote] votingOpen=true → vote");
        showScreen("vote");
        var grid = document.getElementById("participants-grid");
        if (grid && grid.children.length <= 1) {
          renderParticipantsGrid();
        }
        return;
      }

      if (s.waitingRoom === true) {
        console.log("[RL vote] waitingRoom=true → waiting");
        showScreen("waiting");
        return;
      }

      console.log("[RL vote] estado neutro → menu");
      showScreen("menu");
    });
  }

  // ══════════════════════════════════════════════════════
  // 7. LISTENER — /participantes
  // ══════════════════════════════════════════════════════

  function listenParticipants() {
    db.ref("participantes").on("value", function (snap) {
      var data = snap.val();
      localState.participants = data || {};
      console.log("[RL vote] /participantes →", Object.keys(localState.participants).length, "registros");

      var voteScreen = screens.vote;
      if (voteScreen && voteScreen.classList.contains("active")) {
        renderParticipantsGrid();
        notifyWixHeight();
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // 8. LISTENER — /voteSettings
  // ══════════════════════════════════════════════════════

  function listenVoteSettings() {
    db.ref("voteSettings").on("value", function (snap) {
      var settings = snap.val();
      if (!settings) return;
      localState.settings = settings;
      applySettings(settings);
    });
  }

  function applySettings(settings) {
    if (settings.menuBackground) {
      var menuEl = document.getElementById("screen-menu");
      if (menuEl) menuEl.style.setProperty("--menu-bg-url", "url(\"" + settings.menuBackground + "\")");
    }

    if (settings.waitingSymbol) {
      var core = document.getElementById("waiting-symbol-core");
      if (core) {
        core.innerHTML = "<img src=\"" + settings.waitingSymbol + "\" alt=\"Símbolo\" style=\"object-fit:contain;width:100%;height:100%;\" />";
      }
    }

    var t = settings.texts || {};
    setText("text-menu-line1",       t.menuLine1);
    setText("text-menu-line2",       t.menuLine2);
    setText("text-menu-note",        t.menuNote);
    setHTML("text-waiting-title",    t.waitingTitle);
    setText("text-waiting-message",  t.waitingMessage);
    setHTML("text-waiting-signature",t.waitingSignature);
  }

  function setText(id, value) {
    if (!value) return;
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHTML(id, value) {
    if (!value) return;
    var el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }

  // ══════════════════════════════════════════════════════
  // 9. RENDER — GRID DE PARTICIPANTES
  // ══════════════════════════════════════════════════════

  function renderParticipantsGrid() {
    var grid = document.getElementById("participants-grid");
    if (!grid) return;

    var list = Object.values(localState.participants);
    if (list.length === 0) list = generateFallbackParticipants();

    list.sort(function (a, b) { return (a.numero || 0) - (b.numero || 0); });

    grid.innerHTML = "";
    list.forEach(function (p, idx) {
      grid.appendChild(createParticipantCard(p, idx));
    });

    restorePairVisuals();
    updatePairsIndicator();
    updateSubmitButton();

    setTimeout(notifyWixHeight, 200);
    console.log("[RL vote] Grid renderizado →", list.length, "participantes");
  }

  function createParticipantCard(participant, animDelay) {
    var card = document.createElement("div");
    card.className = "participant-card";
    card.setAttribute("data-id", String(participant.id || participant.numero));
    card.setAttribute("role", "listitem");
    card.style.animation = "card-appear 0.45s cubic-bezier(0.22,1,0.36,1) " + (animDelay * 55) + "ms both";

    var imageHTML = participant.imagen
      ? "<img src=\"" + participant.imagen + "\" alt=\"" + participant.nombre + "\" loading=\"lazy\" />"
      : buildPlaceholderHTML(participant.nombre);

    card.innerHTML =
      "<div class=\"card-image-wrap\">" +
        imageHTML +
        "<div class=\"card-overlay\"></div>" +
        "<div class=\"card-num\">#" + String(participant.numero).padStart(2, "0") + "</div>" +
        "<div class=\"card-pair-badge\"></div>" +
      "</div>" +
      "<div class=\"card-info\">" +
        "<span class=\"card-name\">" + participant.nombre + "</span>" +
      "</div>";

    card.addEventListener("click", function () {
      handleCardClick(participant);
    });

    return card;
  }

  function buildPlaceholderHTML(name) {
    var initials = name.split(" ").slice(0, 2).map(function (w) { return w[0] || ""; }).join("").toUpperCase();
    return "<div class=\"card-placeholder\">" +
      "<svg viewBox=\"0 0 80 80\" xmlns=\"http://www.w3.org/2000/svg\">" +
        "<rect width=\"80\" height=\"80\" fill=\"#111\"/>" +
        "<text x=\"40\" y=\"46\" text-anchor=\"middle\" font-family=\"'Bebas Neue', sans-serif\" font-size=\"26\" fill=\"rgba(200,176,138,0.5)\" letter-spacing=\"3\">" + initials + "</text>" +
      "</svg>" +
    "</div>";
  }

  function generateFallbackParticipants() {
    return ["Ana Reyes","Camilo Torres","Sofia Díaz","Mateo Ruiz",
            "Valentina Cruz","Sebastián López","Isabella Mora",
            "Daniel García","Luciana Vargas","Alejandro Ríos"]
      .map(function (nombre, i) { return { id: "p" + (i + 1), numero: i + 1, nombre: nombre, imagen: "" }; });
  }

  // ══════════════════════════════════════════════════════
  // 10. LÓGICA DE SELECCIÓN DE PAREJAS
  // ══════════════════════════════════════════════════════

  function handleCardClick(participant) {
    if (!localState.firebaseState || !localState.firebaseState.votingOpen) {
      console.warn("[RL vote] Clic bloqueado — votingOpen=false");
      return;
    }

    var id = String(participant.id || participant.numero);
    var assignedPair = getParticipantPair(id);

    if (assignedPair !== null) { removeFromPair(id, assignedPair); return; }
    if (isParticipantPending(id)) { cancelPendingSelection(id); return; }

    var currentFull = localState.pairs[localState.currentPair].length >= MEMBERS_PER_PAIR;
    if (currentFull) {
      var incomplete = findIncompletePair();
      if (incomplete === null) return;
      localState.currentPair = incomplete;
    }

    addToCurrentPair(id);
  }

  function getParticipantPair(id) {
    for (var p = 1; p <= TOTAL_PAIRS; p++) {
      if (localState.pairs[p].indexOf(id) !== -1) return p;
    }
    return null;
  }

  function isParticipantPending(id) {
    var arr = localState.pairs[localState.currentPair];
    return arr.length === 1 && arr[0] === id;
  }

  function cancelPendingSelection(id) {
    localState.pairs[localState.currentPair] = [];
    updateCardVisual(id, "none");
    updatePairsIndicator();
  }

  function removeFromPair(id, pairNum) {
    localState.pairs[pairNum] = localState.pairs[pairNum].filter(function (x) { return x !== id; });
    updateCardVisual(id, "none");
    var remaining = localState.pairs[pairNum];
    if (remaining.length === 1) updateCardVisual(remaining[0], "selected", pairNum);
    var incomplete = findIncompletePair();
    if (incomplete !== null) localState.currentPair = incomplete;
    updatePairsIndicator();
    updateSubmitButton();
  }

  function addToCurrentPair(id) {
    localState.pairs[localState.currentPair].push(id);
    var count = localState.pairs[localState.currentPair].length;

    if (count === 1) {
      updateCardVisual(id, "selected", localState.currentPair);
    } else if (count === MEMBERS_PER_PAIR) {
      var members = localState.pairs[localState.currentPair];
      updateCardVisual(members[0], "paired", localState.currentPair);
      updateCardVisual(members[1], "paired", localState.currentPair);
      var next = findNextIncompletePair(localState.currentPair);
      if (next !== null) localState.currentPair = next;
    }

    updatePairsIndicator();
    updateSubmitButton();
  }

  function findIncompletePair() {
    for (var p = 1; p <= TOTAL_PAIRS; p++) {
      if (localState.pairs[p].length < MEMBERS_PER_PAIR) return p;
    }
    return null;
  }

  function findNextIncompletePair(after) {
    for (var p = after + 1; p <= TOTAL_PAIRS; p++) {
      if (localState.pairs[p].length < MEMBERS_PER_PAIR) return p;
    }
    for (var p2 = 1; p2 <= after; p2++) {
      if (localState.pairs[p2].length < MEMBERS_PER_PAIR) return p2;
    }
    return null;
  }

  // ══════════════════════════════════════════════════════
  // 11. VISUALES DE TARJETAS
  // ══════════════════════════════════════════════════════

  function updateCardVisual(id, status, pairNum) {
    var card = document.querySelector(".participant-card[data-id=\"" + id + "\"]");
    if (!card) return;
    var badge = card.querySelector(".card-pair-badge");

    card.classList.remove("selected","paired","locked","pair-1","pair-2","pair-3","pair-4","pair-5");
    badge.textContent = "";
    badge.style.color = "";

    if (status === "none") return;

    if (status === "selected") {
      card.classList.add("selected");
      badge.textContent = pairNum || localState.currentPair;
    }

    if (status === "paired" && pairNum) {
      card.classList.add("paired", "pair-" + pairNum);
      badge.textContent = pairNum;
      if (pairNum === 2) badge.style.color = "#0a0a0a";
    }
  }

  function restorePairVisuals() {
    for (var p = 1; p <= TOTAL_PAIRS; p++) {
      var m = localState.pairs[p];
      if (m.length === 2) {
        updateCardVisual(m[0], "paired", p);
        updateCardVisual(m[1], "paired", p);
      } else if (m.length === 1) {
        updateCardVisual(m[0], "selected", p);
      }
    }
  }

  // ══════════════════════════════════════════════════════
  // 12. INDICADOR DE PAREJAS
  // ══════════════════════════════════════════════════════

  function updatePairsIndicator() {
    for (var p = 1; p <= TOTAL_PAIRS; p++) {
      var pill  = document.querySelector(".pair-pill[data-pair=\"" + p + "\"]");
      var count = document.getElementById("count-" + p);
      if (!pill || !count) continue;
      var members = localState.pairs[p].length;
      count.textContent = members + "/" + MEMBERS_PER_PAIR;
      pill.classList.remove("active", "complete");
      if (members === MEMBERS_PER_PAIR) pill.classList.add("complete");
      else if (p === localState.currentPair) pill.classList.add("active");
    }
  }

  // ══════════════════════════════════════════════════════
  // 13. BOTÓN REGISTRAR VOTO
  // ══════════════════════════════════════════════════════

  function updateSubmitButton() {
    var btn      = document.getElementById("btn-register");
    var progress = document.getElementById("vote-progress-text");
    if (!btn || !progress) return;
    var complete = allPairsComplete();
    btn.disabled = !complete;
    if (complete) {
      progress.textContent = "¡Tus 5 parejas están listas!";
    } else {
      var remaining = TOTAL_PAIRS - countCompletePairs();
      progress.textContent = remaining === 1
        ? "Falta 1 pareja por completar"
        : "Faltan " + remaining + " parejas por completar";
    }
  }

  function allPairsComplete() {
    for (var p = 1; p <= TOTAL_PAIRS; p++) {
      if (localState.pairs[p].length < MEMBERS_PER_PAIR) return false;
    }
    return true;
  }

  function countCompletePairs() {
    var count = 0;
    for (var p = 1; p <= TOTAL_PAIRS; p++) {
      if (localState.pairs[p].length === MEMBERS_PER_PAIR) count++;
    }
    return count;
  }

  // ══════════════════════════════════════════════════════
  // 14. MODAL DE CONFIRMACIÓN
  // ══════════════════════════════════════════════════════

  function openConfirmModal() {
    var summary = document.getElementById("modal-pairs-summary");
    summary.innerHTML = "";

    for (var p = 1; p <= TOTAL_PAIRS; p++) {
      var names = localState.pairs[p].map(function (id) { return getParticipantName(id); });
      var color = PAIR_COLORS[p];
      var row = document.createElement("div");
      row.className = "summary-row";
      row.style.background = color.hex + "18";
      row.style.border = "1px solid " + color.hex + "40";
      row.innerHTML =
        "<div class=\"summary-badge\" style=\"background:" + color.hex + (p === 2 ? ";color:#0a0a0a" : "") + "\">" + p + "</div>" +
        "<span class=\"summary-names\">" + names.join(" + ") + "</span>";
      summary.appendChild(row);
    }

    document.getElementById("modal-confirm").classList.add("open");
    notifyWixHeight();
  }

  function closeConfirmModal() {
    document.getElementById("modal-confirm").classList.remove("open");
    notifyWixHeight();
  }

  function getParticipantName(id) {
    var list = Object.values(localState.participants);
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id || list[i].numero) === String(id)) return list[i].nombre;
    }
    return "#" + id;
  }

  // ══════════════════════════════════════════════════════
  // 15. REGISTRO DEL VOTO EN FIREBASE
  // ══════════════════════════════════════════════════════

  function registrarVoto() {
    if (!localState.firebaseState || !localState.firebaseState.votingOpen) {
      console.warn("[RL vote] Voto rechazado — votingOpen=false");
      closeConfirmModal();
      return;
    }

    var payload = buildVotePayload();

    db.ref("votos").push(payload)
      .then(function () {
        console.log("[RL vote] Voto registrado →", payload.fechaISO);
        markAsVoted();
        closeConfirmModal();
        showScreen("done");
      })
      .catch(function (err) {
        console.error("[RL vote] Error al registrar:", err);
        closeConfirmModal();
        alert("Hubo un error al registrar tu voto. Por favor inténtalo de nuevo.");
      });
  }

  function buildVotePayload() {
    var parejas = {};
    for (var p = 1; p <= TOTAL_PAIRS; p++) {
      var ids   = localState.pairs[p];
      var color = PAIR_COLORS[p];
      parejas["pareja_" + p] = {
        numero: p,
        color:  color.name,
        participantes: ids.map(function (id) {
          return { id: id, nombre: getParticipantName(id) };
        })
      };
    }
    return {
      timestamp:    Date.now(),
      fechaISO:     new Date().toISOString(),
      round:        (localState.firebaseState && localState.firebaseState.currentRound) || 1,
      parejas:      parejas,
      totalParejas: TOTAL_PAIRS
    };
  }

  // ══════════════════════════════════════════════════════
  // 16. RESET DE SELECCIÓN
  // ══════════════════════════════════════════════════════

  function resetVoteState() {
    localState.currentPair = 1;
    localState.pairs = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    document.querySelectorAll(".participant-card").forEach(function (card) {
      card.classList.remove("selected","paired","locked","pair-1","pair-2","pair-3","pair-4","pair-5");
      var badge = card.querySelector(".card-pair-badge");
      if (badge) { badge.textContent = ""; badge.style.color = ""; }
    });
    updatePairsIndicator();
    updateSubmitButton();
    console.log("[RL vote] Selección reseteada");
  }

  // ══════════════════════════════════════════════════════
  // 17. EVENTOS DE UI
  // ══════════════════════════════════════════════════════

  function bindUIEvents() {
    var btnRegister = document.getElementById("btn-register");
    if (btnRegister) btnRegister.addEventListener("click", function () {
      if (allPairsComplete()) openConfirmModal();
    });

    var btnNo = document.getElementById("modal-no");
    if (btnNo) btnNo.addEventListener("click", closeConfirmModal);

    var btnYes = document.getElementById("modal-yes");
    if (btnYes) btnYes.addEventListener("click", registrarVoto);

    var modalOverlay = document.getElementById("modal-confirm");
    if (modalOverlay) modalOverlay.addEventListener("click", function (e) {
      if (e.target.id === "modal-confirm") closeConfirmModal();
    });

    var btnBackVote = document.getElementById("btn-back-from-vote");
    if (btnBackVote) btnBackVote.addEventListener("click", resetVoteState);
  }

  // ══════════════════════════════════════════════════════
  // 18. INICIALIZACIÓN
  // ══════════════════════════════════════════════════════

  function init() {
    console.log("[RL vote] Iniciando v3...");

    // Bloqueo doble voto — antes de cualquier listener
    if (hasAlreadyVoted()) {
      console.log("[RL vote] Ya votó → alreadyVoted");
      showScreen("alreadyVoted");
      return;
    }

    bindUIEvents();

    // Los 3 listeners Firebase — creados UNA SOLA VEZ
    listenState();          // /state     → controla TODAS las pantallas
    listenParticipants();   // /participantes → datos del grid
    listenVoteSettings();   // /voteSettings  → textos, fondo, símbolo
  }

  // Arrancar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})(); // fin IIFE
