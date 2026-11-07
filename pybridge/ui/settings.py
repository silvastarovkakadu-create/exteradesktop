"""Элементы экрана настроек плагина (совместимо с ui.settings из exteraGram)."""


class Header:
    def __init__(self, text):
        self.text = text


class Switch:
    def __init__(self, key, text, default=False, subtext=None, icon=None, on_change=None, link_alias=None):
        self.key, self.text, self.default, self.subtext = key, text, default, subtext
        self.icon, self.on_change, self.link_alias = icon, on_change, link_alias


class Selector:
    def __init__(self, key, text, default=0, items=None, icon=None, on_change=None):
        self.key, self.text, self.default, self.items = key, text, default, list(items or [])
        self.icon, self.on_change = icon, on_change


class Input:
    def __init__(self, key, text, default=None, subtext=None, icon=None, on_change=None):
        self.key, self.text, self.default, self.subtext = key, text, default, subtext
        self.icon, self.on_change = icon, on_change


class Divider:
    def __init__(self, text=None):
        self.text = text


class Text:
    def __init__(self, text, icon=None, accent=False, red=False, on_click=None, create_sub_fragment=None):
        self.text, self.icon, self.accent, self.red = text, icon, accent, red
        self.on_click, self.create_sub_fragment = on_click, create_sub_fragment


EditText = Input
