
import express from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

const app = express();
const production = process.env.NODE_ENV === "production";

for (const key of ["APP_PASSWORD", "SESSION_SECRET", "OPENAI_API_KEY"]) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

if (process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be at least 32 characters.");
  process.exit(1);
}

if (production) app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet());
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

app.get("/api/status", (req, res) => {
  res.json({ authenticated: Boolean(req.session.authenticated) });
});

app.post("/api/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10
}), (req, res, next) => {
  if (typeof req.body?.password !== "string" ||
      req.body.password !== process.env.APP_PASSWORD) {
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
    res.clearCookie("jarvis.sid", {
      httpOnly: true,
      sameSite: "strict",
      secure: production
    });
    res.json({ ok: true });
  });
});

app.post("/api/chat", rateLimit({
  windowMs: 60 * 1000,
  limit: 15
}), async (req, res) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: "Συνδέσου πρώτα." });
  }

  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim() || message.length > 8000) {
    return res.status(400).json({ error: "Μήνυμα έως 8.000 χαρακτήρες." });
  }

  try {
    const response = await openai.responses.create({
      model,
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content: "Είσαι ο JARVIS, προσωπικός AI βοηθός. Απάντα στα ελληνικά, με σαφήνεια και ειλικρίνεια. Μην ισχυρίζεσαι ότι ελέγχεις συσκευές ή λογαριασμούς χωρίς σχετικό εργαλείο."
        },
        { role: "user", content: message.trim() }
      ]
    });

    res.json({ reply: response.output_text || "Δεν υπήρξε απάντηση." });
  } catch (error) {
    console.error("AI request failed:", error?.status || error?.name);
    res.status(502).json({
      error: "Σφάλμα AI. Έλεγξε το API key και τη χρέωση API."
    });
  }
});

app.use(express.static("public"));

app.get("/{*path}", (_req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log("JARVIS started on port " + port));

