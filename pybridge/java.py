import bridge


def jclass(name):
    raise bridge.Unsupported(f"jclass('{name}'): Java/Android API недоступен на ПК")


def dynamic_proxy(*a, **k):
    raise bridge.Unsupported("dynamic_proxy: Java/Android API недоступен на ПК")


class JavaException(Exception):
    pass
