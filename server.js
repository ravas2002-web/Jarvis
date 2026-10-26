
import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "32kb" }));
app.use(express.static("public"));

const {
  GROQ_API_KEY,
  APP_PASSWORD,
  SESSION_SECRET
} = process.env;

app.use(session({
  name: "jarvis.sid",
  secret: SESSION_SECRET || "development-secret-change-this",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

function requireLogin(req, res, next) {
  if (!req.session.authenticated) {
    return res.status(401).json({
      error: "Χρειάζεται να συνδεθείς ξανά."
    });
  }
  next();
}

app.get("/api/status", (req, res) => {
  res.json({
    authenticated: Boolean(req.session.authenticated),
    aiConfigured: Boolean(GROQ_API_KEY)
  });
});

app.post("/api/login", loginLimiter, (req, res, next) => {
  if (!APP_PASSWORD) {
    return res.status(503).json({
      error: "Δεν έχει οριστεί το APP_PASSWORD στο Render."
    });
  }

  if (typeof req.body?.password !== "string" ||
      req.body.password !== APP_PASSWORD) {
    return res.status(401).json({
      error: "Λάθος κωδικός."
    });
  }

  req.session.regenerate(err => {
    if (err) return next(err);

    req.session.authenticated = true;
    req.session.save(err => {
      if (err) return next(err);
      res.json({ success: true });
    });
  });
});

app.post("/api/logout", (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("jarvis.sid");
    res.json({ success: true });
  });
});

app.post("/api/chat", requireLogin, chatLimiter, async (req, res) => {
  try {
    if (!GROQ_API_KEY) {
      return res.status(503).json({
        error: "Δεν έχει ρυθμιστεί το GROQ_API_KEY στο Render."
      });
    }

    const message = req.body?.message;

    if (typeof message !== "string" ||
        !message.trim() ||
        message.length > 8000) {
      return res.status(400).json({
        error: "Το μήνυμα πρέπει να έχει 1–8000 χαρακτήρες."
      });
    }

    const allowedRoles = new Set(["user", "assistant"]);
    const history = Array.isArray(req.body.history)
      ? req.body.history
          .filter(item =>
            item &&
            allowedRoles.has(item.role) &&
            typeof item.content === "string"
          )
          .slice(-12)
          .map(item => ({
            role: item.role,
            content: item.content.slice(0, 8000)
          }))
      : [];

    const messages = [
      {
        role: "system",
        content: `Είσαι ο JARVIS ULTRA, ένας έξυπνος, φιλικός και
ικανός προσωπικός βοηθός. Μιλάς φυσικά ελληνικά όταν ο χρήστης
γράφει ελληνικά. Δίνεις σαφείς, χρήσιμες και ακριβείς απαντήσεις.
Δεν ισχυρίζεσαι ότι έκανες ενέργειες που δεν έκανες. Αν δεν γνωρίζεις
κάτι ή δεν έχεις πρόσβαση σε ζωντανά δεδομένα, το εξηγείς ειλικρινά.
Δεν αποκαλύπτεις μυστικά, κλειδιά API ή κωδικούς.`
      },
      ...history,
      { role: "user", content: message.trim() }
    ];

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
          messages,
          temperature: 0.6,
          max_completion_tokens: 2048
        }),
        signal: AbortSignal.timeout(45000)
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Groq API error:", response.status, result.error?.message);

      return res.status(502).json({
        error: response.status === 429
          ? "Το όριο χρήσης AI εξαντλήθηκε προσωρινά. Δοκίμασε αργότερα."
          : "Το AI δεν απάντησε. Έλεγξε το API key, το μοντέλο και τα logs του Render."
      });
    }

    const reply = result.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "Το AI επέστρεψε κενή απάντηση."
      });
    }

    res.json({ reply: reply.trim() });
  } catch (error) {
    console.error("Chat error:", error.message);

    res.status(500).json({
      error: "Σφάλμα σύνδεσης με το AI. Δοκίμασε ξανά."
    });
  }
});

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(500).json({
    error: "Εσωτερικό σφάλμα server."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`JARVIS ULTRA running on port ${PORT}`);
});

