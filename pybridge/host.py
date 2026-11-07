"""Python-хост плагинов exteraGram для ExteraDesktop.

Читает JSON-команды из stdin, исполняет .plugin файлы с подменёнными Android-модулями
(base_plugin, ui.settings, client_utils, android_utils …) и отвечает в stdout.
"""
import hashlib
import json
import os
import sys
import traceback
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bridge  # noqa: E402  (переназначает stdout, поэтому импортируем первым)
from base_plugin import BasePlugin, HookStrategy, HookResult  # noqa: E402

entries = {}  # pid -> {cls, inst, actions, onchange}


class NS:
    """dict -> объект с атрибутами (для update-хуков)."""
    def __init__(self, d):
        for k, v in d.items():
            setattr(self, k, wrap(v))


def wrap(v):
    if isinstance(v, dict):
        return NS(v)
    if isinstance(v, list):
        return [wrap(x) for x in v]
    return v


def unwrap(v):
    if isinstance(v, NS):
        return {k: unwrap(x) for k, x in vars(v).items()}
    if isinstance(v, list):
        return [unwrap(x) for x in v]
    return v


class SendParams:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def ser(obj):
    out = {}
    for k, v in vars(obj).items():
        try:
            json.dumps(v)
            out[k] = v
        except TypeError:
            pass
    return out


def strat(res):
    if res is None:
        return "DEFAULT"
    s = getattr(res, "strategy", HookStrategy.DEFAULT)
    return s.name if hasattr(s, "name") else str(s)


# ---------------- команды ----------------
def cmd_load(req):
    path = req["path"]
    with open(path, encoding="utf-8") as f:
        src = f.read()
    modname = "plugin_" + hashlib.md5(path.encode()).hexdigest()[:8]
    mod = types.ModuleType(modname)
    mod.__dict__["__file__"] = path
    exec(compile(src, path, "exec"), mod.__dict__)
    g = mod.__dict__
    classes = [v for v in g.values() if isinstance(v, type) and issubclass(v, BasePlugin) and v is not BasePlugin]
    if not classes:
        raise RuntimeError("В файле не найден класс, наследующий BasePlugin")
    base = os.path.splitext(os.path.basename(path))[0]
    pid = str(g.get("__id__") or base)
    name = g.get("__name__")
    entries[pid] = {"cls": classes[-1], "inst": None, "actions": {}, "onchange": {}}
    return {"meta": {
        "id": pid,
        "name": name if name and name != modname else pid,
        "description": g.get("__description__", ""),
        "author": g.get("__author__", ""),
        "version": str(g.get("__version__", "1.0")),
    }}


def cmd_enable(req):
    pid = req["pid"]
    e = entries[pid]
    bridge.settings[pid] = dict(req.get("settings") or {})
    bridge.me = req.get("me") or {}
    bridge.current_pid = pid
    e["inst"] = e["cls"]()
    e["inst"].on_plugin_load()
    return {"hooks": sorted(e["inst"]._hooks)}


def cmd_disable(req):
    e = entries.get(req["pid"])
    if e and e["inst"]:
        try:
            e["inst"].on_plugin_unload()
        finally:
            e["inst"] = None
    return True


def cmd_settings(req):
    e = entries[req["pid"]]
    e["actions"].clear(); e["onchange"].clear()
    items = []
    for n, it in enumerate(e["inst"].create_settings() or []):
        t = type(it).__name__
        d = {"type": {"Header": "header", "Switch": "switch", "Selector": "select", "Input": "input",
                      "EditText": "input", "Divider": "divider", "Text": "text"}.get(t, "text"),
             "text": getattr(it, "text", "") or ""}
        for k in ("key", "subtext", "default", "items"):
            if hasattr(it, k):
                d[k] = getattr(it, k)
        if d["type"] == "input":
            d["placeholder"] = d.pop("subtext", None) or ""
        if getattr(it, "on_change", None) and getattr(it, "key", None):
            e["onchange"][it.key] = it.on_change
        if getattr(it, "on_click", None):
            e["actions"][n] = it.on_click
            d["type"], d["action"] = "button", n
        items.append(d)
    return items


def cmd_click(req):
    fn = entries[req["pid"]]["actions"].get(req["action"])
    if fn:
        try:
            fn(None)
        except TypeError:
            fn()
    return True


def cmd_setting_changed(req):
    pid, key, val = req["pid"], req["key"], req["value"]
    bridge.settings.setdefault(pid, {})[key] = val
    fn = entries.get(pid, {}).get("onchange", {}).get(key)
    if fn:
        fn(val)
    return True


def cmd_menu_click(req):
    inst = entries[req["pid"]]["inst"]
    fn = inst._menu.get(req["item_id"]) if inst else None
    if fn:
        try:
            fn({})
        except TypeError:
            fn()
    return True


def cmd_send_hook(req):
    inst = entries[req["pid"]]["inst"]
    params = SendParams(**req["params"])
    res = inst.on_send_message_hook(req.get("account", 0), params)
    p = getattr(res, "params", None) or params
    return {"strategy": strat(res), "params": ser(p)}


def cmd_update_hook(req):
    inst = entries[req["pid"]]["inst"]
    upd = wrap(req["update"])
    res = inst.on_update_hook(req["name"], req.get("account", 0), upd)
    u = getattr(res, "update", None) or upd
    text = getattr(getattr(u, "message", None), "message", None)
    return {"strategy": strat(res), "text": text if isinstance(text, str) else None}


COMMANDS = {k[4:]: v for k, v in globals().items() if k.startswith("cmd_")}


def main():
    bridge.emit("ready", python=sys.version.split()[0])
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            bridge.write({"id": rid, "result": COMMANDS[req["cmd"]](req)})
        except SystemExit:
            raise
        except BaseException:
            bridge.write({"id": rid, "error": traceback.format_exc()})


if __name__ == "__main__":
    main()
