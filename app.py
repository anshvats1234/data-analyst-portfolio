"""
app.py
Flask server: connects the web page to the existing chatbot code.
Run with:  python app.py
"""

import os
import threading
import time

# Always work from this file's folder so "data/" and "charts/" paths resolve
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

import numpy as np
from flask import Flask, jsonify, render_template, request, send_from_directory
from google.genai import errors

import analytics
import chat_logger
import config
from gemini_client import GeminiChatbot

app = Flask(__name__)

# One shared chatbot (simple, single-user setup) + a lock so that
# two requests never touch the chat session or matplotlib at the same time.
lock = threading.Lock()
setup_error = None
try:
    bot = GeminiChatbot()
except ValueError as error:      # e.g. missing API key
    bot = None
    setup_error = str(error)


def error_response(message, status):
    return jsonify({"error": message}), status


def bot_ready():
    """Return an error response if the bot could not start, else None."""
    if bot is None:
        return error_response(f"Setup problem: {setup_error}", 503)
    return None


# ---------- Pages ----------
@app.get("/")
def index():
    return render_template("index.html", model=config.MODEL_NAME)


# ---------- Chat ----------
@app.post("/api/chat")
def chat():
    problem = bot_ready()
    if problem:
        return problem

    data = request.get_json(silent=True) or {}
    question = (data.get("message") or "").strip()
    if not question:
        return error_response("Please type a message.", 400)

    try:
        with lock:
            answer, seconds = bot.ask(question)
            chat_logger.save_chat(question, answer, seconds)
    except errors.APIError as error:
        return error_response(f"Gemini API error ({error.code}): {error.message}", 502)
    except Exception as error:
        return error_response(f"Something went wrong: {error}", 500)

    return jsonify({"answer": answer, "seconds": seconds})


@app.post("/api/reset")
def reset():
    problem = bot_ready()
    if problem:
        return problem
    with lock:
        bot.reset()
    return jsonify({"ok": True})


@app.get("/api/models")
def models():
    problem = bot_ready()
    if problem:
        return problem
    try:
        return jsonify({"models": bot.list_models()})
    except Exception as error:
        return error_response(f"Could not list models: {error}", 500)


# ---------- Pandas: history ----------
@app.get("/api/history")
def history():
    df = chat_logger.load_history()
    rows = df[["chat_no", "timestamp", "question", "response_time_sec"]].tail(10)
    return jsonify({"rows": rows.fillna("").to_dict("records"), "total": len(df)})


# ---------- NumPy: statistics (same numbers as analytics.show_summary) ----------
@app.get("/api/stats")
def stats():
    df = chat_logger.load_history()
    if df.empty:
        return jsonify({"empty": True})

    times = df["response_time_sec"].to_numpy()
    q_words = df["question_words"].to_numpy()
    a_words = df["answer_words"].to_numpy()

    result = {
        "empty": False,
        "total": int(len(df)),
        "avg_time": round(float(np.mean(times)), 2),
        "median_time": round(float(np.median(times)), 2),
        "max_time": round(float(np.max(times)), 2),
        "avg_answer_words": round(float(np.mean(a_words))),
        "prediction": None,
    }
    if len(df) >= 3 and np.std(q_words) > 0:
        slope, intercept = np.polyfit(q_words, a_words, 1)
        result["prediction"] = round(max(float(slope * 10 + intercept), 0))
    return jsonify(result)


# ---------- Matplotlib + Seaborn: charts ----------
@app.post("/api/charts")
def charts():
    df = chat_logger.load_history()
    if len(df) < 2:
        return error_response("Ask at least 2 questions before creating charts.", 400)
    try:
        with lock:                       # pyplot is not thread-safe
            analytics.create_charts(df)
    except Exception as error:
        return error_response(f"Could not create charts: {error}", 500)

    stamp = int(time.time())             # cache-buster so new images show up
    files = ["1_response_time.png", "2_question_vs_answer.png", "3_time_per_chat.png"]
    return jsonify({"charts": [f"/charts/{name}?v={stamp}" for name in files]})


@app.get("/charts/<path:filename>")
def serve_chart(filename):
    return send_from_directory(os.path.abspath(config.CHARTS_DIR), filename)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
