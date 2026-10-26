
<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#080d18">
<title>JARVIS AI</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#080d18;color:#edf4ff;font-family:system-ui,sans-serif}
main{max-width:800px;margin:auto;padding:20px 14px;min-height:100vh;display:flex;flex-direction:column}
header{text-align:center;padding:20px 0}
.orb{width:76px;height:76px;border:2px solid #42d9ff;border-radius:50%;margin:auto;display:grid;place-items:center;color:#62e4ff;font-size:30px;box-shadow:0 0 28px #159fc655}
h1{letter-spacing:5px}
.panel{background:#111b2b;border:1px solid #24344c;border-radius:16px;padding:14px;margin:10px 0}
input,textarea,button{font:inherit;border-radius:12px;padding:12px;border:1px solid #334761}
input,textarea{background:#091321;color:white;width:100%;margin:6px 0}
button{background:#123b54;color:white;cursor:pointer}
button:disabled{opacity:.5}
.primary{background:#087fa4;border:0;width:100%}
.row{display:flex;gap:8px;flex-wrap:wrap}
.row button{flex:1}
.muted{color:#93a8c4}
.hidden{display:none!important}
#status{color:#91dff5;font-size:14px}
#messages{min-height:200px;max-height:55vh;overflow:auto}
.msg{padding:12px;border-radius:12px;margin:10px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.user{background:#12354a}
.ai{background:#172235}
footer{margin-top:auto;text-align:center;padding:20px;color:#93a8c4}
</style>
</head>
<body>
<main>
<header>
<div class="orb">✦</div>
<h1>JARVIS</h1>
<div class="muted">PERSONAL AI ASSISTANT</div>
<p id="status">Σύνδεση με τον server…</p>
</header>

<section id="login" class="panel hidden">
<h3>Σύνδεση</h3>
<form id="loginForm">
<input id="password" type="password" placeholder="Κωδικός πρόσβασης" required>
<button class="primary" type="submit">Σύνδεση</button>
</form>
<p id="loginError"></p>
</section>

<section id="app" class="hidden">
<div class="row">
<button id="voice" type="button">🎙️ Μίλα</button>
<button id="speak" type="button">🔊 Ομιλία: OFF</button>
<button id="clear" type="button">Καθαρισμός</button>
<button id="logout" type="button">Έξοδος</button>
</div>

<div id="messages" class="panel">
<div class="msg ai">Γεια σου! Είμαι ο JARVIS. Πώς μπορώ να σε βοηθήσω;</div>
</div>

<form id="chatForm" class="panel">
<textarea id="message" rows="3" maxlength="8000" placeholder="Γράψε ένα μήνυμα…" required></textarea>
<button class="primary" id="send" type="submit">Αποστολή ➤</button>
</form>
</section>
<footer>JARVIS AI · Η χρήση εξαρτάται από τα όρια του παρόχου AI</footer>
</main>

<script>
const $ = id => document.getElementById(id);
let speaking = false;
let busy = false;
let history = [];

function add(role, text) {
  const d = document.createElement("div");
  d.className = "msg " + (role === "user" ? "user" : "ai");
  d.textContent = text;
  $("messages").appendChild(d);
  $("messages").scrollTop = $("messages").scrollHeight;
}

async function checkLogin() {
  try {
    const r = await fetch("/api/status");
    const data = await r.json();
    $("login").classList.toggle("hidden", data.authenticated);
    $("app").classList.toggle("hidden", !data.authenticated);
    $("status").textContent = data.authenticated ? "JARVIS AI online" : "Απαιτείται σύνδεση";
  } catch {
    $("status").textContent = "Δεν υπάρχει σύνδεση με τον server.";
  }
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginError").textContent = "Σύνδεση…";

  try {
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("password").value })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Αποτυχία σύνδεσης.");
    $("password").value = "";
    $("loginError").textContent = "";
    await checkLogin();
  } catch (err) {
    $("loginError").textContent = err.message;
  }
});

$("chatForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (busy) return;

  const message = $("message").value.trim();
  if (!message) return;

  busy = true;
  $("send").disabled = true;
  $("message").value = "";
  add("user", message);
  $("status").textContent = "Ο JARVIS σκέφτεται…";

  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history })
    });
    const data = await r.json();

    if (r.status === 401) {
      await checkLogin();
      throw new Error("Συνδέσου ξανά για να συνεχίσεις.");
    }
    if (!r.ok) throw new Error(data.error || "Παρουσιάστηκε σφάλμα.");

    add("assistant", data.reply);
    history.push(
      { role: "user", content: message },
      { role: "assistant", content: data.reply }
    );
    history = history.slice(-12);
    $("status").textContent = "JARVIS AI online";

    if (speaking && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(data.reply);
      utterance.lang = "el-GR";
      speechSynthesis.speak(utterance);
    }
  } catch (err) {
    add("assistant", "Σφάλμα: " + err.message);
    $("status").textContent = "Παρουσιάστηκε πρόβλημα";
  } finally {
    busy = false;
    $("send").disabled = false;
    $("message").focus();
  }
});

$("clear").addEventListener("click", () => {
  $("messages").replaceChildren();
  history = [];
});

$("speak").addEventListener("click", () => {
  speaking = !speaking;
  $("speak").textContent = "🔊 Ομιλία: " + (speaking ? "ON" : "OFF");
  if (!speaking && "speechSynthesis" in window) speechSynthesis.cancel();
});

$("voice").addEventListener("click", () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $("status").textContent = "Η φωνητική εισαγωγή δεν υποστηρίζεται από αυτόν τον browser.";
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "el-GR";
  recognition.onresult = e => {
    $("message").value = e.results[0][0].transcript;
    $("message").focus();
  };
  recognition.onerror = () => {
    $("status").textContent = "Δεν έγινε αναγνώριση φωνής.";
  };
  recognition.start();
  $("status").textContent = "Σε ακούω…";
});

$("logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  history = [];
  await checkLogin();
});

checkLogin();
</script>
</body>
</html>

