"""Общий канал связи Python-хоста с Node (JSON-строки через stdin/stdout)."""
import json
import sys
import threading

# stdout занят протоколом — всё, что плагины печатают через print(), уходит в stderr
_real_out = sys.stdout
sys.stdout = sys.stderr
_lock = threading.Lock()

settings = {}      # pid -> dict настроек
me = {}            # данные текущего пользователя
current_pid = None


class Unsupported(RuntimeError):
    """API Android/Telegram-X, которого нет в десктопной версии."""


def write(obj):
    with _lock:
        _real_out.write(json.dumps(obj, ensure_ascii=False, default=str) + "\n")
        _real_out.flush()


def emit(event, **kw):
    write({"event": event, **kw})


def log(*a):
    print("[plugin]", *a, file=sys.stderr, flush=True)
