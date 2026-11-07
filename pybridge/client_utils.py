"""Совместимое подмножество client_utils."""
import threading

import bridge

PLUGINS_QUEUE = "plugins"
GLOBAL_QUEUE = "global"
STAGE_QUEUE = "stage"


class _User:
    def __init__(self, d):
        self.id = d.get("id", 0)
        self.first_name = d.get("name", "")
        self.username = d.get("username", "")


class _UserConfig:
    def getClientUserId(self):
        return int(bridge.me.get("id") or 0)

    def getCurrentUser(self):
        return _User(bridge.me)

    clientUserId = property(getClientUserId)


class _Account:
    def getUserConfig(self):
        return _UserConfig()


def send_message(params):
    """send_message({"peer": id, "message": "текст", "replyToMsg": id})"""
    g = params.get if isinstance(params, dict) else lambda k, d=None: getattr(params, k, d)
    peer, text = g("peer"), g("message")
    if peer is None or not text:
        return
    reply = g("replyToMsg")
    reply = getattr(reply, "id", reply) if reply is not None else None
    bridge.emit("send_message", peer=int(peer), message=str(text), replyTo=reply if isinstance(reply, int) else None)


send_text = lambda peer, text: send_message({"peer": peer, "message": text})


def run_on_queue(fn, queue=None, delay=0):
    threading.Timer(delay / 1000.0 if delay else 0, fn).start()


def get_account_instance():
    return _Account()


def get_user_config():
    return _UserConfig()


def get_last_fragment():
    return None


def get_messages_controller():
    raise bridge.Unsupported("MessagesController недоступен на ПК")


get_send_messages_helper = get_media_data_controller = get_messages_storage = get_messages_controller
