"""Совместимый с exteraGram модуль base_plugin."""
from enum import Enum

import bridge


class HookStrategy(Enum):
    DEFAULT = "DEFAULT"
    CANCEL = "CANCEL"
    MODIFY = "MODIFY"
    MODIFY_FINAL = "MODIFY_FINAL"


class HookResult:
    def __init__(self, strategy=HookStrategy.DEFAULT, message=None, params=None,
                 update=None, updates=None, request=None):
        self.strategy = strategy
        self.message = message
        self.params = params
        self.update = update
        self.updates = updates
        self.request = request


class MenuItemType(Enum):
    MESSAGE_CONTEXT_MENU = "MESSAGE_CONTEXT_MENU"
    DRAWER_MENU = "DRAWER_MENU"
    CHAT_ACTION_MENU = "CHAT_ACTION_MENU"
    PROFILE_ACTION_MENU = "PROFILE_ACTION_MENU"


class MenuItemData:
    def __init__(self, menu_type, text, on_click=None, item_id=None, icon=None,
                 subtext=None, condition=None, priority=0):
        self.menu_type = menu_type
        self.text = text
        self.on_click = on_click
        self.item_id = item_id or text
        self.icon = icon
        self.subtext = subtext
        self.condition = condition
        self.priority = priority


class BasePlugin:
    def __new__(cls, *a, **k):
        o = super().__new__(cls)
        o._pid = bridge.current_pid
        o._hooks = set()
        o._menu = {}
        return o

    # ---- жизненный цикл ----
    def on_plugin_load(self):
        pass

    def on_plugin_unload(self):
        pass

    def create_settings(self):
        return []

    # ---- настройки ----
    def get_setting(self, key, default=None):
        return bridge.settings.get(self._pid, {}).get(key, default)

    def set_setting(self, key, value, reload_settings=False):
        bridge.settings.setdefault(self._pid, {})[key] = value
        bridge.emit("set_setting", pid=self._pid, key=key, value=value)

    def log(self, message=""):
        bridge.log(f"{self._pid}:", message)

    # ---- хуки ----
    def add_on_send_message_hook(self, priority=0):
        self._hooks.add("send")

    def remove_on_send_message_hook(self):
        self._hooks.discard("send")

    def add_hook(self, name, match_substring=False, priority=0):
        if str(name).startswith("TL_update"):
            self._hooks.add("update:" + str(name))
        else:
            bridge.log(f"{self._pid}: хук '{name}' недоступен на ПК (поддерживаются TL_update* и on_send_message_hook)")

    def remove_hook(self, name):
        self._hooks.discard("update:" + str(name))

    def on_send_message_hook(self, account, params):
        return HookResult()

    def on_update_hook(self, update_name, account, update):
        return HookResult()

    def on_updates_hook(self, container_name, account, updates):
        return HookResult()

    def pre_request_hook(self, request_name, account, request):
        return HookResult()

    def post_request_hook(self, request_name, account, response, error):
        return HookResult()

    # ---- меню ----
    def add_menu_item(self, item):
        if item.menu_type == MenuItemType.MESSAGE_CONTEXT_MENU:
            bridge.log(f"{self._pid}: пункт контекстного меню сообщения пока не поддерживается на ПК")
            return
        self._menu[item.item_id] = item.on_click
        bridge.emit("menu_add", pid=self._pid, item_id=item.item_id, text=item.text)

    def remove_menu_item(self, item_id):
        self._menu.pop(item_id, None)

    # ---- Java-хуки (Android) ----
    def hook_method(self, *a, **k):
        raise bridge.Unsupported("hook_method: Java-хуки недоступны на ПК")

    hook_all_methods = hook_all_constructors = unhook_method = hook_method
