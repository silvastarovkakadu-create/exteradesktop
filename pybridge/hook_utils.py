import bridge


def _no(*a, **k):
    raise bridge.Unsupported("hook_utils: рефлексия по Java-классам недоступна на ПК")


find_class = get_private_field = set_private_field = _no
