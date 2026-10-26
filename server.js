
import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
const production = process.env.NODE_ENV === "production";

if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
  console.error("Λείπει το APP_PASSWORD ή το SESSION_SECRET στο Render.");
  process.exit(1);
}

if (process.env.SESSION_SECRET.length < 32) {
  console.error("Το SESSION_SECRET πρέπει να έχει τουλάχιστον 32 χαρακτήρες.");
  process.exit(1);
}

if (production) app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));

app.use(session({
  name: "jarvis.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.get("/api/status", (req, res) => {
  res.json({ authenticated: Boolean(req.session.authenticated) });
});

app.post("/api/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10
}), (req, res, next) => {
  if (
    typeof req.body?.password !== "string" ||
    req.body.password !== process.env.APP_PASSWORD
  ) {
    return res.status(401).json({ error: "Λάθος κωδικός." });
  }

  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.authenticated = true;
    res.json({ ok: true });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("jarvis.sid");
    res.json({ ok: true });
  });
});

function jarvisReply(message) {
  const m = message.toLowerCase().trim();

  if (/^(γεια|γεια σου|καλησπέρα|καλημέρα|καληνύχτα|hello|hi)\b/.test(m)) {
    return "Γεια σου! Είμαι ο JARVIS, η τοπική σου προσομοίωση AI. Πώς μπορώ να βοηθήσω;";
  }

  if (m.includes("ποιος είσαι") || m.includes("τι είσαι")) {
    return "Είμαι ο JARVIS Demo, μια προσομοίωση προσωπικού βοηθού. Αυτή η έκδοση δεν χρησιμοποιεί εξωτερικό AI API.";
  }

  if (m.includes("τι ώρα") || m.includes("ώρα τώρα")) {
    return "Η ώρα του server είναι: " +
      new Date().toLocaleTimeString("el-GR", { timeZone: "Europe/Athens" });
  }

  if (m.includes("τι ημερομηνία") || m.includes("τι μέρα")) {
    return "Σήμερα είναι " +
      new Date().toLocaleDateString("el-GR", {
        timeZone: "Europe/Athens",
        dateStyle: "full"
      }) + ".";
  }

  if (m.includes("βοήθεια") || m.includes("τι μπορείς")) {
    return "Μπορώ να απαντώ σε βασικούς χαιρετισμούς, να σου λέω ώρα και ημερομηνία και να εξηγώ ότι είμαι η demo έκδοση. Δεν έχω ζωντανή αναζήτηση στο διαδίκτυο ούτε τις γνώσεις ενός πραγματικού AI μοντέλου.";
  }

  if (m.includes("ευχαριστώ")) {
    return "Παρακαλώ! Είμαι εδώ για να σε βοηθήσω όσο μπορώ.";
  }

  if (m.includes("καιρός")) {
    return "Σε αυτή την έκδοση δεν έχω ζωντανή πρόσβαση σε δεδομένα καιρού.";
  }

  return "Κατάλαβα το μήνυμά σου: «" + message.trim() +
    "». Είμαι σε λειτουργία προσομοίωσης και δεν έχω συνδεδεμένο πραγματικό AI μοντέλο. Δοκίμασε «βοήθεια», «τι ώρα είναι;» ή «ποιος είσαι;».";
}

app.post("/api/chat", rateLimit({
  windowMs: 60 * 1000,
  limit: 30
}), (req, res) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: "Συνδέσου πρώτα." });
  }

  const message = req.body?.message;

  if (typeof message !== "string" || !message.trim() || message.length > 8000) {
    return res.status(400).json({ error: "Γράψε ένα μήνυμα έως 8.000 χαρακτήρες." });
  }

  res.json({ reply: jarvisReply(message) });
});

app.use(express.static("public"));

app.get("/{*path}", (_req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log("JARVIS Demo started on port " + port);
});
