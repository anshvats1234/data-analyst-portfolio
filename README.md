# Gemini Chatbot – Web App

A clean Flask + HTML/CSS/JS front end for the Gemini chatbot.
Chats are saved with Pandas, summarised with NumPy, and charted with Matplotlib + Seaborn.

## Features
- Live chat with typing indicator, markdown/code rendering and a copy button
- Side panel with **History** (Pandas), **Stats** (NumPy), **Charts** (Matplotlib + Seaborn) and **Models**
- Light/dark theme, responsive layout, suggestion chips
- Terminal-style commands also work in the input box: `/history`, `/stats`, `/charts`, `/models`, `/reset`

## Project structure
```
chatbot-web/
├── app.py              Flask server (new)
├── config.py           settings (unchanged)
├── gemini_client.py    Gemini connection (unchanged)
├── chat_logger.py      Pandas CSV logging (unchanged)
├── analytics.py        NumPy / Matplotlib / Seaborn (unchanged)
├── chatbot.py          terminal version (optional, unchanged)
├── requirements.txt
├── _env.example        copy to .env
├── templates/index.html
└── static/css/style.css, static/js/app.js
```

## Setup
1. Python 3.9+ is required.
2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate        # Windows: venv\Scripts\activate
   ```
3. Install libraries:
   ```bash
   pip install -r requirements.txt
   ```
4. Add your free Gemini API key (get one at https://aistudio.google.com/apikey).
   Copy `_env.example` to a file named `.env` and set:
   ```
   GEMINI_API_KEY=your_key_here
   ```
5. Run:
   ```bash
   python app.py
   ```
   Open http://127.0.0.1:5000

## Notes
- History is stored in `data/chat_history.csv`; charts in `charts/` (both auto-created).
- Stats need 1+ chats (prediction needs 3+); charts need at least 2.
- Single-user local app: all browser tabs share one conversation.
- "Setup problem: GEMINI_API_KEY not found" means your `.env` file is missing or misnamed.
