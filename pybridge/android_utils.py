"""Совместимая заглушка android_utils."""
import threading

import bridge


def log(obj=""):
    bridge.log(obj)


def file_log(obj=""):
    bridge.log(obj)


def run_on_ui_thread(fn, delay=0):
    if delay and delay > 0:
        threading.Timer(delay / 1000.0, fn).start()
    else:
        fn()


def copy_to_clipboard(text):
    bridge.emit("copy", text=str(text))
    return True


class OnClickListener:
    def __init__(self, fn):
        self.fn = fn

    def __call__(self, *a, **k):
        return self.fn(*a, **k)

    onClick = __call__
