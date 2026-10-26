
import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
const production = process.env.NODE_ENV === "production";

if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET || !process.env.GROQ_API_KEY) {
  console.error("Λείπει το APP_PASSWORD, SESSION_SECRET ή GROQ_API_KEY στο Render.");
  process.exit(1);
}

if (process.env.SESSION_SECRET.length < 32) {
  console.error("Το SESSION_SECRET πρέπει να έχει τουλάχιστον 32 χαρακτήρες.");
  process.exit(1);
}

if (production) app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));

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

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.get("/api/status", (req, res) => {
  res.json({ authenticated: Boolean(req.session.authenticated) });
});

app.post("/api/login", loginLimiter, (req, res, next) => {
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

app.post("/api/chat", chatLimiter, async (req, res) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: "Συνδέσου πρώτα." });
  }

  const message = req.body?.message;
  const history = req.body?.history;

  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 8000
  ) {
    return res.status(400).json({
      error: "Γράψε ένα μήνυμα έως 8.000 χαρακτήρες."
    });
  }

  if (history !== undefined && (
    !Array.isArray(history) ||
    history.length > 12 ||
    history.some(item =>
      !item ||
      !["user", "assistant"].includes(item.role) ||
      typeof item.content !== "string" ||
      item.content.length > 8000
    )
  )) {
    return res.status(400).json({
      error: "Μη έγκυρο ιστορικό συνομιλίας."
    });
  }

  const messages = [
    {
      role: "system",
      content: `Είσαι ο JARVIS, ένας χρήσιμος προσωπικός AI βοηθός.
Απάντα φυσικά, κυρίως στα ελληνικά. Καταλαβαίνεις ελληνικά και Greeklish.
Να είσαι σαφής, φιλικός και ειλικρινής. Μην ισχυρίζεσαι ότι έκανες ενέργειες
που δεν έκανες. Αν δεν γνωρίζεις κάτι, πες το καθαρά.
Δεν έχεις αυτόματα πρόσβαση στο διαδίκτυο, στα αρχεία ή στις εφαρμογές
του χρήστη, εκτός αν σου δοθεί σχετικό εργαλείο.`
    },
    ...(Array.isArray(history) ? history.slice(-12) : []),
    { role: "user", content: message.trim() }
  ];

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
          messages,
          max_completion_tokens: 1200
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Groq API error:", response.status, data);
      if (response.status === 429) {
        return res.status(429).json({
          error: "Το δωρεάν όριο χρήσης εξαντλήθηκε προσωρινά. Δοκίμασε αργότερα."
        });
      }

      return res.status(502).json({
        error: "Το AI δεν απάντησε. Έλεγξε το API key και το μοντέλο στο Render."
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "Το AI επέστρεψε κενή απάντηση."
      });
    }

    res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("AI request error:", error.message);
    res.status(502).json({
      error: "Δεν ήταν δυνατή η σύνδεση με το AI. Δοκίμασε ξανά."
    });
  }
});

app.use(express.static("public"));

app.get("/{*path}", (_req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

app.listen(Number(process.env.PORT || 3000), () => {
  console.log("JARVIS AI started.");
});
